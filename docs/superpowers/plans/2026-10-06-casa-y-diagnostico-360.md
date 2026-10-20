# La casa y el Diagnóstico 360 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda empresa del motor tenga su Diagnóstico 360 (12 dimensiones, madurez 1–5): el dueño lo contesta
en la app, Improvement lo evalúa (hoy Claude con un script) y el dueño lo aprueba con un clic. Al aprobarlo quedan
cargadas sus áreas, necesidades, objetivos, memoria, piso, paso del proceso y la configuración de su CRM/ERP.
JotaPuntoCe entra como la "casa".

**Architecture:**
- **Datos:** tres tablas nuevas org-scoped con RLS solo para el dueño (`diagnosis`, `diagnosis_answer`,
  `org_digital_config`) y cuatro cambios a tablas existentes.
- **Lógica en `apps/improvement/server/diagnostico/`:**
  - `cuestionario.ts`: datos puros, compartidos por la app y la skill.
  - `resultado.ts`: el esquema zod del resultado.
  - `mutations.ts`: lo del dueño, con guard.
  - `evaluacion.ts`: lo del sistema, sin guard ni Next, para que el script y la futura API lo llamen igual.
- **Pantallas:**
  - `/[org]/diagnostico` en la app;
  - en el admin: la tarjeta de la casa, "abrir diagnóstico" y "por evaluar".

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript 6 (improvement) / JS (admin), Drizzle 0.45 +
Postgres (Supabase dev), zod 4, Vitest 4, Node 24 (`--experimental-strip-types` para scripts).

**Spec:** `docs/superpowers/specs/2026-10-06-casa-y-diagnostico-360-design.md`

## Global Constraints

- Gate antes de marcar una tarea hecha: `pnpm lint && pnpm typecheck && pnpm test` en verde.
- Import relativo con extensión explícita (`./resultado.ts`); `@/` es la raíz de cada app; sin barrel files.
- Toda tabla nueva con `org_id` lleva su política RLS en el mismo cambio. Política **solo SELECT y solo del dueño**
  (`membership.role = 'owner'`), mismo patrón que `packages/db/migrations/0018_oval_silverclaw.sql`.
- Nunca editar a mano `packages/db/migrations/`. El esquema se cambia en `packages/db/src/schema.ts` y se genera
  con `pnpm db:generate`; las políticas van en una migración `--custom`.
- Motor genérico: ningún archivo de `packages/db/**` ni `apps/*/server/**` nombra un org, una empresa o una persona.
  La casa se encuentra por `organization.is_home`.
- Errores como resultados: `{ ok: true, data } | { ok: false, error: { code, message } }`. Se valida con zod en el
  borde.
- Claude nunca lee ni edita archivos `.env*`; los scripts los cargan con `process.loadEnvFile`.
- Sin dependencias nuevas.
- Textos de UI en español de México, voz casual-formal. "Paso del proceso", nunca "nivel", para Arranque…Autonomía.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Antes de empezar (lo hace quien coordina, no una tarea)

- Trabajar en una rama nueva `casa-diagnostico` sacada de `chequeos` (que ya trae todo lo de `main` más el
  Chequeo), en un worktree (`superpowers:using-git-worktrees`). Juntar `chequeos` y esta rama a `main` es un PR
  aparte que se abre con el OK del dueño.
- En el worktree, `apps/improvement/.env.local`, `apps/improvement/.env.test` y `apps/admin/.env.local` no existen:
  el dueño los copia, o el coordinador los copia sin leerlos (`cp` de la carpeta original).

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `packages/db/src/schema.ts` (modificar) | `organization.isHome/floor`, `orgNeed.diagnosisId`, check de `owner_memory.topic`, tablas `diagnosis`, `diagnosisAnswer`, `orgDigitalConfig` |
| `packages/db/migrations/00NN_*.sql` (generadas) | Esquema + RLS |
| `apps/improvement/server/diagnostico/cuestionario.ts` (nuevo) | Las preguntas, `CUESTIONARIO_VERSION`, `escalaDe`, `preguntasActivas`, `valorSchemaPara` |
| `apps/improvement/server/diagnostico/resultado.ts` (nuevo) | `diagnosisResultSchema`, `ordenarPatogenos`, `DIMENSIONES`, `ETAPAS` |
| `apps/improvement/server/diagnostico/evaluacion.ts` (nuevo) | `readForEvaluation`, `saveDiagnosisResult` (sistema) |
| `apps/improvement/server/diagnostico/mutations.ts` (nuevo) | `getDiagnosis`, `saveAnswer`, `submitDiagnosis`, `approveDiagnosis`, `rejectDiagnosis` (dueño) |
| `apps/improvement/scripts/diagnostico.ts` (nuevo) | `leer <id>` / `guardar <id> <archivo>` para la skill |
| `apps/improvement/app/[org]/diagnostico/page.tsx` (nuevo) | Contestar, esperar, revisar y aprobar |
| `apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx` (modificar) | Puerta "Tu diagnóstico" |
| `apps/improvement/server/building/*.ts`, `packages/ui/src/building/Building.tsx` (modificar) | Letrero "Piso N · paso" |
| `apps/admin/lib/casa.js` (nuevo) | La casa y los diagnósticos por evaluar |
| `apps/admin/components/DashboardView.js`, `apps/admin/app/page.js`, `apps/admin/lib/orgStats.js`, `apps/admin/app/improvement/page.js`, `apps/admin/app/organizations/[orgId]/page.js` (modificar) | Tarjeta de la casa, excluirla de listas, abrir diagnóstico |
| `packages/db/src/seed-casa.ts` (nuevo) | Crea la fila de la casa y su membresía de dueño |
| `apps/improvement/tests/diagnostico-*.test.ts` (nuevos) | Pruebas |

---

### Task 1: Esquema, migraciones y RLS

**Files:**
- Modify: `packages/db/src/schema.ts`
- Generate: `packages/db/migrations/00NN_<auto>.sql` (esquema), `packages/db/migrations/00NN_diagnosis_rls.sql` (custom)
- Test: `apps/improvement/tests/diagnostico-rls.test.ts`

**Interfaces:**
- Produces (exports de `@jotapuntoce/db/schema`): `diagnosis`, `diagnosisAnswer`, `orgDigitalConfig`; columnas
  `organization.isHome` (boolean, default false), `organization.floor` (integer, default 1), `orgNeed.diagnosisId`
  (uuid nullable); `owner_memory.topic` acepta `'diagnostico'`.

- [ ] **Step 1: Escribir el esquema.** En `packages/db/src/schema.ts`:
  - en `organization`, después de `evolutionLevel`:
```ts
  // La casa: la organización de JotaPuntoCe dentro del mismo motor. Las listas de clientes del admin la excluyen
  // y el admin la encuentra por esta bandera, nunca por nombre (.claude/rules/motor-generico.md).
  isHome: boolean("is_home").notNull().default(false),
  // El piso del edificio en el que va el negocio: su escala real, sin tope (improvement-edificio.md). El paso del
  // proceso dentro del piso (Arranque…Autonomía) es evolutionLevel.
  floor: integer("floor").notNull().default(1),
```
  - en `orgNeed`, después de `referralNote`:
```ts
    // De qué diagnóstico salió. null = la registró el dueño a mano.
    diagnosisId: uuid("diagnosis_id").references(() => diagnosis.id, { onDelete: "set null" }),
```
  - en `ownerMemory`, cambiar el check a:
```ts
    check("owner_memory_topic_check", sql`${t.topic} in ('arranque','observacion','diagnostico')`),
```
  - al final del archivo:
```ts
/**
 * El Diagnóstico 360 de una empresa en un piso (spec 2026-10-06-casa-y-diagnostico-360-design.md, §4). Uno por piso;
 * al subir se abre otro y el anterior queda como historia. Solo el dueño lo ve: es el juicio de Improvement sobre
 * su empresa, igual que org_need.
 */
export const diagnosis = pgTable(
  "diagnosis",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    floor: integer("floor").notNull(),
    status: text("status").notNull().default("contestando"),
    questionnaireVersion: text("questionnaire_version").notNull(),
    result: jsonb("result"),
    reviewNote: text("review_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_diagnosis_org_id").on(t.orgId),
    // Un solo diagnóstico abierto por empresa.
    uniqueIndex("uq_diagnosis_org_open").on(t.orgId).where(sql`${t.status} <> 'aprobado'`),
    check("diagnosis_status_check", sql`${t.status} in ('contestando','evaluando','listo','aprobado')`),
    check("diagnosis_floor_positive", sql`${t.floor} >= 1`),
  ],
);

/** Una respuesta por pregunta. Se corrige mientras el diagnóstico está en `contestando`; al enviarlo queda fija. */
export const diagnosisAnswer = pgTable(
  "diagnosis_answer",
  {
    id: id(),
    diagnosisId: uuid("diagnosis_id").notNull().references(() => diagnosis.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    value: jsonb("value").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_diagnosis_answer").on(t.diagnosisId, t.questionId),
    index("idx_diagnosis_answer_org_id").on(t.orgId),
  ],
);

/**
 * La empresa digital por dentro: la configuración de su CRM y su ERP que sale del diagnóstico aprobado. Las
 * pantallas que la leen son las piezas 2 (CRM) y 3 (ERP). Una fila por empresa; se reemplaza al aprobar el
 * diagnóstico de un piso nuevo.
 */
export const orgDigitalConfig = pgTable(
  "org_digital_config",
  {
    id: id(),
    orgId: uuid("org_id").notNull().unique().references(() => organization.id, { onDelete: "cascade" }),
    diagnosisId: uuid("diagnosis_id").references(() => diagnosis.id, { onDelete: "set null" }),
    crm: jsonb("crm").notNull(),
    erp: jsonb("erp").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);
```
  `orgNeed` se declara antes que `diagnosis`. Drizzle acepta la referencia perezosa (`() => diagnosis.id`), así que
  no hace falta mover tablas.

- [ ] **Step 2: Generar la migración de esquema.** Run: `pnpm db:generate`. Expected: un archivo nuevo en
  `packages/db/migrations/` con `CREATE TABLE "diagnosis"`, `"diagnosis_answer"`, `"org_digital_config"`, los
  `ALTER TABLE` y el check nuevo de `owner_memory`. Leer el SQL generado y confirmar que el índice parcial salió con
  `WHERE`.

- [ ] **Step 3: Generar la migración de RLS.** Run: `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=diagnosis_rls`
  y escribir en el archivo vacío que genera:
```sql
-- RLS de las tablas del Diagnóstico 360 (spec 2026-10-06-casa-y-diagnostico-360-design.md, §4).
-- Solo SELECT y solo el dueño: el diagnóstico es el juicio de Improvement sobre la empresa, igual que org_need en
-- 0018. Toda escritura pasa por server/** con el cliente `db`, que bypasea RLS por diseño.
alter table diagnosis enable row level security;
create policy "owners read their org's diagnosis"
  on diagnosis for select
  using (exists (select 1 from membership m
    where m.org_id = diagnosis.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on diagnosis to authenticated;

alter table diagnosis_answer enable row level security;
create policy "owners read their org's diagnosis answers"
  on diagnosis_answer for select
  using (exists (select 1 from membership m
    where m.org_id = diagnosis_answer.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on diagnosis_answer to authenticated;

-- Por ahora solo el dueño. Cuando existan las pantallas de CRM/ERP (piezas 2 y 3), su plan decide qué parte ve cada
-- tipo de permiso; abrirlo aquí antes sería dar acceso a algo que nadie diseñó todavía.
alter table org_digital_config enable row level security;
create policy "owners read their org's digital config"
  on org_digital_config for select
  using (exists (select 1 from membership m
    where m.org_id = org_digital_config.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on org_digital_config to authenticated;
```
  Esto es un archivo **generado por drizzle-kit** en el que se escribe el SQL de la política. Es el flujo documentado en
  `.claude/rules/base-de-datos.md`, no una edición a mano de una migración existente.

