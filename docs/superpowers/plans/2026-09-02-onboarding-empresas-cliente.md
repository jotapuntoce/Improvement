# Onboarding de cliente: selector de empresas + edificio personalizado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antes de invitar a un cliente real (Jaime Salinas), construir el punto de entrada de
`apps/improvement`: una intro animada con el estado real de construcción de sus empresas, un panel
de íconos grandes para elegir entre ellas, y — al elegir una — un edificio personalizado (mismo
motor visual con el que Jose Carlos ve JotaPuntoCe hoy) que lleva a una recepción y de ahí al
dashboard real de esa organización.

**Architecture:** Se generaliza el edificio existente de `apps/admin`
(`components/building/JotaPuntoCeBuilding.js` + `ReceptionLogin.js`) a dos componentes de props
puros en `packages/ui` (`Building.tsx`, `Reception.tsx`), compartidos por ambas apps —
`transpilePackages` ya incluye `@jotapuntoce/ui` en ambas, así que un `.tsx` sin build propio ya se
importa hoy sin fricción. `apps/admin` pasa a alimentarlos con los datos literales de JotaPuntoCe
(sin cambio visual); `apps/improvement` los alimenta con datos reales de cada organización (`area`,
`organization.slogan`/`accent_color`, ya sea existentes o nuevos). Dos rutas nuevas en
`apps/improvement`: `/empresas` (picker) y `/empresas/[orgId]` (edificio → recepción → dashboard).
Toda la lógica de transformación de datos (distribuir ventanas en la fachada, derivar el badge de
etapa) vive en `server/**` como funciones puras testeadas, siguiendo exactamente el patrón ya
establecido por `server/scene/sceneGraph.ts` + `loadDashboardScene.ts`.

**Tech Stack:** Next.js 16 App Router, TypeScript (`packages/ui`, `apps/improvement`) / JavaScript
(`apps/admin`), Drizzle ORM, Vitest. Sin dependencias nuevas.

**Spec:** [docs/superpowers/specs/2026-09-02-onboarding-empresas-cliente-design.md](../specs/2026-09-02-onboarding-empresas-cliente-design.md)

## Global Constraints

- Sin dependencia nueva sin razón documentada (CLAUDE.md §8) — este plan no agrega ninguna.
- Todo token de color vive en `packages/ui/src/tokens.css`; ningún `.css` define un hex nuevo
  (`.claude/rules/tokens-de-diseno.md`). Los colores por-organización (`area.color`,
  `organization.accent_color`) son datos, no tokens — llegan como valores de props/CSS custom
  properties en tiempo de ejecución, nunca escritos a mano en un archivo `.css`.
- `apps/*/app/**` nunca importa `@jotapuntoce/db` directo — solo vía `apps/*/server/**`
  (CLAUDE.md, tabla de boundaries).
- `apps/*/components/**` y `packages/ui/**` nunca importan `server/` ni `@jotapuntoce/db`
  (mismos boundaries) — `Building.tsx`, `Reception.tsx` y `AppIconLarge.tsx` son props puros, sin
  fetch adentro, igual que `Scene3D.tsx`.
- Ninguna tabla ni columna org-scoped nueva sin su migración correspondiente — este plan solo
  agrega 2 columnas nullable a una tabla existente (`organization`), sin política RLS nueva (RLS es
  por fila, no por columna; `organization` ya tiene su política).
- Import relativo con extensión explícita (`./foo.ts`, nunca `./foo`) en todo `apps/improvement` y
  `packages/ui` (CLAUDE.md §1).