- [ ] **Step 4: Aplicar.** Run: `pnpm db:migrate`. Expected: termina sin error contra el Supabase de desarrollo.

- [ ] **Step 5: La prueba de RLS.** Crear `apps/improvement/tests/diagnostico-rls.test.ts`:
```ts
// RLS de las tablas del Diagnóstico 360: el dueño lee, el empleado y el dueño de otra empresa no. Mismo helper
// asUser que tests/permissions.test.ts (set_config de role y request.jwt.claims dentro de una transacción).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { diagnosis, diagnosisAnswer, membership, organization, orgDigitalConfig, profile } from "@jotapuntoce/db/schema";

const orgs: string[] = [];
const people: string[] = [];
afterEach(async () => {
  for (const id of orgs.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of people.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function makeOrg() {
  const [o] = await db.insert(organization).values({ name: "Org diag", slug: `diag-rls-${crypto.randomUUID()}` }).returning();
  orgs.push(o!.id);
  return o!;
}
async function makeMember(orgId: string, role: "owner" | "employee") {
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
  await db.insert(membership).values({ userId, orgId, role, acceptedAt: new Date() });
  people.push(userId);
  return userId;
}
async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

describe("RLS — Diagnóstico 360", () => {
  it("WHEN el dueño consulta THE SYSTEM SHALL ver su diagnóstico, sus respuestas y su configuración; el empleado y otro dueño no ven nada", async () => {
    const org = await makeOrg();
    const otra = await makeOrg();
    const dueno = await makeMember(org.id, "owner");
    const empleado = await makeMember(org.id, "employee");
    const otroDueno = await makeMember(otra.id, "owner");
    const [d] = await db.insert(diagnosis).values({ orgId: org.id, floor: 1, questionnaireVersion: "test" }).returning();
    await db.insert(diagnosisAnswer).values({ diagnosisId: d!.id, orgId: org.id, questionId: "esc-personas", value: { numero: 1 } });
    await db.insert(orgDigitalConfig).values({ orgId: org.id, diagnosisId: d!.id, crm: {}, erp: {} });

    for (const tabla of ["diagnosis", "diagnosis_answer", "org_digital_config"]) {
      const q = `select org_id from ${tabla} where org_id = '${org.id}'`;
      expect(await asUser(dueno, q)).toHaveLength(1);
      expect(await asUser(empleado, q)).toHaveLength(0);
      expect(await asUser(otroDueno, q)).toHaveLength(0);
    }
  });

  it("WHEN hay un diagnóstico abierto THE SYSTEM SHALL rechazar un segundo abierto, pero aceptar uno nuevo si el anterior está aprobado", async () => {
    const org = await makeOrg();
    await db.insert(diagnosis).values({ orgId: org.id, floor: 1, questionnaireVersion: "test" });
    await expect(db.insert(diagnosis).values({ orgId: org.id, floor: 1, questionnaireVersion: "test" })).rejects.toThrow();
    await db.update(diagnosis).set({ status: "aprobado" }).where(sql`${diagnosis.orgId} = ${org.id}`);
    await expect(db.insert(diagnosis).values({ orgId: org.id, floor: 2, questionnaireVersion: "test" })).resolves.toBeDefined();
  });
});
```

- [ ] **Step 6: Correr.** Run: `pnpm --filter improvement test tests/diagnostico-rls.test.ts`. Expected: 2 passed.

- [ ] **Step 7: Gate y commit.**
```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/diagnostico-rls.test.ts
git commit -m "feat(db): el Diagnóstico 360 — diagnosis, respuestas, configuración CRM/ERP y la casa, con RLS del dueño"
```

---

### Task 2: El cuestionario (datos puros) · 🚪 Puerta del dueño

**Files:**
- Create: `apps/improvement/server/diagnostico/cuestionario.ts`
- Test: `apps/improvement/tests/diagnostico-cuestionario.test.ts`

**Interfaces:**
- Produces:
  - `CUESTIONARIO_VERSION: string`
  - `type Pregunta = { id; dimension: 0..12; tipo: "escala"|"madurez"|"evidencia"|"abierta"|"prioridad"; entrada: "nivel"|"numero"|"texto"|"opcion"|"lista"; texto; ayuda?; opciones?: string[]; aplicaSi?: "con_equipo"|"con_producto"; prellenado?: "chequeo"|"sitio"|"instagram"|"google" }`
  - `PREGUNTAS: Pregunta[]` (en orden de aparición; `dimension: 0` = escala o prioridad)
  - `MADUREZ: string[]` (5 etiquetas)
  - `type Valor = { nivel?: 1..5; numero?: number; texto?: string; opcion?: string; lista?: string[] }`
  - `valorSchemaPara(p: Pregunta): z.ZodType<Valor>`
  - `escalaDe(respuestas: Map<string, Valor>): Set<"con_equipo"|"con_producto">`
  - `preguntasActivas(respuestas: Map<string, Valor>): Pregunta[]`

- [ ] **Step 1: Escribir la prueba.**
```ts
import { describe, expect, it } from "vitest";
import { MADUREZ, PREGUNTAS, escalaDe, preguntasActivas, valorSchemaPara, type Valor } from "../server/diagnostico/cuestionario.ts";

const r = (o: Record<string, Valor>) => new Map(Object.entries(o));

describe("cuestionario", () => {
  it("cubre las 12 dimensiones, abre con la escala y cierra con la prioridad", () => {
    const dims = new Set(PREGUNTAS.filter((p) => p.dimension > 0).map((p) => p.dimension));
    expect([...dims].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(PREGUNTAS[0]!.tipo).toBe("escala");
    expect(PREGUNTAS.at(-1)!.tipo).toBe("prioridad");
    expect(new Set(PREGUNTAS.map((p) => p.id)).size).toBe(PREGUNTAS.length);
    expect(MADUREZ).toEqual(["No existe", "Informal", "Documentado", "Medido", "Optimizado o automatizado"]);
  });

  it("cada dimensión trae madurez y una abierta; las de madurez se contestan con nivel", () => {
    for (let d = 1; d <= 12; d++) {
      const ps = PREGUNTAS.filter((p) => p.dimension === d);
      expect(ps.some((p) => p.tipo === "madurez")).toBe(true);
      expect(ps.some((p) => p.tipo === "abierta")).toBe(true);
    }
    for (const p of PREGUNTAS.filter((x) => x.tipo === "madurez")) expect(p.entrada).toBe("nivel");
  });

  it("un negocio de una persona no ve las preguntas de equipo; con producto ve las de proveedores", () => {
    const solo = preguntasActivas(r({ "esc-personas": { numero: 1 }, "esc-vende": { opcion: "Servicios" } }));
    expect(solo.some((p) => p.aplicaSi === "con_equipo")).toBe(false);
    const equipo = escalaDe(r({ "esc-personas": { numero: 4 }, "esc-vende": { opcion: "Productos" } }));
    expect([...equipo].sort()).toEqual(["con_equipo", "con_producto"]);
    expect(preguntasActivas(r({})).length).toBeLessThanOrEqual(52);
    expect(solo.length).toBeGreaterThanOrEqual(35);
  });

  it("valida el valor según la entrada", () => {
    const nivel = PREGUNTAS.find((p) => p.entrada === "nivel")!;
    expect(valorSchemaPara(nivel).safeParse({ nivel: 3 }).success).toBe(true);
    expect(valorSchemaPara(nivel).safeParse({ nivel: 6 }).success).toBe(false);
    const lista = PREGUNTAS.find((p) => p.entrada === "lista")!;
    expect(valorSchemaPara(lista).safeParse({ lista: ["a", "b", "c"] }).success).toBe(true);
    expect(valorSchemaPara(lista).safeParse({ lista: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `pnpm --filter improvement test tests/diagnostico-cuestionario.test.ts`. Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Escribir el cuestionario.** `apps/improvement/server/diagnostico/cuestionario.ts`:
```ts
// El cuestionario del Diagnóstico 360 (spec 2026-10-06-casa-y-diagnostico-360-design.md, §3; las 12 dimensiones
// de Diagnostico_360_Contexto_y_12_Dimensiones.pdf). Datos puros y genéricos: lo leen la app para mostrarlo y la
// skill `improvement` para evaluar, así los dos dan el mismo resultado. Sin giros, empresas ni nombres
// (.claude/rules/motor-generico.md). Cambiar un texto = subir CUESTIONARIO_VERSION (queda en cada diagnóstico).
import { z } from "zod";

export const CUESTIONARIO_VERSION = "2026-10-06.1";

export const MADUREZ = ["No existe", "Informal", "Documentado", "Medido", "Optimizado o automatizado"];

export type Escala = "con_equipo" | "con_producto";
export interface Pregunta {
  id: string;
  dimension: number; // 0 = escala o prioridad; 1..12 = las dimensiones del PDF
  tipo: "escala" | "madurez" | "evidencia" | "abierta" | "prioridad";
  entrada: "nivel" | "numero" | "texto" | "opcion" | "lista";
  texto: string;
  ayuda?: string;
  opciones?: string[];
  aplicaSi?: Escala;
  prellenado?: "chequeo" | "sitio" | "instagram" | "google";
}
export interface Valor {
  nivel?: number;
  numero?: number;
  texto?: string;
  opcion?: string;
  lista?: string[];
}

const madurez = (id: string, dimension: number, texto: string, ayuda?: string, aplicaSi?: Escala): Pregunta => ({
  id, dimension, tipo: "madurez", entrada: "nivel", texto, ...(ayuda && { ayuda }), ...(aplicaSi && { aplicaSi }),
});
const abierta = (id: string, dimension: number, texto: string, aplicaSi?: Escala): Pregunta => ({
  id, dimension, tipo: "abierta", entrada: "texto", texto, ...(aplicaSi && { aplicaSi }),
});
const evidencia = (id: string, dimension: number, entrada: Pregunta["entrada"], texto: string, extra: Partial<Pregunta> = {}): Pregunta => ({
  id, dimension, tipo: "evidencia", entrada, texto, ...extra,
});