- Toda animación respeta `prefers-reduced-motion: reduce` (`.claude/rules/tokens-de-diseno.md`).
- `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar cualquier tarea por hecha
  (CLAUDE.md, Gate).

---

## Task 1: Schema — `slogan` y `accent_color` en `organization`

**Files:**
- Modify: `packages/db/src/schema.ts` (bloque de `organization`, líneas 29-35)
- Create: migración generada por `pnpm db:generate` (nombre auto-asignado por drizzle-kit)

**Interfaces:**
- Produces: `organization.slogan: string | null`, `organization.accentColor: string | null` —
  usados por Task 9 (`loadBuilding.ts`) y Task 12 (verificación visual de admin).

- [ ] **Step 1: Agregar las columnas al schema**

En `packages/db/src/schema.ts`, cambiar:

```ts
export const organization = pgTable("organization", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
```

por:

```ts
export const organization = pgTable("organization", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Tagline bajo el letrero del edificio (ej. "Eficiencia con Propósito" para JotaPuntoCe). null =
  // el edificio no muestra segunda línea. Ver Building.tsx (packages/ui).
  slogan: text("slogan"),
  // Hex, tono ambiental del edificio/recepción de esta organización (reemplaza --gold ahí). null =
  // usa el tono neutro por default de packages/ui/src/tokens.css.
  accentColor: text("accent_color"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
```

- [ ] **Step 2: Generar la migración**

Run: `pnpm db:generate`
Expected: exit 0, un archivo nuevo en `packages/db/migrations/` que agrega `slogan` y
`accent_color` (ambas nullable) a `organization`. Ambas son `ADD COLUMN` nullable — instantáneo y
seguro en Postgres, sin backfill.

- [ ] **Step 3: Aplicar la migración**

Run: `pnpm db:migrate`
Expected: exit 0.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @jotapuntoce/db typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat(db): agrega slogan y accent_color a organization"
```

---

## Task 2: `distributeCells` + `buildBuildingGraph` — lógica pura, con tests

**Files:**
- Create: `apps/improvement/server/building/buildingGraph.ts`
- Test: `apps/improvement/tests/building-graph.test.ts`

**Interfaces:**
- Consumes: nada (funciones puras, sin dependencias externas).
- Produces: `distributeCells(areaIds: string[], rows: number, cols: number, windowsPerArea:
  number, seed: number): { id: string; cells: [number, number][] }[]`, `buildBuildingGraph(org: {
  name: string; slogan: string | null; accentColor: string | null }, areas: { id: string; name:
  string; color: string }[]): BuildingGraph`, y el tipo `BuildingGraph` — usados por Task 3
  (`loadBuilding.ts`) y, indirectamente (vía ese tipo), por Task 11 (`BuildingExperience.tsx`).

- [ ] **Step 1: Escribir los tests (deben fallar)**

Crear `apps/improvement/tests/building-graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBuildingGraph, distributeCells } from "../server/building/buildingGraph.ts";

describe("distributeCells", () => {
  it(
    "WHEN recibe 3 areaIds, 8 rows, 9 cols y 3 windowsPerArea THE SYSTEM SHALL devolver 3 grupos " +
      "de 3 celdas cada uno, sin celdas repetidas entre grupos",
    () => {
      const result = distributeCells(["a", "b", "c"], 8, 9, 3, 42);

      expect(result).toHaveLength(3);
      for (const group of result) {
        expect(group.cells).toHaveLength(3);
      }

      const allCells = result.flatMap((g) => g.cells.map(([r, c]) => `${r},${c}`));
      expect(new Set(allCells).size).toBe(allCells.length);
    },
  );

  it("WHEN se llama dos veces con el mismo seed THE SYSTEM SHALL devolver exactamente el mismo resultado", () => {
    const first = distributeCells(["a", "b"], 8, 9, 3, 7);
    const second = distributeCells(["a", "b"], 8, 9, 3, 7);
    expect(second).toEqual(first);
  });

  it(
    "WHEN areaIds.length * windowsPerArea excede el total de celdas del grid THE SYSTEM SHALL " +
      "reducir windowsPerArea en vez de lanzar o repetir celdas",
    () => {
      const result = distributeCells(["a", "b", "c", "d", "e"], 2, 2, 3, 1); // grid de 4 celdas, 5 áreas
      const allCells = result.flatMap((g) => g.cells.map(([r, c]) => `${r},${c}`));
      expect(new Set(allCells).size).toBe(allCells.length);
      expect(allCells.length).toBeLessThanOrEqual(4);
    },
  );
});

describe("buildBuildingGraph", () => {
  it(
    "WHEN recibe una organización y sus áreas THE SYSTEM SHALL devolver un area por cada fila, " +
      "cada una con su color real y una lista de cells no vacía",
    () => {
      const graph = buildBuildingGraph(
        { name: "Camibel", slogan: null, accentColor: null },
        [
          { id: "area-1", name: "Ventas", color: "#22d3ee" },
          { id: "area-2", name: "Operaciones", color: "#f87171" },
        ],
      );

      expect(graph.companyName).toBe("Camibel");
      expect(graph.areas).toHaveLength(2);
      expect(graph.areas[0]).toMatchObject({ id: "area-1", name: "Ventas", color: "#22d3ee" });
      expect(graph.areas[0].cells.length).toBeGreaterThan(0);
    },
  );

  it("WHEN se llama dos veces con la misma organización THE SYSTEM SHALL devolver el mismo layout (determinista por nombre)", () => {
    const org = { name: "Afianza", slogan: null, accentColor: null };
    const areas = [{ id: "x", name: "Legal", color: "#4c9b69" }];
    expect(buildBuildingGraph(org, areas)).toEqual(buildBuildingGraph(org, areas));
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/building-graph.test.ts`
Expected: FAIL — `Cannot find module '../server/building/buildingGraph.ts'`

- [ ] **Step 3: Implementar**

Crear `apps/improvement/server/building/buildingGraph.ts`:

```ts
// Lógica pura de layout del edificio — sin acceso a datos (mismo patrón que
// server/scene/sceneGraph.ts). server/building/loadBuilding.ts alimenta esto con datos reales.
export type SilhouetteKind = "plan" | "sol" | "imag" | "valor" | "brand" | "pres" | "generica";

export interface BuildingAreaInput {
  id: string;
  name: string;
  color: string;
  silhouette?: SilhouetteKind;
}

export interface BuildingOrgInput {
  name: string;
  slogan: string | null;
  accentColor: string | null;
}

export interface BuildingArea {
  id: string;
  name: string;
  color: string;
  cells: [number, number][];
  silhouette?: SilhouetteKind;
}

export interface BuildingGraph {
  companyName: string;
  slogan: string | null;
  accentColor: string | null;
  areas: BuildingArea[];
}

const WINDOWS_PER_AREA = 3;
const BUILDING_ROWS = 8;
const BUILDING_COLS = 9;

// mulberry32 — mismo PRNG determinista ya usado en apps/admin/components/building/JotaPuntoCeBuilding.js
// para las estrellas y el parpadeo ambiente. Necesario aquí por el mismo motivo: server y cliente
// deben calcular exactamente el mismo layout, o hay mismatch de hidratación.
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// djb2 — hash de string a entero, determinista, solo para derivar un seed estable por organización
// (mismo layout en cada carga, distinto entre organizaciones distintas).
function hashSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * WHEN distributeCells recibe N areaIds THE SYSTEM SHALL devolver N grupos de celdas
 * (row, col) sin celdas repetidas entre grupos (criterio #1), determinista para el mismo seed
 * (criterio #2), y reduce windowsPerArea en vez de fallar si no caben todas (criterio #3).
 */
export function distributeCells(
  areaIds: string[],
  rows: number,
  cols: number,
  windowsPerArea: number,
  seed: number,
): { id: string; cells: [number, number][] }[] {
  if (areaIds.length === 0) return [];

  const totalCells = rows * cols;
  const perArea = Math.max(1, Math.min(windowsPerArea, Math.floor(totalCells / areaIds.length)));

  const allCells: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) allCells.push([r, c]);
  }

  const rand = mulberry32(seed);
  for (let i = allCells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
  }

  return areaIds.map((id, i) => ({
    id,
    cells: allCells.slice(i * perArea, i * perArea + perArea),
  }));
}

/**
 * WHEN buildBuildingGraph recibe una organización y sus áreas THE SYSTEM SHALL devolver un
 * BuildingGraph con un area por cada fila de entrada, cada una con su color real y su propio grupo
 * de cells (criterio #1) — mismo layout en llamadas repetidas para la misma organización
 * (criterio #2, vía hashSeed determinista sobre el nombre).
 */
export function buildBuildingGraph(org: BuildingOrgInput, areas: BuildingAreaInput[]): BuildingGraph {
  const distributed = distributeCells(
    areas.map((a) => a.id),
    BUILDING_ROWS,
    BUILDING_COLS,
    WINDOWS_PER_AREA,
    hashSeed(org.name),
  );
  const cellsById = new Map(distributed.map((d) => [d.id, d.cells]));

  return {
    companyName: org.name,
    slogan: org.slogan,
    accentColor: org.accentColor,
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      cells: cellsById.get(a.id) ?? [],
      silhouette: a.silhouette,
    })),
  };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/building-graph.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0 ambos.

- [ ] **Step 6: Commit**

```bash
git add apps/improvement/server/building/buildingGraph.ts apps/improvement/tests/building-graph.test.ts
git commit -m "feat(improvement): distributeCells + buildBuildingGraph, puros y testeados"
```

---

## Task 3: `loadBuilding` — puente DB → `buildBuildingGraph`

**Files:**
- Create: `apps/improvement/server/building/loadBuilding.ts`

**Interfaces:**
- Consumes: `buildBuildingGraph`, `BuildingGraph` de Task 2 (`./buildingGraph.ts`).
- Produces: `loadBuilding(orgId: string): Promise<BuildingGraph>` — usado por Task 12
  (`app/empresas/[orgId]/page.tsx`).

- [ ] **Step 1: Implementar**

Crear `apps/improvement/server/building/loadBuilding.ts`:

```ts
// Puente entre datos reales y buildBuildingGraph — apps/*/app/** nunca importa @jotapuntoce/db
// directo (boundaries, CLAUDE.md). Mismo patrón que server/scene/loadDashboardScene.ts.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, organization } from "@jotapuntoce/db/schema";
import { buildBuildingGraph, type BuildingGraph } from "./buildingGraph.ts";

export async function loadBuilding(orgId: string): Promise<BuildingGraph> {
  const [org] = await db
    .select({ name: organization.name, slogan: organization.slogan, accentColor: organization.accentColor })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) throw new Error(`organization ${orgId} no existe`);

  const areas = await db
    .select({ id: area.id, name: area.name, color: area.color })
    .from(area)
    .where(eq(area.orgId, orgId));

  return buildBuildingGraph(org, areas);
}
```

Sin test unitario — es un puente delgado de I/O (consulta 2 tablas y delega toda la lógica a
`buildBuildingGraph`, ya testeado en Task 2), mismo criterio que `loadDashboardScene.ts` hoy.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/improvement/server/building/loadBuilding.ts
git commit -m "feat(improvement): loadBuilding — puente DB para buildBuildingGraph"
```

---

## Task 4: `deriveStageLabel` + `buildCompanyList` — lógica pura, con tests

**Files:**
- Create: `apps/improvement/server/companies/companyList.ts`
- Test: `apps/improvement/tests/company-list.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `deriveStageLabel(stages: StageRow[]): string`, `buildCompanyList(orgs: OrgRow[],
  stagesByOrgId: Map<string, StageRow[]>): CompanySummary[]`, tipos `StageRow`, `OrgRow`,
  `CompanySummary` — usados por Task 5 (`loadCompanies.ts`) y Task 10 (`CompanyPicker.tsx`).

- [ ] **Step 1: Escribir los tests (deben fallar)**

Crear `apps/improvement/tests/company-list.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCompanyList, deriveStageLabel } from "../server/companies/companyList.ts";

describe("deriveStageLabel", () => {
  it("WHEN hay una etapa en_progreso THE SYSTEM SHALL devolver su stageName aunque haya otras completadas", () => {
    const label = deriveStageLabel([
      { stageName: "Análisis", status: "completada" },
      { stageName: "Diseño", status: "en_progreso" },
    ]);
    expect(label).toBe("Diseño");
  });

  it("WHEN no hay ninguna en_progreso pero la última está completada THE SYSTEM SHALL devolver esa", () => {
    expect(deriveStageLabel([{ stageName: "Análisis", status: "completada" }])).toBe("Análisis");
  });

  it("WHEN no hay ninguna etapa THE SYSTEM SHALL devolver 'Sin etapa activa'", () => {
    expect(deriveStageLabel([])).toBe("Sin etapa activa");
  });
});

describe("buildCompanyList", () => {
  it("WHEN hay 2 organizaciones con etapas propias THE SYSTEM SHALL no mezclar las etapas de una con el resumen de la otra", () => {
    const orgs = [
      { id: "org-a", name: "Camibel" },
      { id: "org-b", name: "Afianza" },
    ];
    const stagesByOrgId = new Map([
      ["org-a", [{ stageName: "Análisis", status: "en_progreso" as const }]],
      ["org-b", [{ stageName: "Diseño", status: "completada" as const }]],
    ]);

    expect(buildCompanyList(orgs, stagesByOrgId)).toEqual([
      { orgId: "org-a", name: "Camibel", stageLabel: "Análisis" },
      { orgId: "org-b", name: "Afianza", stageLabel: "Diseño" },
    ]);
  });

  it("WHEN una organización no tiene ninguna fila en stagesByOrgId THE SYSTEM SHALL devolverle 'Sin etapa activa', no lanzar", () => {
    const orgs = [{ id: "org-a", name: "Camibel" }];
    expect(buildCompanyList(orgs, new Map())).toEqual([
      { orgId: "org-a", name: "Camibel", stageLabel: "Sin etapa activa" },
    ]);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/company-list.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

Crear `apps/improvement/server/companies/companyList.ts`:

```ts
// Lógica pura del panel de empresas (/empresas) — misma derivación de etapa actual que ya usa
// apps/admin/app/improvement/page.js (deriveCurrentStageName), portada a TypeScript. Sin acceso a
// datos — server/companies/loadCompanies.ts alimenta esto con filas reales.
export interface StageRow {
  stageName: string;
  status: "bloqueada" | "en_progreso" | "completada";
}

export interface OrgRow {
  id: string;
  name: string;
}

export interface CompanySummary {
  orgId: string;
  name: string;
  stageLabel: string;
}

/**
 * WHEN hay una etapa en_progreso THE SYSTEM SHALL devolver su stageName, con prioridad sobre
 * cualquier etapa completada (criterio #1). WHEN no hay ninguna en_progreso pero la última está
 * completada THE SYSTEM SHALL devolver esa (criterio #2). WHEN no hay ninguna etapa THE SYSTEM
 * SHALL devolver "Sin etapa activa" (criterio #3).
 */
export function deriveStageLabel(stages: StageRow[]): string {
  const inProgress = stages.find((s) => s.status === "en_progreso");
  if (inProgress) return inProgress.stageName;

  const last = stages[stages.length - 1];
  if (last?.status === "completada") return last.stageName;

  return "Sin etapa activa";
}

/**
 * WHEN buildCompanyList recibe N organizaciones THE SYSTEM SHALL devolver N CompanySummary, cada
 * uno con el stageLabel derivado únicamente de sus propias etapas (criterio #1) — nunca mezcla
 * etapas entre organizaciones distintas.
 */
export function buildCompanyList(orgs: OrgRow[], stagesByOrgId: Map<string, StageRow[]>): CompanySummary[] {
  return orgs.map((org) => ({
    orgId: org.id,
    name: org.name,
    stageLabel: deriveStageLabel(stagesByOrgId.get(org.id) ?? []),
  }));
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/company-list.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0 ambos.

- [ ] **Step 6: Commit**

```bash
git add apps/improvement/server/companies/companyList.ts apps/improvement/tests/company-list.test.ts
git commit -m "feat(improvement): deriveStageLabel + buildCompanyList, puros y testeados"
```

---

## Task 5: `loadCompanies` — puente DB → `buildCompanyList`

**Files:**
- Create: `apps/improvement/server/companies/loadCompanies.ts`

**Interfaces:**
- Consumes: `buildCompanyList`, tipos `StageRow`/`CompanySummary` de Task 4 (`./companyList.ts`).
- Produces: `loadCompanies(userId: string): Promise<CompanySummary[]>` — usado por Task 10
  (`app/empresas/page.tsx`).

- [ ] **Step 1: Implementar**

Crear `apps/improvement/server/companies/loadCompanies.ts`:

```ts
// Puente entre datos reales y buildCompanyList — apps/*/app/** nunca importa @jotapuntoce/db
// directo (boundaries, CLAUDE.md).
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, orgBuildStage } from "@jotapuntoce/db/schema";
import { buildCompanyList, type CompanySummary, type StageRow } from "./companyList.ts";

export async function loadCompanies(userId: string): Promise<CompanySummary[]> {
  const orgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(membership.acceptedAt));

  if (orgs.length === 0) return [];

  const orgIds = orgs.map((o) => o.id);
  const stages = await db
    .select()
    .from(orgBuildStage)
    .where(inArray(orgBuildStage.orgId, orgIds))
    .orderBy(asc(orgBuildStage.stageOrder));

  const stagesByOrgId = new Map<string, StageRow[]>();
  for (const stage of stages) {
    const list = stagesByOrgId.get(stage.orgId) ?? [];
    list.push({ stageName: stage.stageName, status: stage.status as StageRow["status"] });
    stagesByOrgId.set(stage.orgId, list);
  }

  return buildCompanyList(orgs, stagesByOrgId);
}
```

Sin test unitario — puente delgado de I/O, mismo criterio que `loadDashboardScene.ts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/improvement/server/companies/loadCompanies.ts
git commit -m "feat(improvement): loadCompanies — puente DB para buildCompanyList"
```

---

## Task 6: Tokens y CSS compartidos — `--building-accent` + `packages/ui/src/building.css`

El bloque CSS del edificio (`.jpc-*`) hoy vive solo en `apps/admin/app/globals.css` — para que
`apps/improvement` también lo tenga disponible, se mueve completo a `packages/ui`, con las 4 reglas
de color fijo (`--gold`/`--sign-glow`) cambiadas a `--building-accent` (dinámico por organización,
default = `--gold`). Se agregan también las clases del panel `/empresas`
(`.empresas-*`, `.app-icon-large-*`) al mismo archivo — mismo lugar, misma familia visual.

**Files:**
- Modify: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/building.css` (contenido movido + adaptado desde
  `apps/admin/app/globals.css` líneas 807-1058, más las clases nuevas de `/empresas`)
- Modify: `apps/admin/app/globals.css` (quitar el bloque movido, agregar el `@import`)
- Modify: `apps/improvement/app/globals.css` (agregar el `@import`)
- Modify: `packages/ui/package.json` (exportar `./building.css`)

**Interfaces:**
- Produces: clases `.jpc-*`, `.empresas-*`, `.app-icon-large-*`, variable `--building-accent` —
  consumidas por Task 7/8 (`Building.tsx`/`Reception.tsx`), Task 9 (migración de admin) y Task 10
  (`CompanyPicker.tsx`/`AppIconLarge.tsx`).

- [ ] **Step 1: Agregar `--building-accent` a los tokens**

En `packages/ui/src/tokens.css`, justo después de la línea `--gold: #cf9f3d;`, agregar:

```css
  /* Tono ambiental del edificio/recepción (packages/ui/src/building.css) — default = --gold.
     Una organización con accent_color propio lo sobreescribe como CSS custom property inline en
     el wrapper .jpc-scene (ver BuildingExperience.tsx), nunca aquí — este es solo el default. */
  --building-accent: var(--gold);
```

- [ ] **Step 2: Crear `packages/ui/src/building.css`**

Copiar el bloque completo `/* ===== Building / recepción (login) ===== */` de
`apps/admin/app/globals.css` (desde el comentario en la línea 807 hasta `.jpc-back-link:hover`,
justo antes de la línea 1090 donde termina el bloque `.jpc-*`) a un archivo nuevo
`packages/ui/src/building.css`, con estos 5 cambios de valor (todo lo demás se copia tal cual):

1. `.jpc-reception-eyebrow { color: var(--gold); }` → `color: var(--building-accent);`
2. `.jpc-reception-word { color: var(--sign-glow); }` → `color: var(--building-accent);`
3. `.jpc-field-label { color: var(--gold); }` → `color: var(--building-accent);`
4. `.jpc-field-input:focus-visible { outline: 2px solid var(--gold); }` → `outline: 2px solid var(--building-accent);`
5. `.jpc-reception-submit { background: linear-gradient(135deg, var(--desk-top), var(--gold)); }` → `background: linear-gradient(135deg, var(--desk-top), var(--building-accent));`

Y agregar, al final del archivo, esta regla nueva (necesaria para que `Reception.tsx` — Task 8 —
pueda recibir un `<form>` como children sin perder el layout flex/gap de `.jpc-reception-card`):

```css
/* Reception.tsx (packages/ui) acepta cualquier children — cuando es un <form> (caso de
   apps/admin, login real), display:contents lo "aplana" para que sus campos hereden el
   flex/gap de .jpc-reception-card directo, igual que antes de generalizar el componente. */
.jpc-reception-card > form {
  display: contents;
}
```

Y agregar también, al final, las clases nuevas del panel `/empresas`:

```css
/* ===== Panel de empresas (/empresas, apps/improvement) ===== */
.empresas-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, var(--sky-top), var(--sky-bot) 70%);
  padding: 40px 20px;
}

.empresas-intro {
  text-align: center;
  animation: empresas-intro-fade 0.5s ease both;
}
@keyframes empresas-intro-fade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.empresas-intro-label {
  font-family: var(--font-geist-mono), monospace;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 12px;
}
.empresas-intro-company {
  font-size: 28px;
  font-weight: 800;
  color: var(--sign-glow);
  margin: 0;
}
.empresas-intro-stage {
  font-size: 15px;
  color: var(--building-accent);
  margin: 8px 0 0;
}

.empresas-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  justify-content: center;
  max-width: 720px;
}
.empresas-tile {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.empresas-tile:focus-visible {
  outline: 2px solid var(--accent-2);
  outline-offset: 6px;
  border-radius: var(--radius-md);
}

@media (prefers-reduced-motion: reduce) {
  .empresas-intro { animation: none; }
}

/* ===== AppIconLarge (packages/ui/src/building/AppIconLarge.tsx) ===== */
.app-icon-large-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.app-icon-large {
  position: relative;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  overflow: hidden;
  transition: transform 0.15s ease, filter 0.15s ease;
}
.empresas-tile:hover .app-icon-large,
.empresas-tile:focus-visible .app-icon-large {
  transform: scale(1.04);
  filter: brightness(1.08);
}
.app-icon-large-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 12px 12px;
}
.app-icon-large-shine {
  position: absolute;
  top: -30%;
  left: -10%;
  width: 60%;
  height: 160%;
  background: rgba(255, 255, 255, 0.14);
  transform: rotate(20deg);
}
.app-icon-large-glyph {
  position: relative;
  z-index: 1;
}
.app-icon-large-badge {
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border);
  color: var(--building-accent);
}
.app-icon-large-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
@media (prefers-reduced-motion: reduce) {
  .app-icon-large { transition: none; }
}
```

- [ ] **Step 3: Quitar el bloque movido de `apps/admin/app/globals.css` y agregar el import**

En `apps/admin/app/globals.css`, cambiar la línea 2 de:

```css
@import "@jotapuntoce/ui/tokens.css";
```

a:

```css
@import "@jotapuntoce/ui/tokens.css";
@import "@jotapuntoce/ui/building.css";
```

Y eliminar el bloque completo `/* ===== Building / recepción (login) ===== */` (el mismo rango que
se copió en el Step 2) de este archivo — ya vive en `packages/ui/src/building.css`.

- [ ] **Step 4: Importar en `apps/improvement/app/globals.css`**

Cambiar:

```css
@import "tailwindcss";
@import "@jotapuntoce/ui/tokens.css";
```

a:

```css
@import "tailwindcss";
@import "@jotapuntoce/ui/tokens.css";
@import "@jotapuntoce/ui/building.css";
```

- [ ] **Step 5: Exportar el CSS nuevo desde `packages/ui`**

En `packages/ui/package.json`, cambiar:

```json
  "exports": {
    "./tokens.css": "./src/tokens.css"
  }
```

a:

```json
  "exports": {
    "./tokens.css": "./src/tokens.css",
    "./building.css": "./src/building.css"
  }
```

- [ ] **Step 6: Verificar que ambos builds compilan**

Run: `pnpm --filter @jotapuntoce/admin build && pnpm --filter @jotapuntoce/improvement build`
Expected: exit 0 ambos — la verificación visual real (que `/login` de admin se vea idéntico) ocurre
en Task 9, después de que `LoginExperience.js` vuelva a apuntar a los componentes reales.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/tokens.css packages/ui/src/building.css packages/ui/package.json apps/admin/app/globals.css apps/improvement/app/globals.css
git commit -m "feat(ui): mueve el CSS del edificio a packages/ui, agrega --building-accent"
```

---

## Task 7: `Building.tsx` — componente compartido en `packages/ui`

Generaliza `apps/admin/components/building/JotaPuntoCeBuilding.js` a props puros. Toda la
geometría del grid, las estrellas, el parpadeo ambiente y los 6 arquetipos de siluetas se copian
tal cual (sin cambio) — solo cambia lo que antes era hardcodeado y ahora llega como prop.

**Advertencia de secuencia:** el `git mv` del Step 1 deja roto el import de
`apps/admin/components/building/LoginExperience.js` (`import JotaPuntoCeBuilding from
"./JotaPuntoCeBuilding"` ya no resuelve) hasta que Task 9 lo actualice. Es esperado — `pnpm
--filter @jotapuntoce/admin build` da error en este punto intermedio, no es una regresión que haya
que perseguir. No hacer deploy ni marcar el plan en pausa entre Task 7 y Task 9; ejecutarlas
seguidas.

**Files:**
- Create: `packages/ui/src/building/Building.tsx` (contenido base: `git mv` desde
  `apps/admin/components/building/JotaPuntoCeBuilding.js`, luego los cambios de este task)
- Modify: `packages/ui/package.json` (exportar `./building/Building.tsx`)

**Interfaces:**
- Consumes: tipos `BuildingArea`, `SilhouetteKind` de Task 2 (`apps/improvement/server/building/buildingGraph.ts`) — como referencia de forma, no como import real (`packages/ui` no depende de `apps/improvement`; el tipo se redeclara localmente, ver Step 2).
- Produces: `Building({ companyName, slogan?, areas, onEnter }): JSX.Element` — usado por Task 9
  (admin) y Task 11 (`BuildingExperience.tsx`, improvement).

- [ ] **Step 1: Mover el archivo**

```bash
mkdir -p packages/ui/src/building
git mv apps/admin/components/building/JotaPuntoCeBuilding.js packages/ui/src/building/Building.tsx
```

- [ ] **Step 2: Reemplazar el bloque de datos hardcodeados por tipos + props**

En `packages/ui/src/building/Building.tsx`, cambiar (líneas 32-54 del archivo original):

```js
// 3 ventanas por área, repartidas en todo el ancho del edificio (antes las columnas 6-8 quedaban
// vacías — Jose Carlos pidió más presencia en las esquinas superior e inferior derecha).
const ZONES = [
  { key: "imag", color: "var(--dept-imaginacion)", cells: [[0, 1], [0, 6], [1, 8]] },
  { key: "plan", color: "var(--dept-planeacion)", cells: [[0, 4], [1, 3], [2, 7]] },
  { key: "sol", color: "var(--dept-soluciones)", cells: [[2, 8], [3, 5], [6, 8]] },
  { key: "valor", color: "var(--dept-valor)", cells: [[3, 1], [3, 7], [4, 4]] },
  { key: "brand", color: "var(--dept-branding)", cells: [[4, 8], [5, 6], [6, 2]] },
  { key: "pres", color: "var(--dept-presentacion)", cells: [[5, 3], [6, 1], [7, 7]] },
];

const TOTAL_LIT = ZONES.reduce((n, z) => n + z.cells.length, 0);
// 2.6s entre turno y turno, encendida ~2.4s de eso (ver @keyframes jpc-window-turn en
// globals.css) — suficiente para que el gesto del científico (loops de 1.3-1.8s) se vea completo
// al menos una vez antes de apagar.
const STAGGER = 2.6;
const CYCLE = TOTAL_LIT * STAGGER;

const CELL_META = {};
let seq = 0;
for (const zone of ZONES) {
  for (const [row, col] of zone.cells) {
    CELL_META[`${row},${col}`] = { zone, seq: seq++ };
  }
}
```

por:

```ts
export type SilhouetteKind = "plan" | "sol" | "imag" | "valor" | "brand" | "pres" | "generica";

export interface BuildingArea {
  id: string;
  name: string;
  color: string;
  cells: [number, number][];
  silhouette?: SilhouetteKind;
}

export interface BuildingProps {
  companyName: string;
  slogan?: string;
  areas: BuildingArea[];
  onEnter: () => void;
}

// 2.6s entre turno y turno, encendida ~2.4s de eso (ver @keyframes jpc-window-turn en
// packages/ui/src/building.css) — suficiente para que el gesto de la silueta (loops de 1.3-1.8s)
// se vea completo al menos una vez antes de apagar. Fijo, no varía por organización.
const STAGGER = 2.6;
```

- [ ] **Step 3: Mover el cómputo de `CELL_META`/`CYCLE`/circuito dentro del componente, derivado de `areas`**

Cambiar la firma y el cuerpo del componente. De:

```js
export default function JotaPuntoCeBuilding({ onEnter }) {
  const [entering, setEntering] = useState(false);
  const [tagX, setTagX] = useState(null);
  const wordRef = useRef(null);
```

a:

```tsx
export function Building({ companyName, slogan, areas, onEnter }: BuildingProps) {
  const [entering, setEntering] = useState(false);
  const [tagX, setTagX] = useState<number | null>(null);
  const wordRef = useRef<SVGTextElement>(null);

  const { cellMeta, cycle, circuitPoints, circuitD } = useMemo(() => {
    const totalLit = areas.reduce((n, a) => n + a.cells.length, 0);
    const meta: Record<string, { area: BuildingArea; seq: number }> = {};
    let seq = 0;
    for (const a of areas) {
      for (const [row, col] of a.cells) {
        meta[`${row},${col}`] = { area: a, seq: seq++ };
      }
    }

    const points = areas.map((a) => {
      const sum = a.cells.reduce(
        (acc, [row, col]) => {
          const c = cellCenter(row, col);
          return { x: acc.x + c.x, y: acc.y + c.y };
        },
        { x: 0, y: 0 },
      );
      return { x: sum.x / a.cells.length, y: sum.y / a.cells.length };
    });

    let d = points.length ? `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}` : "";
    for (let p = 1; p < points.length; p++) {
      const prev = points[p - 1];
      const cur = points[p];
      const midX = (prev.x + cur.x) / 2;
      d += ` L ${midX.toFixed(1)} ${prev.y.toFixed(1)} L ${midX.toFixed(1)} ${cur.y.toFixed(1)} L ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
    }

    return { cellMeta: meta, cycle: totalLit * STAGGER, circuitPoints: points, circuitD: d };
  }, [areas]);
```

Y agregar el import de `useMemo` en la línea de imports (`import { useEffect, useMemo, useRef, useState } from "react";`).

Esto reemplaza también la función module-level `circuitPath()` (ya no existe — su lógica vive
ahora dentro de este `useMemo`) y la constante module-level `CIRCUIT_POINTS`.

- [ ] **Step 4: Actualizar las referencias en el render**

Reemplazar cada referencia según esta tabla (todo lo demás del render — grid de ventanas, fachada,
letrero, puerta, estrellas — se queda exactamente igual):

| Antes | Ahora |
|---|---|
| `CELL_META[...]` | `cellMeta[...]` |
| `${meta.seq * STAGGER}s`, `${CYCLE}s` | sin cambio (siguen siendo `meta.seq` y `cycle`, ya en scope) |
| `fill={meta.zone.color}` | `fill={meta.area.color}` |
| `<use href={`#jpc-ic-${meta.zone.key}`} .../>` | `<use href={`#jpc-ic-${meta.area.silhouette ?? "generica"}`} .../>` |
| `<path d={circuitPath()} .../>` | `<path d={circuitD} .../>` |
| `{CIRCUIT_POINTS.map((pt, i) => (<circle ... fill={ZONES[i].color} />))}` | `{circuitPoints.map((pt, i) => (<circle ... fill={areas[i].color} />))}` |
| `<text ...>JOTAPUNTOCE</text>` (wordmark, con `ref={wordRef}`) | `<text ...>{companyName}</text>` |
| `{tagX !== null && (<text ...>Eficiencia con Propósito</text>)}` | `{tagX !== null && slogan && (<text ...>{slogan}</text>)}` |
| `stroke="var(--gold)"` (borde de fachada) | `stroke="var(--building-accent)"` |
| `stroke="var(--gold)"` (marco de puerta) | `stroke="var(--building-accent)"` |
| `fill="var(--gold)"` (perilla de puerta) | `fill="var(--building-accent)"` |

`var(--building-accent)` funciona igual que `var(--gold)` funcionaba antes — es un custom property
CSS heredado del DOM ancestro (`.jpc-scene`, ver Task 11), no un prop de React.

- [ ] **Step 5: Agregar el 7° símbolo (silueta genérica)**

Dentro de `ScientistDefs()`, después del último `<symbol id="jpc-ic-pres" ...>` y su `</symbol>`
de cierre, agregar:

```jsx
      <symbol id="jpc-ic-generica" viewBox="0 0 24 24" fill="#04060d">
        <path d="M6.4 5.6 L7.4 1 L9 4.8 L10.4 0.4 L12 5 L13.6 0.4 L15 4.8 L16.6 1 L17.6 5.6 Z" />
        <circle cx="12" cy="7.6" r="3.2" />
        <path d="M8 22 L8.3 17 C8.3 12.6 9.6 11.4 12 11.4 C14.4 11.4 15.7 12.6 15.7 17 L16 22 L13.2 22 L12.9 17.4 L11.1 17.4 L10.8 22 Z" />
        <rect className="jpc-gesture-pulse" x="6.6" y="13.6" width="1.6" height="5.6" rx=".8" transform="rotate(-6 7.4 16.4)" />
        <rect className="jpc-gesture-pulse" style={{ animationDelay: ".4s" }} x="15.8" y="13.6" width="1.6" height="5.6" rx=".8" transform="rotate(6 16.6 16.4)" />
      </symbol>
```

Reutiliza exactamente la cabeza/pelo/torso ya probado de los 6 símbolos existentes (mismo path,
copiado tal cual) con brazos en reposo simples — silueta neutra, sin herramienta específica, para
cualquier organización que no defina un arquetipo propio.

- [ ] **Step 6: Exportar desde `packages/ui`**

En `packages/ui/package.json`, agregar a `exports`:

```json
    "./building/Building.tsx": "./src/building/Building.tsx"
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @jotapuntoce/ui exec tsc --noEmit --jsx react-jsx --esModuleInterop --skipLibCheck src/building/Building.tsx`

Si `packages/ui` no tiene `typescript` como devDependency todavía, agregarlo primero:
`pnpm --filter @jotapuntoce/ui add -D typescript@~6.0.3` (misma versión que `apps/improvement`, ver
`apps/improvement/package.json`).

Expected: exit 0, sin errores de tipos.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/building/Building.tsx packages/ui/package.json
git commit -m "feat(ui): generaliza JotaPuntoCeBuilding a Building.tsx, componente compartido"
```

---

## Task 8: `Reception.tsx` — componente compartido en `packages/ui`

**Files:**
- Create: `packages/ui/src/building/Reception.tsx` (contenido base: `git mv` desde
  `apps/admin/components/building/ReceptionLogin.js`, luego los cambios de este task)
- Modify: `packages/ui/package.json` (exportar `./building/Reception.tsx`)

**Interfaces:**
- Consumes: nada de otros tasks.
- Produces: `Reception({ companyName, greeting, onBack, children }): JSX.Element` — usado por Task 9
  (admin) y Task 11 (`BuildingExperience.tsx`, improvement).

- [ ] **Step 1: Mover el archivo**

```bash
git mv apps/admin/components/building/ReceptionLogin.js packages/ui/src/building/Reception.tsx
```

- [ ] **Step 2: Generalizar — de un `<form>` fijo a `children`**

Reemplazar todo el contenido de `packages/ui/src/building/Reception.tsx`:

```tsx
"use client";

// Recepción compartida — lo que aparece después del zoom del edificio (ver Building.tsx). El
// contenido interactivo de la tarjeta (el form de login real de apps/admin, o el botón "Entrar a
// tu dashboard" de apps/improvement) llega como children — Reception solo pone la ambientación de
// mostrador/recepción y el botón "Volver afuera", iguales para cualquier organización.
import type { ReactNode } from "react";

export interface ReceptionProps {
  companyName: string;
  greeting: string;
  onBack: () => void;
  children: ReactNode;
}

export function Reception({ companyName, greeting, onBack, children }: ReceptionProps) {
  return (
    <div className="jpc-reception">
      <div className="jpc-reception-wall">
        <p className="jpc-reception-eyebrow">Recepción</p>
        <p className="jpc-reception-word">{companyName}</p>
        <p className="jpc-reception-sub">{greeting}</p>
      </div>
      <div className="jpc-reception-card">
        {children}
        <button className="jpc-back-link" type="button" onClick={onBack}>
          ← Volver afuera
        </button>
      </div>
    </div>
  );
}
```

`.jpc-reception-card > form { display: contents; }` (agregada en Task 6) es lo que hace que un
`<form>` pasado como children (caso de admin) herede el `display:flex; flex-direction:column;
gap:14px` de `.jpc-reception-card` en vez de romper el layout — sin eso, los campos del form
quedarían apilados sin espacio entre ellos.

- [ ] **Step 3: Exportar desde `packages/ui`**

En `packages/ui/package.json`, agregar a `exports`:

```json
    "./building/Reception.tsx": "./src/building/Reception.tsx"
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @jotapuntoce/ui exec tsc --noEmit --jsx react-jsx --esModuleInterop --skipLibCheck src/building/Reception.tsx`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/building/Reception.tsx packages/ui/package.json
git commit -m "feat(ui): generaliza ReceptionLogin a Reception.tsx, componente compartido"
```

---

## Task 9: Migrar `apps/admin` a los componentes compartidos

**Files:**
- Create: `apps/admin/components/building/jotaPuntoCeData.js`
- Modify: `apps/admin/components/building/LoginExperience.js`

**Interfaces:**
- Consumes: `Building` (Task 7), `Reception` (Task 8) de `@jotapuntoce/ui`.
- Produces: nada nuevo — `/login` sigue funcionando igual, ahora sobre los componentes
  compartidos.

- [ ] **Step 1: Crear la data literal de JotaPuntoCe**

Crear `apps/admin/components/building/jotaPuntoCeData.js` con los datos exactos que antes vivían
hardcodeados dentro de `JotaPuntoCeBuilding.js` (mismas 6 áreas, mismos colores, mismas 18 celdas —
cero cambio visual):

```js
// Datos literales de JotaPuntoCe para Building.tsx (packages/ui) — identidad de marca de la
// plataforma, no dato de cliente, por eso vive como constante aquí y no en la base de datos (ver
// .claude/rules/motor-generico.md: la regla de "todo en datos" aplica a organizaciones cliente,
// JotaPuntoCe no es una fila de `organization`).
export const JOTAPUNTOCE_COMPANY_NAME = "JOTAPUNTOCE";
export const JOTAPUNTOCE_SLOGAN = "Eficiencia con Propósito";

// Mismas 6 áreas, mismos colores, mismas celdas que antes tenía ZONES en JotaPuntoCeBuilding.js —
// portado tal cual, sin recalcular con distributeCells (ese algoritmo es para organizaciones
// cliente sin layout curado a mano).
export const JOTAPUNTOCE_AREAS = [
  { id: "imag", name: "Imaginación", color: "var(--dept-imaginacion)", silhouette: "imag", cells: [[0, 1], [0, 6], [1, 8]] },
  { id: "plan", name: "Planeación", color: "var(--dept-planeacion)", silhouette: "plan", cells: [[0, 4], [1, 3], [2, 7]] },
  { id: "sol", name: "Soluciones", color: "var(--dept-soluciones)", silhouette: "sol", cells: [[2, 8], [3, 5], [6, 8]] },
  { id: "valor", name: "Valor agregado", color: "var(--dept-valor)", silhouette: "valor", cells: [[3, 1], [3, 7], [4, 4]] },
  { id: "brand", name: "Branding", color: "var(--dept-branding)", silhouette: "brand", cells: [[4, 8], [5, 6], [6, 2]] },
  { id: "pres", name: "Presentación", color: "var(--dept-presentacion)", silhouette: "pres", cells: [[5, 3], [6, 1], [7, 7]] },
];
```

- [ ] **Step 2: Actualizar `LoginExperience.js`**

Reemplazar todo el contenido de `apps/admin/components/building/LoginExperience.js`:

```jsx
"use client";

// Orquesta la transición: edificio (exterior) -> zoom -> recepción (login real). Building y
// Reception (packages/ui) son ambos "tontos" — reciben props/children y no saben nada del otro ni
// de JotaPuntoCe específicamente; esa data vive en ./jotaPuntoCeData.js.
import { useState } from "react";
import { Building } from "@jotapuntoce/ui/building/Building.tsx";
import { Reception } from "@jotapuntoce/ui/building/Reception.tsx";
import { JOTAPUNTOCE_AREAS, JOTAPUNTOCE_COMPANY_NAME, JOTAPUNTOCE_SLOGAN } from "./jotaPuntoCeData";

export default function LoginExperience({ signInAction, hasError }) {
  const [entered, setEntered] = useState(false);

  return (
    <div className="jpc-scene">
      {entered ? (
        <Reception companyName={JOTAPUNTOCE_COMPANY_NAME} greeting="Bienvenido de vuelta" onBack={() => setEntered(false)}>
          <form action={signInAction}>
            <label className="jpc-field-label">
              Email
              <input className="jpc-field-input" type="email" name="email" required />
            </label>
            <label className="jpc-field-label">
              Contraseña
              <input className="jpc-field-input" type="password" name="password" required />
            </label>
            {hasError && <p className="jpc-reception-error">Email o contraseña incorrectos.</p>}
            <button className="jpc-reception-submit" type="submit">
              Entrar
            </button>
          </form>
        </Reception>
      ) : (
        <Building
          companyName={JOTAPUNTOCE_COMPANY_NAME}
          slogan={JOTAPUNTOCE_SLOGAN}
          areas={JOTAPUNTOCE_AREAS}
          onEnter={() => setEntered(true)}
        />
      )}
    </div>
  );
}
```

Nota: el botón "← Volver afuera" ya no se pasa a mano — `Reception` lo renderiza internamente
ahora (Task 8).

- [ ] **Step 3: Lint + build**

Run: `pnpm --filter @jotapuntoce/admin lint && pnpm --filter @jotapuntoce/admin build`
Expected: exit 0 ambos.

- [ ] **Step 4: Verificación visual — sin regresión**

Usar el Browser tool: `preview_start` con la app admin (`pnpm dev:admin`), navegar a `/login`.

Confirmar contra el comportamiento de antes de este plan:
- El edificio se ve igual (6 áreas, mismas posiciones de ventana, mismos colores dorados en
  puerta/marco/letrero).
- Las ventanas siguen encendiendo una por una, con el científico correspondiente visible.
- Clic en el edificio hace zoom y pasa a la recepción con el formulario de email/contraseña.
- "← Volver afuera" regresa al edificio.
- Un login con credenciales inválidas muestra "Email o contraseña incorrectos."

Si algo se ve distinto, diagnosticar contra la tabla de Task 7 Step 4 antes de continuar — no
avanzar con una regresión visual sin resolver.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/building/jotaPuntoCeData.js apps/admin/components/building/LoginExperience.js
git commit -m "refactor(admin): /login usa Building.tsx y Reception.tsx compartidos, sin cambio visual"
```

---

## Task 10: `AppIconLarge.tsx` + panel `/empresas`

**Files:**
- Create: `packages/ui/src/building/AppIconLarge.tsx`
- Modify: `packages/ui/package.json` (exportar `./building/AppIconLarge.tsx`)
- Create: `apps/improvement/app/empresas/CompanyPicker.tsx`
- Create: `apps/improvement/app/empresas/page.tsx`

**Interfaces:**
- Consumes: `loadCompanies` (Task 5), `getSessionUserId` (ya existe en `server/auth/guard.ts`).
- Produces: ruta `/empresas` — usada por Task 12 (`app/page.tsx`).

- [ ] **Step 1: `AppIconLarge.tsx`**

Crear `packages/ui/src/building/AppIconLarge.tsx`:

```tsx
// Variante grande de AppIcon.js (apps/admin) para el panel /empresas — mismo lenguaje visual
// (degradado, grid, brillo), con un badge de etapa de construcción en vez de un contador de
// actividad. CSS en packages/ui/src/building.css (.app-icon-large-*).
export interface AppIconLargeProps {
  label: string;
  stageLabel: string;
  size?: number;
}

export function AppIconLarge({ label, stageLabel, size = 96 }: AppIconLargeProps) {
  const glyphSize = Math.round(size * 0.42);

  return (
    <span className="app-icon-large-wrap" style={{ width: size }}>
      <span className="app-icon-large" style={{ width: size, height: size }}>
        <span className="app-icon-large-grid" aria-hidden="true" />
        <span className="app-icon-large-shine" aria-hidden="true" />
        <svg
          className="app-icon-large-glyph"
          width={glyphSize}
          height={glyphSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      </span>
      <span className="app-icon-large-badge">{stageLabel}</span>
      <span className="app-icon-large-label">{label}</span>
    </span>
  );
}
```

En `packages/ui/package.json`, agregar a `exports`:

```json
    "./building/AppIconLarge.tsx": "./src/building/AppIconLarge.tsx"
```

- [ ] **Step 2: `CompanyPicker.tsx` — intro animada + grilla**

Crear `apps/improvement/app/empresas/CompanyPicker.tsx`:

```tsx
"use client";

// Efecto "Rappi": una intro breve que recorre el estado real de cada empresa del cliente antes de
// asentarse en la grilla de íconos grandes — no texto genérico, siempre companies[] real (Task 5).
// Cada ícono conserva su badge de etapa después de la intro (ver AppIconLarge, packages/ui).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIconLarge } from "@jotapuntoce/ui/building/AppIconLarge.tsx";
import type { CompanySummary } from "@/server/companies/companyList.ts";

const INTRO_MS_PER_COMPANY = 700;

export function CompanyPicker({ companies }: { companies: CompanySummary[] }) {
  const router = useRouter();
  const [introIndex, setIntroIndex] = useState(0);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (introDone) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIntroDone(true);
      return;
    }
    if (introIndex >= companies.length) {
      setIntroDone(true);
      return;
    }
    const timer = window.setTimeout(() => setIntroIndex((i) => i + 1), INTRO_MS_PER_COMPANY);
    return () => window.clearTimeout(timer);
  }, [introIndex, introDone, companies.length]);

  if (!introDone) {
    const current = companies[introIndex];
    return (
      <div className="empresas-intro" role="status">
        <p className="empresas-intro-label">Revisando tus empresas…</p>
        <p className="empresas-intro-company">{current.name}</p>
        <p className="empresas-intro-stage">{current.stageLabel}</p>
      </div>
    );
  }

  return (
    <div className="empresas-grid">
      {companies.map((c) => (
        <button key={c.orgId} type="button" className="empresas-tile" onClick={() => router.push(`/empresas/${c.orgId}`)}>
          <AppIconLarge label={c.name} stageLabel={c.stageLabel} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `app/empresas/page.tsx`**

Crear `apps/improvement/app/empresas/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { loadCompanies } from "@/server/companies/loadCompanies.ts";
import { CompanyPicker } from "./CompanyPicker.tsx";

export default async function EmpresasPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const companies = await loadCompanies(userId);

  return (
    <main className="empresas-page">
      {companies.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Todavía no tienes ninguna empresa asignada.
        </p>
      ) : (
        <CompanyPicker companies={companies} />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Lint + typecheck + build**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck && pnpm --filter @jotapuntoce/improvement build`
Expected: exit 0 los tres. (`packages/ui` también debe re-verificarse: `pnpm --filter @jotapuntoce/ui exec tsc --noEmit --jsx react-jsx --esModuleInterop --skipLibCheck src/building/AppIconLarge.tsx`, exit 0.)

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/building/AppIconLarge.tsx packages/ui/package.json apps/improvement/app/empresas/
git commit -m "feat(improvement): panel /empresas — efecto Rappi + grilla de íconos grandes"
```

---

## Task 11: `BuildingExperience.tsx` + ruta `/empresas/[orgId]`

**Files:**
- Create: `apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx`
- Create: `apps/improvement/app/empresas/[orgId]/page.tsx`

**Interfaces:**
- Consumes: `Building` (Task 7), `Reception` (Task 8) de `@jotapuntoce/ui`; `loadBuilding` (Task
  3); `requireOrgMembership` (ya existe en `server/auth/guard.ts`); tipo `BuildingGraph` (Task 2).
- Produces: ruta `/empresas/[orgId]` — usada por Task 10 (`CompanyPicker.tsx`, ya enlaza aquí).

- [ ] **Step 1: `BuildingExperience.tsx` — orquestador cliente**

Crear `apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx`:

```tsx
"use client";

// Orquesta la transición: edificio -> zoom -> recepción -> dashboard real. Mismo patrón que
// apps/admin/components/building/LoginExperience.js, pero el botón final de la recepción navega en
// vez de someter un login (Jaime ya está autenticado al llegar aquí — requireOrgMembership ya
// corrió en page.tsx). accent_color de la organización se aplica una sola vez, en este wrapper —
// Building.tsx y Reception.tsx lo heredan vía CSS custom property, ninguno de los dos lo recibe
// como prop.
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Building } from "@jotapuntoce/ui/building/Building.tsx";
import { Reception } from "@jotapuntoce/ui/building/Reception.tsx";
import type { BuildingGraph } from "@/server/building/buildingGraph.ts";

export function BuildingExperience({ orgId, graph }: { orgId: string; graph: BuildingGraph }) {
  const [entered, setEntered] = useState(false);
  const router = useRouter();

  const sceneStyle = graph.accentColor
    ? ({ "--building-accent": graph.accentColor } as CSSProperties)
    : undefined;

  return (
    <div className="jpc-scene" style={sceneStyle}>
      {entered ? (
        <Reception companyName={graph.companyName} greeting="Bienvenido de vuelta" onBack={() => setEntered(false)}>
          <button type="button" className="jpc-reception-submit" onClick={() => router.push(`/${orgId}/dashboard`)}>
            Entrar a tu dashboard
          </button>
        </Reception>
      ) : (
        <Building
          companyName={graph.companyName}
          slogan={graph.slogan ?? undefined}
          areas={graph.areas}
          onEnter={() => setEntered(true)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: `page.tsx` — guard + carga de datos**

Crear `apps/improvement/app/empresas/[orgId]/page.tsx`:

```tsx
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { loadBuilding } from "@/server/building/loadBuilding.ts";
import { BuildingExperience } from "./BuildingExperience.tsx";

export default async function EmpresaBuildingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await requireOrgMembership(orgId);
  const graph = await loadBuilding(orgId);

  return <BuildingExperience orgId={orgId} graph={graph} />;
}
```

Mismo guard que ya usa `app/[org]/dashboard/page.tsx` — un usuario sin membership en `orgId`
recibe 404, nunca 403 (regla ya establecida en `server/auth/guard.ts`).

- [ ] **Step 3: Lint + typecheck + build**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck && pnpm --filter @jotapuntoce/improvement build`
Expected: exit 0 los tres.

- [ ] **Step 4: Commit**

```bash
git add "apps/improvement/app/empresas/[orgId]/"
git commit -m "feat(improvement): ruta /empresas/[orgId] — edificio personalizado + recepción"
```

---

## Task 12: `/` redirige a `/empresas`

**Files:**
- Modify: `apps/improvement/app/page.tsx`
- Modify: `apps/improvement/server/auth/guard.ts` (quitar `resolveHomeOrgId`, ya sin uso)

**Interfaces:**
- Consumes: `getSessionUserId` (ya existe en `server/auth/guard.ts`).
- Produces: nada nuevo — cierra el flujo completo (`/` → `/empresas` → `/empresas/[orgId]` →
  `/[org]/dashboard`).

- [ ] **Step 1: Confirmar que `resolveHomeOrgId` no se usa en ningún otro lado**

Run: `grep -rn "resolveHomeOrgId" apps/improvement --include="*.ts" --include="*.tsx"`
Expected: solo 2 resultados — la definición en `guard.ts` y el uso en `page.tsx` (el que este task
reemplaza). Si aparece un tercer resultado, no borrar la función — ajustar este task a mano antes
de continuar.

- [ ] **Step 2: Actualizar `app/page.tsx`**

Reemplazar todo el contenido de `apps/improvement/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";

// `/` nunca es una página en sí — reparte: con sesión, al panel de empresas (/empresas, que a su
// vez lleva al edificio de la que elija y de ahí a su dashboard real); sin sesión, a /login.
export default async function Page() {
  const userId = await getSessionUserId();
  redirect(userId ? "/empresas" : "/login");
}
```

- [ ] **Step 3: Quitar `resolveHomeOrgId` de `guard.ts`**

En `apps/improvement/server/auth/guard.ts`, eliminar la función completa (el bloque de comentario
JSDoc + la función, líneas 66-87 del archivo original):

```ts
/**
 * Resuelve a qué org debe entrar la sesión actual al visitar `/` (app/page.tsx) — el id del primer
 * org al que pertenece, ordenado por `accepted_at`. `null` si no hay sesión o el usuario no tiene
 * ningún membership todavía (ambos casos: la ruta que llama esto redirige a `/login`). Devuelve el
 * `id`, no el `slug` — el segmento `[org]` de cada ruta de esta app es el uuid de organization
 * (`app/[org]/dashboard/page.tsx` y el resto hacen `const { org: orgId } = await params`), pese al
 * nombre de la carpeta.
 */
export async function resolveHomeOrgId(): Promise<string | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [row] = await db
    .select({ id: organization.id })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(membership.acceptedAt))
    .limit(1);

  return row?.id ?? null;
}
```

Si tras quitarla el import `asc` de `drizzle-orm` queda sin uso en otro lado del archivo, quitarlo
también del import (el resto — `and`, `eq` — sigue en uso por `findMembership`/`assertMembership`).

- [ ] **Step 4: Lint + typecheck + tests**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck && pnpm --filter @jotapuntoce/improvement test`
Expected: exit 0 los tres.

- [ ] **Step 5: Commit**

```bash
git add apps/improvement/app/page.tsx apps/improvement/server/auth/guard.ts
git commit -m "feat(improvement): / redirige a /empresas en vez de saltar directo al dashboard"
```

---

## Task 13: Gate completo + verificación visual end-to-end

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Gate completo del monorepo**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: exit 0 en los 4, sin excepciones.

- [ ] **Step 2: Verificación visual — `apps/improvement`, con un usuario real**

Usar el Browser tool: `preview_start` con `pnpm dev:improvement`, iniciar sesión con una cuenta que
tenga membership en al menos 1 organización con filas en `area` (ej. Camibel, si ya se provisionó
en una sesión anterior — o cualquier organización de prueba con `area` poblada).

Confirmar:
- Tras el login, la URL termina en `/empresas` (no en `/[orgId]/dashboard` directo).
- Aparece la intro animada citando el nombre real de la empresa y su etapa real (no texto
  genérico), y se asienta en la grilla.
- El ícono grande muestra el nombre de la organización y el badge de etapa.
- Clic en el ícono navega a `/empresas/[orgId]` y muestra el edificio — ventanas encendiendo una
  por una, con las áreas reales de esa organización (no las 6 de JotaPuntoCe).
- Clic en el edificio hace zoom y pasa a una recepción con el nombre real de la empresa y un botón
  "Entrar a tu dashboard" (sin campos de email/contraseña — el usuario ya está autenticado).
- Ese botón navega a `/[orgId]/dashboard` y el dashboard real (con Scene3D) carga normalmente, sin
  cambios respecto a como funcionaba antes de este plan.

- [ ] **Step 3: Verificación de aislamiento — un usuario sin membership**

Navegar directo a `/empresas/<uuid-de-una-org-a-la-que-el-usuario-logueado-no-pertenece>`.
Expected: 404 (nunca 403), mismo comportamiento que ya tiene `/[org]/dashboard` hoy.

- [ ] **Step 4: Confirmar cero regresión en `apps/admin`**

Repetir la verificación visual de Task 9 Step 4 una vez más, ya con todo el plan aplicado (no solo
con Task 9 aislado) — mismo resultado esperado, edificio de JotaPuntoCe idéntico a como se veía
antes de empezar este plan.

- [ ] **Step 5: Commit final (si algo quedó sin commitear)**

```bash
git status --short
```

Si hay cambios pendientes, revisar qué son antes de commitear — no debería haber ninguno si cada
task anterior comiteó lo suyo.