export const PREGUNTAS: Pregunta[] = [
  // Escala: decide qué se apaga y el piso de partida.
  { id: "esc-personas", dimension: 0, tipo: "escala", entrada: "numero", texto: "¿Cuántas personas trabajan en tu negocio, contándote a ti?" },
  { id: "esc-clientes", dimension: 0, tipo: "escala", entrada: "numero", texto: "¿Cuántos clientes atiendes en un mes normal?" },
  { id: "esc-ingreso", dimension: 0, tipo: "escala", entrada: "opcion", texto: "¿Cuánto vende tu negocio en un mes normal, aproximadamente?", opciones: ["Menos de $50 mil", "$50 mil a $200 mil", "$200 mil a $1 millón", "Más de $1 millón", "Prefiero no decirlo"] },
  { id: "esc-anios", dimension: 0, tipo: "escala", entrada: "numero", texto: "¿Cuántos años lleva operando?" },
  { id: "esc-vende", dimension: 0, tipo: "escala", entrada: "opcion", texto: "¿Qué vendes?", opciones: ["Servicios", "Productos", "Las dos cosas"] },

  // 5 · Dueño, liderazgo y vida personal (va primero: el negocio no crece más que su dueño).
  abierta("d5-busca", 5, "Si tu negocio te diera exactamente lo que buscas, ¿qué tendrías en tu vida? Libertad, patrimonio, tiempo con tu familia, legado, impacto, venderlo algún día… dilo con tus palabras."),
  madurez("d5-dependencia", 5, "Un día normal, ¿qué tanto opera tu negocio sin que tú decidas o apagues fuegos?", "1 = todo pasa por mí · 5 = opera solo y yo dirijo"),
  evidencia("d5-horas", 5, "numero", "¿Cuántas horas a la semana le dedicas al negocio?"),
  abierta("d5-ausencia", 5, "Si faltaras dos semanas sin teléfono, ¿qué se detendría primero?"),
  abierta("d5-sueno", 5, "¿Qué te quita el sueño hoy de tu negocio?"),

  // 1 · Estrategia, propósito y visión
  madurez("d1-plan", 1, "Tu visión y tus metas del año: ¿están escritas y las conoce quien trabaja contigo?"),
  evidencia("d1-meta", 1, "texto", "¿Cuál es tu meta para los próximos 12 meses? En ventas, clientes o lo que tú midas."),
  evidencia("d1-dependencia", 1, "numero", "¿Qué porcentaje de tus ventas viene de tu cliente más grande?", { ayuda: "Si no lo sabes, pon tu mejor cálculo." }),
  abierta("d1-porque", 1, "¿Por qué tu mejor cliente te compra a ti y no a tu competencia?", undefined),

  // 2 · Finanzas y salud económica
  madurez("d2-control", 2, "Tus ingresos, gastos y utilidad del mes: ¿cómo los llevas?"),
  madurez("d2-separadas", 2, "¿Están separadas tus finanzas personales de las del negocio?"),
  evidencia("d2-caja", 2, "texto", "¿Cuánto dinero tiene hoy el negocio y para cuántos meses de gastos alcanza?", { ayuda: "Si no lo sabes, dilo: también es una respuesta." }),
  evidencia("d2-margen", 2, "texto", "¿Cuánto te queda de cada venta de tu producto o servicio principal, después de lo que te cuesta?"),
  abierta("d2-decision", 2, "¿Qué decisión de dinero te cuesta más trabajo tomar?"),

  // 3 · Operaciones y procesos
  madurez("d3-procesos", 3, "Cómo se vende, se entrega y se cobra en tu negocio: ¿está escrito paso a paso?"),
  madurez("d3-calidad", 3, "¿Cómo mides la calidad de lo que entregas, los errores y lo que hay que rehacer?"),
  abierta("d3-atora", 3, "¿En qué paso se atora más el trabajo?"),
  abierta("d3-persona", 3, "¿Qué depende de una sola persona y se cae si ella falta?"),

  // 4 · Personas, talento y empleados (se apaga si trabajas solo)
  madurez("d4-roles", 4, "¿Cada persona tiene por escrito qué le toca y cómo se mide?", undefined, "con_equipo"),
  madurez("d4-ingreso", 4, "Cuando entra alguien nuevo, ¿cómo lo eliges y cómo lo enseñas?", undefined, "con_equipo"),
  evidencia("d4-rotacion", 4, "numero", "¿Cuántas personas se fueron en el último año?", { aplicaSi: "con_equipo" }),
  abierta("d4-deseo", 4, "¿Qué te gustaría que tu equipo hiciera sin que tú se lo pidieras?", "con_equipo"),

  // 6 · Marketing, marca y posicionamiento
  madurez("d6-marca", 6, "Tu marca y tu mensaje: ¿están definidos y se ven igual en todos lados?"),
  evidencia("d6-canales", 6, "texto", "¿Por dónde te llegan hoy los clientes? Referidos, redes, Google, anuncios, alianzas…", { prellenado: "chequeo" }),
  madurez("d6-medicion", 6, "¿Sabes cuánto te cuesta conseguir un cliente y qué canal te funciona mejor?"),
  abierta("d6-ideal", 6, "Describe a tu cliente ideal como si fuera una persona que conoces."),

  // 7 · Ventas y desarrollo comercial
  madurez("d7-proceso", 7, "Del primer mensaje al cierre: ¿tu proceso de venta está definido y registrado en algún lado (un CRM, una hoja)?"),
  evidencia("d7-conversion", 7, "numero", "De cada 10 personas que te preguntan, ¿cuántas te compran?"),
  evidencia("d7-ticket", 7, "texto", "¿Cuánto te compra en promedio un cliente?"),
  abierta("d7-pasos", 7, "Nombra los pasos por los que pasa un cliente contigo, desde que te conoce hasta que te vuelve a comprar, con las palabras que tú usas."),
  abierta("d7-seguimiento", 7, "¿Qué haces con quien preguntó y no compró?"),

  // 8 · Experiencia del cliente y postventa
  madurez("d8-satisfaccion", 8, "¿Cómo sabes si tus clientes quedaron contentos? Encuestas, reseñas, recompra…", undefined),
  evidencia("d8-recompra", 8, "texto", "¿Cuántos de tus clientes te vuelven a comprar o te recomiendan?", { prellenado: "google" }),
  abierta("d8-queja", 8, "¿Cuál es la queja que más se repite?"),

  // 9 · Tecnología, datos y automatización
  madurez("d9-herramientas", 9, "Las herramientas con las que operas (ventas, cobros, agenda, inventario): ¿están conectadas entre sí o son hojas sueltas?"),
  evidencia("d9-cuales", 9, "texto", "¿Qué herramientas o apps usas hoy para tu negocio?"),
  abierta("d9-repetitiva", 9, "¿Qué tarea repetitiva te encantaría no volver a hacer a mano?"),

  // 10 · Proveedores, compras y alianzas
  madurez("d10-proveedores", 10, "Tus proveedores clave: ¿tienes acuerdos claros y una alternativa si uno te falla?", undefined, "con_producto"),
  abierta("d10-alianzas", 10, "¿Con qué negocios o personas podrías aliarte para conseguir más clientes?"),

  // 11 · Legal, fiscal, riesgos y gobierno
  madurez("d11-orden", 11, "Lo legal y lo fiscal (tu régimen, cómo facturas, tus permisos): ¿está en orden?"),
  evidencia("d11-contratos", 11, "opcion", "¿Tienes contratos firmados con tus clientes principales?", { opciones: ["Sí, con todos", "Con algunos", "No"] }),
  abierta("d11-riesgo", 11, "¿Qué podría quebrar tu negocio de un día para otro?"),

  // 12 · Cultura, innovación, sostenibilidad y crecimiento
  madurez("d12-mejora", 12, "¿Qué tan seguido pruebas algo nuevo en tu negocio y mides si funcionó?"),
  abierta("d12-valores", 12, "¿Qué valores quieres que se vivan en tu negocio aunque tú no estés?"),

  // Prioridad: cierra el diagnóstico.
  { id: "pri-dolores", dimension: 0, tipo: "prioridad", entrada: "lista", texto: "De todo lo que platicamos, ¿cuáles son tus 3 dolores más urgentes?", ayuda: "Uno por línea." },
  { id: "pri-90", dimension: 0, tipo: "prioridad", entrada: "texto", texto: "Dentro de 90 días, ¿qué resultado te haría decir \"valió la pena\"?" },
];

export function valorSchemaPara(p: Pregunta): z.ZodType<Valor> {
  const texto = z.string().trim().min(1).max(4000);
  switch (p.entrada) {
    case "nivel": return z.object({ nivel: z.number().int().min(1).max(5) });
    case "numero": return z.object({ numero: z.number().min(0).max(1e9) });
    case "texto": return z.object({ texto });
    case "opcion": return z.object({ opcion: z.enum((p.opciones ?? [""]) as [string, ...string[]]) });
    case "lista": return z.object({ lista: z.array(texto).min(1).max(5) });
  }
}

export function escalaDe(respuestas: Map<string, Valor>): Set<Escala> {
  const s = new Set<Escala>();
  if ((respuestas.get("esc-personas")?.numero ?? 1) >= 2) s.add("con_equipo");
  const vende = respuestas.get("esc-vende")?.opcion;
  if (vende === "Productos" || vende === "Las dos cosas") s.add("con_producto");
  return s;
}

/** Las preguntas que le tocan a esta empresa según su escala. Sin escala contestada todavía, se muestran todas. */
export function preguntasActivas(respuestas: Map<string, Valor>): Pregunta[] {
  const escala = escalaDe(respuestas);
  const sinEscala = !respuestas.has("esc-personas");
  return PREGUNTAS.filter((p) => !p.aplicaSi || sinEscala || escala.has(p.aplicaSi));
}
```

- [ ] **Step 4: Correr.** Run: `pnpm --filter improvement test tests/diagnostico-cuestionario.test.ts`. Expected: 4 passed. Si `solo.length` sale menor a 35 o el total mayor a 52, ajustar la prueba al número real (no las preguntas): el rango del spec es 35–50 encendidas para un negocio chico.

- [ ] **Step 5: Gate y commit.**
```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/diagnostico/cuestionario.ts apps/improvement/tests/diagnostico-cuestionario.test.ts
git commit -m "feat(improvement): el cuestionario del Diagnóstico 360 — 12 dimensiones, madurez 1–5, por escala"
```

- [ ] **Step 6: 🚪 Puerta.** El coordinador le enseña al dueño la lista de preguntas (texto plano, por dimensión) y
  aplica sus cambios. Si cambia algún texto, se sube `CUESTIONARIO_VERSION`. **Las Tareas 7 y 8 no empiezan sin su
  aprobación.**

---

### Task 3: El resultado (esquema y orden de patógenos)

**Files:**
- Create: `apps/improvement/server/diagnostico/resultado.ts`
- Test: `apps/improvement/tests/diagnostico-resultado.test.ts`

**Interfaces:**
- Produces:
  - `DIMENSIONES: { n: 1..12; nombre: string; etapa: 1..6 }[]`
  - `ETAPAS: { n: 0..6; nombre: string }[]`
  - `diagnosisResultSchema` (zod) y `type DiagnosisResult = z.infer<typeof diagnosisResultSchema>`
  - `ordenarPatogenos(ps: DiagnosisResult["patogenos"]): DiagnosisResult["patogenos"]`

- [ ] **Step 1: Escribir la prueba.**
```ts
import { describe, expect, it } from "vitest";
import { DIMENSIONES, diagnosisResultSchema, ordenarPatogenos } from "../server/diagnostico/resultado.ts";
import { resultadoValido } from "./fixtures/diagnostico.ts";

describe("resultado del diagnóstico", () => {
  it("acepta un resultado completo", () => {
    expect(diagnosisResultSchema.safeParse(resultadoValido()).success).toBe(true);
  });
  it("exige las 12 dimensiones, una vez cada una", () => {
    const r = resultadoValido();
    r.dimensiones.pop();
    expect(diagnosisResultSchema.safeParse(r).success).toBe(false);
    const dup = resultadoValido();
    dup.dimensiones[1] = { ...dup.dimensiones[0]! };
    expect(diagnosisResultSchema.safeParse(dup).success).toBe(false);
  });
  it("una dimensión apagada lleva madurez null y su razón", () => {
    const r = resultadoValido();
    r.dimensiones[3] = { dimension: 4, madurez: null, puntaje: null, apagadaPorque: "Trabaja solo", citas: [], sintomas: [] };
    expect(diagnosisResultSchema.safeParse(r).success).toBe(true);
    r.dimensiones[3] = { dimension: 4, madurez: null, puntaje: null, citas: [], sintomas: [] };
    expect(diagnosisResultSchema.safeParse(r).success).toBe(false);
  });
  it("rechaza madurez fuera de 1–5 y paso del proceso fuera de 0–6", () => {
    const r = resultadoValido();
    r.dimensiones[0]!.madurez = 6;
    expect(diagnosisResultSchema.safeParse(r).success).toBe(false);
    const p = resultadoValido();
    p.proceso.paso = 7;
    expect(diagnosisResultSchema.safeParse(p).success).toBe(false);
  });
  it("ordena: caja en riesgo, gravedad 3, lo que desbloquea, lo rápido", () => {
    const base = resultadoValido().patogenos[0]!;
    const ps = [
      { ...base, titulo: "rapido", gravedad: 1 as const, prioridad: "rapido" as const },
      { ...base, titulo: "grave", gravedad: 3 as const, prioridad: "ninguna" as const },
      { ...base, titulo: "caja", gravedad: 2 as const, prioridad: "caja" as const },
      { ...base, titulo: "desbloquea", gravedad: 2 as const, prioridad: "desbloquea" as const },
    ];
    expect(ordenarPatogenos(ps).map((p) => p.titulo)).toEqual(["caja", "grave", "desbloquea", "rapido"]);
  });
  it("cada dimensión cae en una etapa del 1 al 6", () => {
    expect(DIMENSIONES).toHaveLength(12);
    for (const d of DIMENSIONES) expect(d.etapa).toBeGreaterThanOrEqual(1);
  });
});
```
  Y el fixture `apps/improvement/tests/fixtures/diagnostico.ts`, reusado por las Tareas 5 y 6:
```ts
import type { DiagnosisResult } from "../../server/diagnostico/resultado.ts";

export function resultadoValido(): DiagnosisResult {
  const objetivo = { titulo: "Cobrar a tiempo", patogeno: "Sin control de caja", area: "Finanzas", peso: 80, tipo: "ipa" as const, evidencia: "numero" as const, fecha: "2026-11-05" };
  return {
    negocio: { queEs: "Un negocio de servicios", dueno: "Una persona que hace todo", buscaDeVerdad: "Tiempo con su familia", leQuitaElSueno: "La caja" },
    dimensiones: Array.from({ length: 12 }, (_, i) => ({ dimension: i + 1, madurez: 2, puntaje: 40, citas: ["así lo dijo"], sintomas: ["un síntoma"] })),
    piso: { numero: 1, rango: "0–5 clientes", porque: "Tiene 3 clientes" },
    proceso: { paso: 0, porque: "Todo pasa por el dueño" },
    areas: [{ nombre: "Finanzas", color: "#3b82f6" }, { nombre: "Comercial", color: "#22c55e" }],
    patogenos: [{ titulo: "Sin control de caja", detalle: "No sabe cuánto tiene", area: "Finanzas", gravedad: 3, impacto: "Puede quedarse sin dinero", sintoma: "No sabe su caja", dimension: 2, prioridad: "caja", summum: false }],
    blueprint: { d30: [objetivo], d90: [{ ...objetivo, titulo: "Tablero de 5 números", fecha: "2026-12-30" }], d365: [] },
    criteriosParaSubir: ["5 clientes pagando"],
    memoria: [{ pregunta: "¿Qué buscas?", respuesta: "Tiempo con mi familia" }],
    empresaDigital: {
      crm: { etapas: [{ nombre: "Contacto", queSeRegistra: "Nombre y cómo llegó" }], camposPorContacto: ["WhatsApp"], comoLlegan: ["Referidos"] },
      erp: { modulos: [{ modulo: "Caja y cobranza", porque: "Finanzas en 2" }] },
    },
  };
}
```

- [ ] **Step 2: Correr y ver que falla.** Run: `pnpm --filter improvement test tests/diagnostico-resultado.test.ts`. Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar.** `apps/improvement/server/diagnostico/resultado.ts`:
```ts
// Lo que sale de evaluar un Diagnóstico 360 (spec 2026-10-06-casa-y-diagnostico-360-design.md, §4). Lo escribe hoy
// la skill `improvement` (Claude, interno) y mañana la app con la API: los dos pasan por este esquema, así que dan
// la misma forma. Genérico: ningún giro ni empresa.
import { z } from "zod";

export const ETAPAS = [
  { n: 0, nombre: "Diagnóstico" }, { n: 1, nombre: "Clientes" }, { n: 2, nombre: "Entrega que sostiene" },
  { n: 3, nombre: "Números y control" }, { n: 4, nombre: "Equipo y procesos" }, { n: 5, nombre: "Crecimiento" },
  { n: 6, nombre: "Dirección" },
] as const;

export const DIMENSIONES = [
  { n: 1, nombre: "Estrategia, propósito y visión", etapa: 6 },
  { n: 2, nombre: "Finanzas y salud económica", etapa: 3 },
  { n: 3, nombre: "Operaciones y procesos", etapa: 2 },
  { n: 4, nombre: "Personas, talento y empleados", etapa: 4 },
  { n: 5, nombre: "Dueño, liderazgo y vida personal", etapa: 6 },
  { n: 6, nombre: "Marketing, marca y posicionamiento", etapa: 1 },
  { n: 7, nombre: "Ventas y desarrollo comercial", etapa: 1 },
  { n: 8, nombre: "Experiencia del cliente y postventa", etapa: 2 },
  { n: 9, nombre: "Tecnología, datos y automatización", etapa: 4 },
  { n: 10, nombre: "Proveedores, compras y alianzas", etapa: 2 },
  { n: 11, nombre: "Legal, fiscal, riesgos y gobierno", etapa: 3 },
  { n: 12, nombre: "Cultura, innovación, sostenibilidad y crecimiento", etapa: 5 },
] as const;

const texto = z.string().trim().min(1);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const dimension = z
  .object({
    dimension: z.number().int().min(1).max(12),
    madurez: z.number().int().min(1).max(5).nullable(),
    puntaje: z.number().int().min(0).max(100).nullable(),
    apagadaPorque: z.string().trim().optional(),
    citas: z.array(texto),
    sintomas: z.array(texto),
  })
  .refine((d) => d.madurez !== null || !!d.apagadaPorque, { message: "Una dimensión apagada dice por qué", path: ["apagadaPorque"] });

const objetivo = z.object({
  titulo: texto, patogeno: texto, area: texto,
  peso: z.number().int().min(0).max(100),
  tipo: z.enum(["ipa", "non_ipa"]),
  evidencia: z.enum(["ninguna", "enlace", "nota", "numero", "archivo"]),
  fecha,
});

export const diagnosisResultSchema = z.object({
  negocio: z.object({ queEs: texto, dueno: texto, buscaDeVerdad: texto, leQuitaElSueno: texto }),
  dimensiones: z.array(dimension).length(12).refine((ds) => new Set(ds.map((d) => d.dimension)).size === 12, { message: "Las 12 dimensiones, una vez cada una" }),
  piso: z.object({ numero: z.number().int().min(1), rango: texto, porque: texto }),
  proceso: z.object({ paso: z.number().int().min(0).max(6), porque: texto }),
  areas: z.array(z.object({ nombre: texto, color })).min(1),
  patogenos: z.array(z.object({
    titulo: texto, detalle: texto, area: texto,
    gravedad: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    impacto: texto, sintoma: texto,
    dimension: z.number().int().min(1).max(12),
    // La regla fija del orden (skill improvement, Fase 6): caja en riesgo → gravedad 3 → lo que desbloquea → rápido.
    prioridad: z.enum(["caja", "desbloquea", "rapido", "ninguna"]),
    summum: z.boolean(),
  })).min(1),
  blueprint: z.object({ d30: z.array(objetivo), d90: z.array(objetivo), d365: z.array(objetivo) }),
  criteriosParaSubir: z.array(texto).min(1),
  memoria: z.array(z.object({ pregunta: z.string().trim().optional(), respuesta: texto })),
  empresaDigital: z.object({
    crm: z.object({ etapas: z.array(z.object({ nombre: texto, queSeRegistra: texto })).min(1), camposPorContacto: z.array(texto), comoLlegan: z.array(texto) }),
    erp: z.object({ modulos: z.array(z.object({ modulo: texto, porque: texto })) }),
  }),
});
export type DiagnosisResult = z.infer<typeof diagnosisResultSchema>;

const rango = (p: DiagnosisResult["patogenos"][number]) =>
  p.prioridad === "caja" ? 0 : p.gravedad === 3 ? 1 : p.prioridad === "desbloquea" ? 2 : p.prioridad === "rapido" ? 3 : 4;

export function ordenarPatogenos(ps: DiagnosisResult["patogenos"]): DiagnosisResult["patogenos"] {
  return [...ps].sort((a, b) => rango(a) - rango(b) || b.gravedad - a.gravedad);
}
```

- [ ] **Step 4: Correr.** Run: `pnpm --filter improvement test tests/diagnostico-resultado.test.ts`. Expected: 6 passed.

- [ ] **Step 5: Gate y commit.**
```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/diagnostico/resultado.ts apps/improvement/tests/diagnostico-resultado.test.ts apps/improvement/tests/fixtures/diagnostico.ts
git commit -m "feat(improvement): el resultado del Diagnóstico 360 — esquema y orden de patógenos"
```

---

### Task 4: Contestar (mutations del dueño)

**Files:**
- Create: `apps/improvement/server/diagnostico/mutations.ts`
- Test: `apps/improvement/tests/diagnostico-contestar.test.ts`

**Interfaces:**
- Consumes: `PREGUNTAS`, `preguntasActivas`, `valorSchemaPara`, `CUESTIONARIO_VERSION` (Tarea 2); tablas (Tarea 1); `findOwnerMembership(userId, orgId)` de `../auth/guard.ts`.
- Produces:
  - `type DiagnosisRow = typeof diagnosis.$inferSelect`
  - `getDiagnosis(userId, orgId): Promise<{ diagnosis: DiagnosisRow; respuestas: Map<string, Valor> } | null>` (el abierto; si no hay abierto, el último aprobado; null si no hay ninguno o no es dueño)
  - `saveAnswer(userId, orgId, questionId: string, value: unknown): Promise<Result<true>>`
  - `submitDiagnosis(userId, orgId): Promise<Result<true>>`

- [ ] **Step 1: Escribir la prueba.**
```ts
// Contestar el Diagnóstico 360. Integración real contra el Supabase de desarrollo, mismo patrón que owner-memory.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { diagnosis, membership, organization, profile } from "@jotapuntoce/db/schema";
import { getDiagnosis, saveAnswer, submitDiagnosis } from "../server/diagnostico/mutations.ts";
import { preguntasActivas } from "../server/diagnostico/cuestionario.ts";

const orgs: string[] = [];
const people: string[] = [];
afterEach(async () => {
  for (const id of orgs.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of people.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function setup() {
  const [o] = await db.insert(organization).values({ name: "Org", slug: `diag-c-${crypto.randomUUID()}` }).returning();
  orgs.push(o!.id);
  const mk = async (role: "owner" | "employee") => {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    await db.insert(membership).values({ userId: id, orgId: o!.id, role, acceptedAt: new Date() });
    people.push(id);
    return id;
  };
  const dueno = await mk("owner");
  const empleado = await mk("employee");
  const [d] = await db.insert(diagnosis).values({ orgId: o!.id, floor: 1, questionnaireVersion: "2026-10-06.1" }).returning();
  return { orgId: o!.id, dueno, empleado, diagId: d!.id };
}

describe("contestar el diagnóstico", () => {
  it("WHEN el dueño contesta THE SYSTEM SHALL guardar la respuesta y dejarla corregir", async () => {
    const s = await setup();
    expect((await saveAnswer(s.dueno, s.orgId, "esc-personas", { numero: 1 })).ok).toBe(true);
    expect((await saveAnswer(s.dueno, s.orgId, "esc-personas", { numero: 3 })).ok).toBe(true);
    const r = await getDiagnosis(s.dueno, s.orgId);
    expect(r?.respuestas.get("esc-personas")).toEqual({ numero: 3 });
  });

  it("WHEN contesta un empleado, una pregunta que no existe o un valor inválido THE SYSTEM SHALL rechazarlo", async () => {
    const s = await setup();
    expect(await saveAnswer(s.empleado, s.orgId, "esc-personas", { numero: 1 })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await saveAnswer(s.dueno, s.orgId, "no-existe", { texto: "x" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await saveAnswer(s.dueno, s.orgId, "d5-dependencia", { nivel: 9 })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await getDiagnosis(s.empleado, s.orgId)).toBeNull();
  });

  it("WHEN faltan preguntas THE SYSTEM SHALL no dejar enviar; con todas, pasa a evaluando y ya no se corrige", async () => {
    const s = await setup();
    expect(await submitDiagnosis(s.dueno, s.orgId)).toMatchObject({ ok: false, error: { code: "INCOMPLETO" } });
    await saveAnswer(s.dueno, s.orgId, "esc-personas", { numero: 1 });
    await saveAnswer(s.dueno, s.orgId, "esc-vende", { opcion: "Servicios" });
    const resp = new Map([["esc-personas", { numero: 1 }], ["esc-vende", { opcion: "Servicios" }]]);
    for (const p of preguntasActivas(resp)) {
      if (resp.has(p.id)) continue;
      const v = p.entrada === "nivel" ? { nivel: 2 } : p.entrada === "numero" ? { numero: 1 } : p.entrada === "opcion" ? { opcion: p.opciones![0]! } : p.entrada === "lista" ? { lista: ["a"] } : { texto: "respuesta" };
      expect((await saveAnswer(s.dueno, s.orgId, p.id, v)).ok).toBe(true);
    }
    expect((await submitDiagnosis(s.dueno, s.orgId)).ok).toBe(true);
    const [d] = await db.select().from(diagnosis).where(eq(diagnosis.id, s.diagId));
    expect(d!.status).toBe("evaluando");
    expect(d!.submittedAt).not.toBeNull();
    expect(await saveAnswer(s.dueno, s.orgId, "esc-personas", { numero: 5 })).toMatchObject({ ok: false, error: { code: "ESTADO" } });
  });
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `pnpm --filter improvement test tests/diagnostico-contestar.test.ts`. Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar.** `apps/improvement/server/diagnostico/mutations.ts`:
```ts
// El Diagnóstico 360 del lado del dueño: contestar, enviar, aprobar y pedir corrección. Solo el dueño
// (findOwnerMembership): cada Improvement aprende del dueño de SU empresa, y el diagnóstico es su juicio sobre ella.
// La evaluación (lo que escribe Improvement) vive aparte en evaluacion.ts, sin guard ni Next.
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { diagnosis, diagnosisAnswer } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { PREGUNTAS, preguntasActivas, valorSchemaPara, type Valor } from "./cuestionario.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): Result<never> => ({ ok: false, error: { code, message } });

export type DiagnosisRow = typeof diagnosis.$inferSelect;

async function abierto(orgId: string): Promise<DiagnosisRow | null> {
  const [d] = await db.select().from(diagnosis).where(and(eq(diagnosis.orgId, orgId), ne(diagnosis.status, "aprobado"))).limit(1);
  return d ?? null;
}

async function respuestasDe(diagnosisId: string): Promise<Map<string, Valor>> {
  const rows = await db.select().from(diagnosisAnswer).where(eq(diagnosisAnswer.diagnosisId, diagnosisId));
  return new Map(rows.map((r) => [r.questionId, r.value as Valor]));
}

export async function getDiagnosis(userId: string, orgId: string) {
  if (!(await findOwnerMembership(userId, orgId))) return null;
  const d =
    (await abierto(orgId)) ??
    (await db.select().from(diagnosis).where(eq(diagnosis.orgId, orgId)).orderBy(desc(diagnosis.approvedAt)).limit(1))[0];
  if (!d) return null;
  return { diagnosis: d, respuestas: await respuestasDe(d.id) };
}

export async function saveAnswer(userId: string, orgId: string, questionId: string, value: unknown): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño contesta su diagnóstico.", "FORBIDDEN");
  const pregunta = PREGUNTAS.find((p) => p.id === questionId);
  if (!pregunta) return fail("Esa pregunta no existe.", "NOT_FOUND");
  const parsed = valorSchemaPara(pregunta).safeParse(value);
  if (!parsed.success) return fail("Esa respuesta no tiene la forma que pide la pregunta.");
  const d = await abierto(orgId);
  if (!d || d.status !== "contestando") return fail("Este diagnóstico ya no se puede corregir.", "ESTADO");
  await db
    .insert(diagnosisAnswer)
    .values({ diagnosisId: d.id, orgId, questionId, value: parsed.data })
    .onConflictDoUpdate({ target: [diagnosisAnswer.diagnosisId, diagnosisAnswer.questionId], set: { value: parsed.data, updatedAt: new Date() } });
  return { ok: true, data: true };
}

export async function submitDiagnosis(userId: string, orgId: string): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño envía su diagnóstico.", "FORBIDDEN");
  const d = await abierto(orgId);
  if (!d || d.status !== "contestando") return fail("Este diagnóstico ya se envió.", "ESTADO");
  const respuestas = await respuestasDe(d.id);
  const faltan = preguntasActivas(respuestas).filter((p) => !respuestas.has(p.id));
  if (faltan.length) return fail(`Faltan ${faltan.length} preguntas.`, "INCOMPLETO");
  const filas = await db
    .update(diagnosis)
    .set({ status: "evaluando", submittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(diagnosis.id, d.id), eq(diagnosis.status, "contestando")))
    .returning({ id: diagnosis.id });
  return filas.length ? { ok: true, data: true } : fail("Este diagnóstico ya se envió.", "ESTADO");
}
```

- [ ] **Step 4: Correr.** Run: `pnpm --filter improvement test tests/diagnostico-contestar.test.ts`. Expected: 3 passed.

- [ ] **Step 5: Gate y commit.**
```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/diagnostico/mutations.ts apps/improvement/tests/diagnostico-contestar.test.ts
git commit -m "feat(improvement): el dueño contesta y envía su Diagnóstico 360"
```

---

### Task 5: Evaluar (sistema + script de la skill)

**Files:**
- Create: `apps/improvement/server/diagnostico/evaluacion.ts`, `apps/improvement/scripts/diagnostico.ts`
- Test: `apps/improvement/tests/diagnostico-evaluacion.test.ts`

**Interfaces:**
- Consumes: `diagnosisResultSchema`, `DiagnosisResult` (Tarea 3); `PREGUNTAS`, `CUESTIONARIO_VERSION` (Tarea 2).
- Produces:
  - `readForEvaluation(diagnosisId: string): Promise<Result<{ diagnosis: DiagnosisRow; org: { name: string; industry: string | null }; respuestas: { id; dimension; tipo; texto; valor }[] }>>`
  - `saveDiagnosisResult(diagnosisId: string, result: unknown, { directo }?: { directo?: boolean }): Promise<Result<true>>`.
    Acepta `evaluando`; con `directo: true` también acepta `contestando`, para la casa, cuyas respuestas ya existen
    en documentos. Pasa a `listo` y limpia `review_note`.
  - CLI: `node --experimental-strip-types scripts/diagnostico.ts leer <id>` · `… guardar <id> <archivo.json> [--directo]` · `… abrir <orgId> <piso>` (crea uno en `contestando`; lo usa la Tarea 10).

- [ ] **Step 1: Escribir la prueba.**
```ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { diagnosis, diagnosisAnswer, organization } from "@jotapuntoce/db/schema";
import { readForEvaluation, saveDiagnosisResult } from "../server/diagnostico/evaluacion.ts";
import { resultadoValido } from "./fixtures/diagnostico.ts";

const orgs: string[] = [];
afterEach(async () => {
  for (const id of orgs.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});
async function diag(status: "contestando" | "evaluando") {
  const [o] = await db.insert(organization).values({ name: "Org eval", slug: `diag-e-${crypto.randomUUID()}` }).returning();
  orgs.push(o!.id);
  const [d] = await db.insert(diagnosis).values({ orgId: o!.id, floor: 1, questionnaireVersion: "2026-10-06.1", status, reviewNote: "corrige X" }).returning();
  await db.insert(diagnosisAnswer).values({ diagnosisId: d!.id, orgId: o!.id, questionId: "d5-busca", value: { texto: "Tiempo" } });
  return d!.id;
}

describe("evaluar el diagnóstico", () => {
  it("leer trae las respuestas con su pregunta", async () => {
    const id = await diag("evaluando");
    const r = await readForEvaluation(id);
    expect(r.ok && r.data.respuestas[0]).toMatchObject({ id: "d5-busca", dimension: 5, valor: { texto: "Tiempo" } });
  });
  it("guardar un resultado válido lo deja listo y limpia la nota", async () => {
    const id = await diag("evaluando");
    expect((await saveDiagnosisResult(id, resultadoValido())).ok).toBe(true);
    const [d] = await db.select().from(diagnosis).where(eq(diagnosis.id, id));
    expect(d).toMatchObject({ status: "listo", reviewNote: null });
    expect(d!.readyAt).not.toBeNull();
  });
  it("un resultado inválido no cambia nada y dice qué falta", async () => {
    const id = await diag("evaluando");
    const r = await saveDiagnosisResult(id, { negocio: {} });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    const [d] = await db.select().from(diagnosis).where(eq(diagnosis.id, id));
    expect(d!.status).toBe("evaluando");
  });
  it("en contestando solo se guarda con directo", async () => {
    const id = await diag("contestando");
    expect(await saveDiagnosisResult(id, resultadoValido())).toMatchObject({ ok: false, error: { code: "ESTADO" } });
    expect((await saveDiagnosisResult(id, resultadoValido(), { directo: true })).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `pnpm --filter improvement test tests/diagnostico-evaluacion.test.ts`. Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar `evaluacion.ts`.**
```ts
// La evaluación del Diagnóstico 360: lo que escribe Improvement, no el dueño. Sin guard ni Next a propósito: la
// llaman el script de la skill `improvement` (hoy, interno) y la app con la API (al lanzamiento), y las dos deben
// pasar por el mismo esquema para dar el mismo resultado (spec §5). Nunca la importa una ruta ni un componente.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { diagnosis, diagnosisAnswer, organization } from "@jotapuntoce/db/schema";
import { PREGUNTAS, type Valor } from "./cuestionario.ts";
import { diagnosisResultSchema } from "./resultado.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): Result<never> => ({ ok: false, error: { code, message } });

export async function readForEvaluation(diagnosisId: string) {
  const [d] = await db.select().from(diagnosis).where(eq(diagnosis.id, diagnosisId)).limit(1);
  if (!d) return fail("Ese diagnóstico no existe.", "NOT_FOUND");
  const [org] = await db.select({ name: organization.name, industry: organization.industry }).from(organization).where(eq(organization.id, d.orgId));
  const rows = await db.select().from(diagnosisAnswer).where(eq(diagnosisAnswer.diagnosisId, diagnosisId));
  const valores = new Map(rows.map((r) => [r.questionId, r.value as Valor]));
  const respuestas = PREGUNTAS.filter((p) => valores.has(p.id)).map((p) => ({ id: p.id, dimension: p.dimension, tipo: p.tipo, texto: p.texto, valor: valores.get(p.id)! }));
  return { ok: true as const, data: { diagnosis: d, org: org!, respuestas } };
}

export async function saveDiagnosisResult(diagnosisId: string, result: unknown, { directo = false } = {}): Promise<Result<true>> {
  const parsed = diagnosisResultSchema.safeParse(result);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("\n"));
  }
  const estados = directo ? ["evaluando", "contestando"] : ["evaluando"];
  const filas = await db
    .update(diagnosis)
    .set({ status: "listo", result: parsed.data, reviewNote: null, readyAt: new Date(), floor: parsed.data.piso.numero, updatedAt: new Date() })
    .where(and(eq(diagnosis.id, diagnosisId), inArray(diagnosis.status, estados)))
    .returning({ id: diagnosis.id });
  return filas.length ? { ok: true, data: true } : fail("Ese diagnóstico no está esperando evaluación.", "ESTADO");
}
```

- [ ] **Step 4: Correr.** Run: `pnpm --filter improvement test tests/diagnostico-evaluacion.test.ts`. Expected: 4 passed.

- [ ] **Step 5: El script.** `apps/improvement/scripts/diagnostico.ts`:
```ts
// La herramienta de la skill `improvement` para evaluar un Diagnóstico 360 por dentro (spec §5, paso 4).
//   node --experimental-strip-types scripts/diagnostico.ts leer <diagnosisId>
//   node --experimental-strip-types scripts/diagnostico.ts guardar <diagnosisId> <resultado.json> [--directo]
//   node --experimental-strip-types scripts/diagnostico.ts abrir <orgId> <piso>
// Se corre desde apps/improvement. Carga .env.local antes de importar la base (el cliente lee DATABASE_URL al cargar).
process.loadEnvFile(".env.local");
const { readFileSync } = await import("node:fs");
const { db } = await import("@jotapuntoce/db");
const { diagnosis } = await import("@jotapuntoce/db/schema");
const { readForEvaluation, saveDiagnosisResult } = await import("../server/diagnostico/evaluacion.ts");
const { CUESTIONARIO_VERSION, PREGUNTAS } = await import("../server/diagnostico/cuestionario.ts");

const [cmd, a, b, flag] = process.argv.slice(2);
let salida: unknown;
if (cmd === "leer" && a) {
  const r = await readForEvaluation(a);
  salida = r.ok ? { ...r.data, cuestionario: { version: CUESTIONARIO_VERSION, preguntas: PREGUNTAS } } : r;
} else if (cmd === "guardar" && a && b) {
  salida = await saveDiagnosisResult(a, JSON.parse(readFileSync(b, "utf8")), { directo: flag === "--directo" });
} else if (cmd === "abrir" && a && b) {
  const [d] = await db.insert(diagnosis).values({ orgId: a, floor: Number(b), questionnaireVersion: CUESTIONARIO_VERSION }).returning({ id: diagnosis.id });
  salida = { ok: true, data: d };
} else {
  salida = { ok: false, error: { code: "USO", message: "leer <id> · guardar <id> <archivo> [--directo] · abrir <orgId> <piso>" } };
}
console.log(JSON.stringify(salida, null, 2));
process.exit((salida as { ok?: boolean }).ok === false ? 1 : 0);
```
  Probar que corre: `cd apps/improvement && node --experimental-strip-types scripts/diagnostico.ts`. Expected: imprime el
  error `USO` y sale con 1. Si Node se queja de un import sin extensión dentro de `@jotapuntoce/db`, reportarlo como
  bloqueo (no cambiar `packages/db`).

- [ ] **Step 6: Gate y commit.**
```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/diagnostico/evaluacion.ts apps/improvement/scripts/diagnostico.ts apps/improvement/tests/diagnostico-evaluacion.test.ts
git commit -m "feat(improvement): evaluar el Diagnóstico 360 — un solo camino para la skill y la futura API"
```

---

### Task 6: Aprobar y pedir corrección

**Files:**
- Modify: `apps/improvement/server/diagnostico/mutations.ts`
- Test: `apps/improvement/tests/diagnostico-aprobar.test.ts`

**Interfaces:**
- Consumes: `diagnosisResultSchema`, `ordenarPatogenos` (Tarea 3); `getDiagnosis` (Tarea 4); tablas `area`, `orgNeed`, `objective`, `ownerMemory`, `organization`, `orgDigitalConfig`.
- Produces:
  - `approveDiagnosis(userId, orgId): Promise<Result<{ areas: number; necesidades: number; objetivos: number }>>`
  - `rejectDiagnosis(userId, orgId, note: unknown): Promise<Result<true>>` (`listo` → `evaluando` con `review_note`)

- [ ] **Step 1: Escribir la prueba.**
```ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, diagnosis, membership, objective, organization, orgDigitalConfig, orgNeed, ownerMemory, profile } from "@jotapuntoce/db/schema";
import { approveDiagnosis, rejectDiagnosis } from "../server/diagnostico/mutations.ts";
import { resultadoValido } from "./fixtures/diagnostico.ts";

const orgs: string[] = [];
const people: string[] = [];
afterEach(async () => {
  for (const id of orgs.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of people.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function listo() {
  const [o] = await db.insert(organization).values({ name: "Org ap", slug: `diag-a-${crypto.randomUUID()}` }).returning();
  orgs.push(o!.id);
  const dueno = crypto.randomUUID();
  await db.insert(profile).values({ id: dueno, email: `${dueno}@example.com` });
  await db.insert(membership).values({ userId: dueno, orgId: o!.id, role: "owner", acceptedAt: new Date() });
  people.push(dueno);
  // Un área que ya existía con el mismo nombre: no se duplica.
  await db.insert(area).values({ orgId: o!.id, name: "Finanzas", color: "#000000" });
  const [d] = await db.insert(diagnosis).values({ orgId: o!.id, floor: 1, questionnaireVersion: "2026-10-06.1", status: "listo", result: resultadoValido() }).returning();
  return { orgId: o!.id, dueno, diagId: d!.id };
}

describe("aprobar el diagnóstico", () => {
  it("WHEN el dueño aprueba THE SYSTEM SHALL crear áreas, necesidades, objetivos, memoria, piso, paso y configuración — una sola vez", async () => {
    const s = await listo();
    const r = await approveDiagnosis(s.dueno, s.orgId);
    expect(r).toEqual({ ok: true, data: { areas: 1, necesidades: 1, objetivos: 2 } });
    expect(await db.select().from(area).where(eq(area.orgId, s.orgId))).toHaveLength(2);
    const [n] = await db.select().from(orgNeed).where(eq(orgNeed.orgId, s.orgId));
    expect(n).toMatchObject({ title: "Sin control de caja", severity: 3, diagnosisId: s.diagId, source: "improvement" });
    const objs = await db.select().from(objective).where(eq(objective.orgId, s.orgId));
    expect(objs.map((o) => o.needId)).toEqual([n!.id, n!.id]);
    expect(await db.select().from(ownerMemory).where(eq(ownerMemory.orgId, s.orgId))).toHaveLength(1);
    const [o] = await db.select().from(organization).where(eq(organization.id, s.orgId));
    expect(o).toMatchObject({ floor: 1, evolutionLevel: 0 });
    expect(await db.select().from(orgDigitalConfig).where(eq(orgDigitalConfig.orgId, s.orgId))).toHaveLength(1);
    const [d] = await db.select().from(diagnosis).where(eq(diagnosis.id, s.diagId));
    expect(d).toMatchObject({ status: "aprobado", approvedBy: s.dueno });

    expect(await approveDiagnosis(s.dueno, s.orgId)).toMatchObject({ ok: false, error: { code: "ESTADO" } });
    expect(await db.select().from(objective).where(eq(objective.orgId, s.orgId))).toHaveLength(2);
  });

  it("WHEN algo no cuadra THE SYSTEM SHALL regresarlo a evaluando con la nota, sin tocar la empresa", async () => {
    const s = await listo();
    expect(await rejectDiagnosis(s.dueno, s.orgId, "  ")).toMatchObject({ ok: false });
    expect((await rejectDiagnosis(s.dueno, s.orgId, "Mi cliente más grande es el 60 %, no el 100 %")).ok).toBe(true);
    const [d] = await db.select().from(diagnosis).where(eq(diagnosis.id, s.diagId));
    expect(d).toMatchObject({ status: "evaluando", reviewNote: "Mi cliente más grande es el 60 %, no el 100 %" });
    expect(await db.select().from(orgNeed).where(eq(orgNeed.orgId, s.orgId))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `pnpm --filter improvement test tests/diagnostico-aprobar.test.ts`. Expected: FAIL, `approveDiagnosis` no está exportada.

- [ ] **Step 3: Implementar.** Agregar a `mutations.ts`. Las importaciones nuevas van arriba, junto a las existentes:
```ts
import { z } from "zod";
import { area, objective, organization, orgDigitalConfig, orgNeed, ownerMemory } from "@jotapuntoce/db/schema";
import { diagnosisResultSchema, ordenarPatogenos } from "./resultado.ts";

export async function approveDiagnosis(userId: string, orgId: string): Promise<Result<{ areas: number; necesidades: number; objetivos: number }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño aprueba su diagnóstico.", "FORBIDDEN");
  const d = await abierto(orgId);
  if (!d || d.status !== "listo") return fail("No hay un diagnóstico listo para aprobar.", "ESTADO");
  const parsed = diagnosisResultSchema.safeParse(d.result);
  if (!parsed.success) return fail("El diagnóstico guardado no tiene la forma esperada.", "DB_ERROR");
  const r = parsed.data;

  return db.transaction(async (tx) => {
    // Tomar la fila primero: si otra pestaña ya aprobó, aquí no pasa nada.
    const tomada = await tx
      .update(diagnosis)
      .set({ status: "aprobado", approvedAt: new Date(), approvedBy: userId, updatedAt: new Date() })
      .where(and(eq(diagnosis.id, d.id), eq(diagnosis.status, "listo")))
      .returning({ id: diagnosis.id });
    if (!tomada.length) return fail("Este diagnóstico ya se aprobó.", "ESTADO");

    const existentes = await tx.select().from(area).where(eq(area.orgId, orgId));
    const porNombre = new Map(existentes.map((a) => [a.name.toLowerCase(), a.id]));
    let nuevas = 0;
    for (const a of r.areas) {
      if (porNombre.has(a.nombre.toLowerCase())) continue;
      const [fila] = await tx.insert(area).values({ orgId, name: a.nombre, color: a.color }).returning({ id: area.id });
      porNombre.set(a.nombre.toLowerCase(), fila!.id);
      nuevas += 1;
    }
    const areaId = (nombre: string) => porNombre.get(nombre.toLowerCase()) ?? null;

    const necesidadPor = new Map<string, string>();
    for (const p of ordenarPatogenos(r.patogenos)) {
      const [fila] = await tx
        .insert(orgNeed)
        .values({ orgId, areaId: areaId(p.area), title: p.titulo, detail: `${p.detalle}\n\nSíntoma: ${p.sintoma}\nImpacto: ${p.impacto}`, severity: p.gravedad, source: "improvement", diagnosisId: d.id })
        .returning({ id: orgNeed.id });
      necesidadPor.set(p.titulo, fila!.id);
    }

    const objetivos = [...r.blueprint.d30, ...r.blueprint.d90, ...r.blueprint.d365];
    for (const o of objetivos) {
      await tx.insert(objective).values({
        orgId, areaId: areaId(o.area), needId: necesidadPor.get(o.patogeno) ?? null, title: o.titulo,
        impactWeight: o.peso, kind: o.tipo, evidenceType: o.evidencia, dueDate: new Date(`${o.fecha}T12:00:00`), createdBy: userId,
      });
    }

    for (const m of r.memoria) {
      await tx.insert(ownerMemory).values({ orgId, ownerId: userId, question: m.pregunta ?? null, answer: m.respuesta, topic: "diagnostico" });
    }

    await tx.update(organization).set({ floor: r.piso.numero, evolutionLevel: r.proceso.paso, updatedAt: new Date() }).where(eq(organization.id, orgId));
    await tx
      .insert(orgDigitalConfig)
      .values({ orgId, diagnosisId: d.id, crm: r.empresaDigital.crm, erp: r.empresaDigital.erp })
      .onConflictDoUpdate({ target: orgDigitalConfig.orgId, set: { diagnosisId: d.id, crm: r.empresaDigital.crm, erp: r.empresaDigital.erp, updatedAt: new Date() } });

    return { ok: true as const, data: { areas: nuevas, necesidades: r.patogenos.length, objetivos: objetivos.length } };
  });
}

const notaSchema = z.string().trim().min(3, "Cuéntame qué no cuadra.").max(2000);

export async function rejectDiagnosis(userId: string, orgId: string, note: unknown): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño revisa su diagnóstico.", "FORBIDDEN");
  const parsed = notaSchema.safeParse(note);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  const d = await abierto(orgId);
  if (!d || d.status !== "listo") return fail("No hay un diagnóstico listo para revisar.", "ESTADO");
  await db.update(diagnosis).set({ status: "evaluando", reviewNote: parsed.data, updatedAt: new Date() }).where(and(eq(diagnosis.id, d.id), eq(diagnosis.status, "listo")));
  return { ok: true, data: true };
}
```
  Si `organization` no tiene `updatedAt` en el esquema, quitar ese campo del `set`.
  Si el insert de `objective` exige un campo `notNull` que aquí no se manda, revisar `createObjective` en
  `server/objectives/` y copiar sus valores por default.

- [ ] **Step 4: Correr.** Run: `pnpm --filter improvement test tests/diagnostico-aprobar.test.ts`. Expected: 2 passed.

- [ ] **Step 5: Gate y commit.**
```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/diagnostico/mutations.ts apps/improvement/tests/diagnostico-aprobar.test.ts
git commit -m "feat(improvement): el dueño aprueba su diagnóstico y su empresa queda cargada (áreas, necesidades, objetivos, CRM/ERP)"
```

---

### Task 7: La pantalla `/[org]/diagnostico` (requiere la Puerta de la Tarea 2)

**Files:**
- Create: `apps/improvement/app/[org]/diagnostico/page.tsx`
- Modify: `apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx` (puerta del dueño)
- Modify: `apps/improvement/app/globals.css` (solo si hace falta una clase nueva; preferir las existentes `config-page`, `config-card`, `config-hint`, `panel-cta`, `panel-btn-ghost`)

**Interfaces:**
- Consumes: `getDiagnosis`, `saveAnswer`, `submitDiagnosis`, `approveDiagnosis`, `rejectDiagnosis` (Tareas 4 y 6); `preguntasActivas`, `MADUREZ` (Tarea 2); `DIMENSIONES`, `ETAPAS`, `ordenarPatogenos`, `diagnosisResultSchema` (Tarea 3); `EVOLUTION_LEVELS` de `@jotapuntoce/ui/building/evolutionLevels.ts`; `findOwnerMembership`, `getSessionUserId` de `@/server/auth/guard`.

- [ ] **Step 1: Escribir la página.** Server Component, sin `"use client"`, con formularios nativos y Server Actions.
  Mismo patrón que `app/[org]/improvement/page.tsx`: `getSessionUserId` y `findOwnerMembership`, y si no es dueño,
  `notFound()`. Según `getDiagnosis(...)?.diagnosis.status`:
  - **null** → tarjeta "Tu diagnóstico todavía no está abierto. Te aviso cuando lo esté."
  - **`contestando`:**
    - Arriba: "Esto se queda entre tú e Improvement: lo uso para armar la ruta de tu empresa y nadie de tu equipo
      lo ve." Avance: "Pregunta N de M" y la dimensión actual (`DIMENSIONES[n-1].nombre`; escala y prioridad como
      "Para empezar" y "Para cerrar").
    - La pregunta actual es la primera de `preguntasActivas(respuestas)` sin respuesta. Con `?q=<id>`, esa: sirve
      para "← Anterior", que lleva al id previo de la lista activa.
    - Entrada según `entrada`:
      - `nivel`: 5 `<button name="nivel" value="1..5">` con el texto de `MADUREZ[i]`;
      - `numero`: `<input type="number" min=0>`;
      - `texto`: `<textarea>`;
      - `opcion`: un `<button name="opcion" value=…>` por opción;
      - `lista`: `<textarea>`, separada por renglón.
    - Muestra `ayuda` si existe. La respuesta previa precarga el campo.
    - La action `responder(formData)` arma el `Valor`, llama `saveAnswer` y redirige. Si hay error, `?error=`.
    - Al terminar todas: tarjeta "Listo, contestaste todo" con un botón que llama `submitDiagnosis`.
  - **`evaluando`** → "Recibí tus respuestas. Estoy armando tu diagnóstico; te aviso cuando esté listo para que lo
    revises." Si hay `reviewNote`: "Estoy corrigiendo lo que me dijiste: «nota»".
  - **`listo`** → la revisión, en una sola página, con `diagnosisResultSchema.parse(d.result)`:
    1. **"Lo que entendí de ti"**: `negocio.queEs`, `negocio.dueno`, "Lo que buscas de verdad: …" y "Lo que te
       quita el sueño: …".
    2. **"Tus 12 dimensiones"**, agrupadas por `ETAPAS` (1–6). Cada una con su nombre y una barra de 5 segmentos
       llenos según `madurez`, con la etiqueta `MADUREZ[madurez-1]`. Si `madurez` es null, "No aplica:
       apagadaPorque".
    3. **"Tu piso y tu paso del proceso"**: `Piso {piso.numero} ({piso.rango})`, el `porque`, y
       `Paso: {EVOLUTION_LEVELS[proceso.paso].name}`, la descripción y el `porque`.
    4. **"Lo que más pesa"**: los primeros 5 de `ordenarPatogenos(patogenos)`, cada uno con su título, síntoma e
       impacto.
    5. **"Tu plan"**: las columnas 30, 90 y 365 días con el título y la fecha de cada objetivo.
    6. **"Para subir de piso"**: `criteriosParaSubir`.
    7. Dos formularios:
       - **"Sí, así es"** → `approveDiagnosis` y redirige a `/${orgId}/diagnostico?aprobado=1`.
       - **"Algo no cuadra"**: un `<textarea name="nota">` → `rejectDiagnosis`.
  - **`aprobado`** → "Tu diagnóstico del piso N está aprobado". Con `?aprobado=1`, "Listo: tu empresa ya tiene sus
    áreas, necesidades y objetivos". Muestra el resumen del punto 3 y tres enlaces:
    - "Ver tus objetivos" → `/${orgId}/objetivos`;
    - "Ver lo que necesita" → `/${orgId}/necesidades`;
    - "Personaliza tu empresa digital" → `/empresas/configuracion`.

  Cerrar con `<Link href={`/empresas/${orgId}`}>← Volver a tu edificio</Link>`.

- [ ] **Step 2: La puerta.** En `BuildingExperience.tsx`, dentro del bloque `esDueno && (...)`, antes de "Lo que
  necesita":
```tsx
<Link href={`/${orgId}/diagnostico`} className="jpc-reception-door">
  Tu diagnóstico
</Link>
```

- [ ] **Step 3: Verificarlo en el navegador.**
  - Arrancar la app con `preview_start` (configuración de `apps/improvement` en `.claude/launch.json`).
  - Para probar sin la sesión del dueño, preparar una organización de prueba con un diagnóstico abierto usando el
    script de la Tarea 5 (`abrir <orgId> 1`).
  - El coordinador entra con una cuenta de dueño de prueba local (seed del proyecto) o pide al dueño iniciar sesión.
    Nunca se escribe una contraseña real.
  - Recorrer: contestar 3 preguntas (una de cada entrada), "← Anterior", ver la precarga y que no haya errores en la
    consola. Después, con `guardar --directo` y el fixture, ver la revisión en `listo` a 1280 px y a 390 px de ancho.
  - Capturas de cada estado para el expediente (`documentar-proceso`).

- [ ] **Step 4: Gate y commit.**
```bash
pnpm lint && pnpm typecheck && pnpm test
git add "apps/improvement/app/[org]/diagnostico" "apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx" apps/improvement/app/globals.css
git commit -m "feat(improvement): /[org]/diagnostico — contestar una pregunta a la vez, revisar y aprobar con un clic"
```

---

### Task 8: El letrero del edificio dice el piso y el paso

**Files:**
- Modify: `apps/improvement/server/building/buildingGraph.ts`, `apps/improvement/server/building/loadBuilding.ts`, `packages/ui/src/building/Building.tsx`, `apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx`
- Test: `apps/improvement/tests/building-graph.test.ts` (agregar un caso)

**Interfaces:**
- Produces: `BuildingOrgInput` gana `floor: number` y `evolutionLevel: number`. `BuildingGraph` gana
  `levelLabel: string`, con la forma `"Piso 1 · Arranque"`. `Building` acepta la prop opcional `levelLabel?: string`.

- [ ] **Step 1: Prueba.** Agregar a `tests/building-graph.test.ts`, usando el objeto org que ya arman las pruebas de
  ese archivo más `floor` y `evolutionLevel`:
```ts
it("WHEN la empresa va en el piso 2, paso 1 THE SYSTEM SHALL decirlo en el letrero", () => {
  const g = buildBuildingGraph({ ...ORG_BASE, floor: 2, evolutionLevel: 1 }, []);
  expect(g.levelLabel).toBe("Piso 2 · Orden");
});
```
  `ORG_BASE` es el nombre del objeto org existente en ese archivo; si se llama distinto, usar el suyo. Correrla y ver
  que falla.

- [ ] **Step 2: Implementar.**
  - En `buildingGraph.ts`: agregar `floor` y `evolutionLevel` a `BuildingOrgInput` y `levelLabel: string` a
    `BuildingGraph`. En `buildBuildingGraph`:
```ts
levelLabel: `Piso ${org.floor} · ${evolutionLevelAt(org.evolutionLevel).name}`,
```
    importando `evolutionLevelAt` desde `@jotapuntoce/ui/building/evolutionLevels.ts`.
  - En `loadBuilding.ts`: agregar `floor: organization.floor` y `evolutionLevel: organization.evolutionLevel` al
    select.
  - En `Building.tsx`: aceptar `levelLabel?: string` y dibujarlo debajo del slogan, con el mismo estilo de texto
    secundario que usa el slogan. Buscar dónde se pinta `slogan` y poner una línea igual con `levelLabel`.
  - En `BuildingExperience.tsx`: pasar `levelLabel={graph.levelLabel}`.
  - Actualizar los otros llamadores de `buildBuildingGraph` y las pruebas que arman `BuildingOrgInput`
    (`grep -rn "buildBuildingGraph(" apps packages`) agregándoles `floor: 1, evolutionLevel: 0`.

- [ ] **Step 3: Correr, verificar en el navegador** (el letrero muestra "Piso 1 · Arranque"), **gate y commit.**
```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/building packages/ui/src/building/Building.tsx "apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx" apps/improvement/tests/building-graph.test.ts
git commit -m "feat(ui): el letrero del edificio dice en qué piso y en qué paso del proceso va la empresa"
```

---

### Task 9: La casa (datos)

**Files:**
- Create: `packages/db/src/seed-casa.ts`
- Modify: `package.json` (raíz): script `"db:casa": "node --experimental-strip-types packages/db/src/seed-casa.ts"`

**Interfaces:**
- Produces: una fila `organization` con `is_home = true`, `floor = 1`, y la membresía `owner` del correo dado.
  Imprime `{ orgId }`. Es idempotente: si ya existe una casa, la reusa.

- [ ] **Step 1: El script.**
```ts
// Crea la casa: la organización del dueño de la plataforma dentro del mismo motor (spec §7). Es un script de DATOS
// y no código del motor: el nombre y el correo entran por parámetro (.claude/rules/motor-generico.md).
//   pnpm db:casa "<nombre de la empresa>" <correo del dueño>
// Idempotente: si ya hay una organización con is_home, la reusa y solo asegura la membresía.
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { membership, organization, profile } from "./schema.ts";

process.loadEnvFile(".env.local");
const [nombre, correo] = process.argv.slice(2);
if (!nombre || !correo) throw new Error('Uso: pnpm db:casa "<nombre>" <correo>');
const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error("DATABASE_URL_DIRECT no está definida — este script nunca usa el pooler.");
const sqlc = postgres(url, { prepare: false });
const db = drizzle(sqlc);

const [persona] = await db.select().from(profile).where(eq(profile.email, correo)).limit(1);
if (!persona) throw new Error(`No hay un usuario con el correo ${correo}: primero inicia sesión una vez en Improvement.`);

let [casa] = await db.select().from(organization).where(eq(organization.isHome, true)).limit(1);
if (!casa) {
  const slug = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  [casa] = await db.insert(organization).values({ name: nombre, slug, isHome: true, floor: 1 }).returning();
}
const [ya] = await db.select().from(membership).where(and(eq(membership.orgId, casa!.id), eq(membership.userId, persona.id))).limit(1);
if (ya && ya.role !== "owner") await db.update(membership).set({ role: "owner" }).where(and(eq(membership.orgId, casa!.id), eq(membership.userId, persona.id)));
if (!ya) await db.insert(membership).values({ userId: persona.id, orgId: casa!.id, role: "owner", acceptedAt: new Date() });

console.log(JSON.stringify({ orgId: casa!.id }));
await sqlc.end();
```
  Si la raíz no tiene `.env.local` con `DATABASE_URL_DIRECT` (el seed existente usa la misma ruta), correrlo desde
  donde lo corre `pnpm db:seed`.

- [ ] **Step 2: Gate y commit.** Es un script sin lógica ramificada que valga una prueba; el gate cubre el typecheck.
```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/db/src/seed-casa.ts package.json
git commit -m "feat(db): db:casa — la organización casa del dueño de la plataforma, por parámetro"
```

---

### Task 10: El admin — la tarjeta de la casa, fuera de las listas, abrir y evaluar

**Files:**
- Create: `apps/admin/lib/casa.js`
- Modify: `apps/admin/app/page.js`, `apps/admin/components/DashboardView.js`, `apps/admin/lib/orgStats.js`, `apps/admin/app/improvement/page.js`, `apps/admin/app/organizations/[orgId]/page.js`
- Test: `apps/admin/tests/casa.test.js`

**Interfaces:**
- Produces (`lib/casa.js`):
  - `getCasa(): Promise<{ id, name, floor, evolutionLevel } | null>`
  - `diagnosticosPorEvaluar(): Promise<{ id, orgId, orgName, floor, submittedAt, reviewNote }[]>` (status `evaluando`, el más viejo primero)
  - `abrirDiagnostico(orgId: string, floor: number, version: string): Promise<{ ok: true, data: { id } } | { ok: false, error: { code, mensaje } }>`.
    Si ya hay uno abierto, devuelve `{ ok: false, error: { code: "YA_ABIERTO" } }`.

- [ ] **Step 1: Prueba** (`apps/admin/tests/casa.test.js`; mismo estilo de las pruebas de integración del admin):
```js
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { diagnosis, organization } from "@jotapuntoce/db/schema";
import { abrirDiagnostico, diagnosticosPorEvaluar } from "../lib/casa.js";

const orgs = [];
afterEach(async () => {
  for (const id of orgs.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

describe("casa y diagnósticos", () => {
  it("abre uno por empresa y lista los que esperan evaluación", async () => {
    const [o] = await db.insert(organization).values({ name: "Org admin", slug: `casa-t-${crypto.randomUUID()}` }).returning();
    orgs.push(o.id);
    const r = await abrirDiagnostico(o.id, 1, "2026-10-06.1");
    expect(r.ok).toBe(true);
    expect(await abrirDiagnostico(o.id, 1, "2026-10-06.1")).toMatchObject({ ok: false, error: { code: "YA_ABIERTO" } });
    await db.update(diagnosis).set({ status: "evaluando", submittedAt: new Date() }).where(sql`${diagnosis.orgId} = ${o.id}`);
    expect((await diagnosticosPorEvaluar()).some((d) => d.orgId === o.id && d.orgName === "Org admin")).toBe(true);
  });
});
```

- [ ] **Step 2: `lib/casa.js`.**
```js
// La casa (la organización del dueño de la plataforma, organization.is_home) y los diagnósticos que esperan que
// Improvement los evalúe. Spec 2026-10-06-casa-y-diagnostico-360-design.md, §5 y §7. La casa se encuentra por la
// bandera, nunca por nombre.
import { and, asc, eq, ne } from "drizzle-orm";
import { diagnosis, organization } from "@jotapuntoce/db/schema";
import { db } from "./db.js";

export async function getCasa() {
  const [c] = await db
    .select({ id: organization.id, name: organization.name, floor: organization.floor, evolutionLevel: organization.evolutionLevel })
    .from(organization)
    .where(eq(organization.isHome, true))
    .limit(1);
  return c ?? null;
}

export async function diagnosticosPorEvaluar() {
  return db
    .select({ id: diagnosis.id, orgId: diagnosis.orgId, orgName: organization.name, floor: diagnosis.floor, submittedAt: diagnosis.submittedAt, reviewNote: diagnosis.reviewNote })
    .from(diagnosis)
    .innerJoin(organization, eq(organization.id, diagnosis.orgId))
    .where(eq(diagnosis.status, "evaluando"))
    .orderBy(asc(diagnosis.submittedAt));
}

export async function abrirDiagnostico(orgId, floor, version) {
  const [ya] = await db.select({ id: diagnosis.id }).from(diagnosis).where(and(eq(diagnosis.orgId, orgId), ne(diagnosis.status, "aprobado"))).limit(1);
  if (ya) return { ok: false, error: { code: "YA_ABIERTO", mensaje: "Esta empresa ya tiene un diagnóstico abierto." } };
  const [d] = await db.insert(diagnosis).values({ orgId, floor, questionnaireVersion: version }).returning({ id: diagnosis.id });
  return { ok: true, data: d };
}
```
  La versión del cuestionario vive en `apps/improvement`, y el admin no puede importar de ahí. Por eso se pasa como
  argumento: en el admin, la constante `CUESTIONARIO_VERSION = "2026-10-06.1"` va en `app/organizations/[orgId]/page.js`
  con el comentario `// Debe coincidir con apps/improvement/server/diagnostico/cuestionario.ts`.

- [ ] **Step 3: Pantallas.**
  - `app/page.js`: cargar `getCasa()` y `diagnosticosPorEvaluar()` junto a `getOrgStats` y pasarlos a `DashboardView`.
  - `DashboardView.js`, arriba de todo:
    - Si hay casa, una tarjeta "**{casa.name}** · mi empresa" con "Piso {floor}". Es un
      `<a href={`${improvementUrl}/empresas/${casa.id}`} target="_blank" rel="noreferrer">`, con los tokens de marca
      ya usados en ese archivo y sin hex nuevos.
    - Si hay diagnósticos por evaluar, una lista "Diagnósticos por evaluar" con la empresa, el piso, desde cuándo y
      la nota si existe.
  - `lib/orgStats.js` y `app/improvement/page.js`: excluir la casa de los conteos y de la lista de clientes,
    filtrando `organization.isHome` falso (`.where(eq(organization.isHome, false))` en el select de organizaciones).
  - `app/organizations/[orgId]/page.js`: una sección "Diagnóstico 360" con el estado del último diagnóstico y un
    formulario "Abrir diagnóstico del piso N" (N = `org.floor` si no hay ninguno aprobado; `org.floor + 1` si el
    último está aprobado). Su Server Action llama `requirePlatformAdmin()` y luego `abrirDiagnostico`.

- [ ] **Step 4: Correr, verificar en el navegador** (la tarjeta aparece solo si existe la casa; la lista vacía no
  pinta nada), **gate y commit.**
```bash
pnpm --filter @jotapuntoce/admin test tests/casa.test.js
pnpm lint && pnpm typecheck && pnpm test
git add apps/admin/lib/casa.js apps/admin/app apps/admin/components/DashboardView.js apps/admin/lib/orgStats.js apps/admin/tests/casa.test.js
git commit -m "feat(admin): la casa abre el panel, sale de las listas de clientes; abrir y evaluar diagnósticos"
```

---

### Task 11: La primera prueba real — el piso 1 de JotaPuntoCe (coordinador con el dueño)

No es una tarea de un subagente: la hace el coordinador con el dueño.

- [ ] **Step 1:** El dueño confirma que su usuario de Improvement existe (inició sesión al menos una vez). El
  coordinador corre `pnpm db:casa "JotaPuntoCe" <correo del dueño>` y guarda el `orgId`.
- [ ] **Step 2:** `cd apps/improvement && node --experimental-strip-types scripts/diagnostico.ts abrir <orgId> 1`.
- [ ] **Step 3:** El coordinador (Claude, con la skill `improvement`) pasa `JotaPuntoCe\Improvement\jotapuntoce\00`
  al `05` al formato de `diagnosisResultSchema`:
  - las 12 dimensiones con su madurez y las citas textuales del dueño;
  - piso 1 (0–5 clientes) y su paso del proceso;
  - las 14 necesidades como patógenos;
  - el blueprint con O1–O13;
  - la memoria;
  - `empresaDigital` con la cadena del CRM de `03-crm.md`.

  Lo guarda en el scratchpad como `casa-piso-1.json` y lo carga con `guardar <id> casa-piso-1.json --directo`.
  Anota el tamaño en `costos.md` §4.
- [ ] **Step 4:** El dueño abre el panel admin → su tarjeta → su edificio → "Tu diagnóstico", lo revisa y aprueba
  (o escribe "Algo no cuadra"; si lo hace, se corrige y se vuelve a guardar).
- [ ] **Step 5:** Verificar que su oficina muestra los objetivos, que `/necesidades` tiene las necesidades y que el
  letrero dice "Piso 1 · …". Expediente con `documentar-proceso` y memoria actualizada. Ofrecerle al dueño el PR de
  `chequeos` + `casa-diagnostico` a `main`.
