# Panel de Clientes para el platform admin + ícono personalizable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando un platform admin (Jose Carlos) entra a `/empresas` en `apps/improvement`, ver una
vista de **Clientes** (una tarjeta por persona) en vez del mosaico plano de organizaciones que ve un
cliente normal; al entrar a un cliente, ver sus empresas activas. Cada persona (cliente o admin)
puede personalizar el color de su propio ícono desde su propia sesión.

**Architecture:** `/empresas` se bifurca por rol: `profile.is_platform_admin` decide si se renderiza
el `CompanyPicker` existente (sin cambios, lo que ve un cliente normal) o el nuevo `ClientPicker`. La
agrupación por cliente se arma con `membership`+`profile` únicamente — nunca
`prospectClient`/`prospectCompany` (admin-only). La conexión de Drizzle de `apps/improvement`
(`DATABASE_URL`, pooled, sin JWT por-request) no lleva `auth.uid()`, así que las políticas RLS de
`membership`/`profile` no actúan como enforcement real para estas queries — el guard de aplicación
(`requirePlatformAdminSession()`, nuevo) es la única capa de seguridad real para esta vista
cross-usuario, igual que ya es cierto para `requireOrgMembership()` en el resto de esta app.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Vitest. Sin dependencias nuevas.

**Spec:** [docs/superpowers/specs/2026-09-04-panel-clientes-platform-admin-design.md](../specs/2026-09-04-panel-clientes-platform-admin-design.md)

## Global Constraints

- `apps/*/app/**` nunca importa `@jotapuntoce/db` directo — solo vía `apps/*/server/**`.
- `packages/ui/**` nunca importa `server/` ni `@jotapuntoce/db` — componentes de props puros.
- Todo token de color vive en `packages/ui/src/tokens.css`; ningún `.css`/`.tsx` nuevo escribe un
  hex literal — el ícono de cliente usa los 4 presets ya existentes (Aurora, Esmeralda, Solar,
  Índigo), reexpuestos como tokens nombrados, nunca valores nuevos.
- Import relativo con extensión explícita; alias `@/` para rutas dentro de la misma app, nunca
  `../../..`.
- `apps/improvement` nunca importa `prospectClient`/`prospectCompany` — esas tablas son solo de
  `apps/admin`, con la service-role key.
- Un usuario solo puede cambiar SU PROPIO `avatar_color` — ni siquiera un platform admin puede
  cambiar el de otro. Este guard tiene su propio test explícito.
- `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar cualquier tarea por hecha.

---

## Task 1: Schema — `avatar_color` en `profile`

**Files:**
- Modify: `packages/db/src/schema.ts` (bloque de `profile`, línea 45-51)
- Create: migración generada por `pnpm db:generate`

**Interfaces:**
- Produces: `profile.avatarColor: string | null` — usado por Task 2 (`clientList.ts`), Task 4
  (`loadClients.ts`), Task 7 (`updateAvatarColor.ts`).

- [ ] **Step 1: Agregar la columna al schema**

En `packages/db/src/schema.ts`, cambiar:

```ts
export const profile = pgTable("profile", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: createdAt(),
});
```

por:

```ts
export const profile = pgTable("profile", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  // Uno de los 4 presets de acento ya existentes en packages/ui/src/tokens.css:
  // "aurora" | "esmeralda" | "solar" | "indigo". null = usa "aurora" (el degradado default) al
  // renderizar. Elegido por el propio usuario — ver server/profile/updateAvatarColor.ts
  // (apps/improvement) — nunca editado por otra persona, ni siquiera un platform admin.
  avatarColor: text("avatar_color"),
  createdAt: createdAt(),
});
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `pnpm db:generate` — expect exit 0, un archivo nuevo con `ALTER TABLE "profile" ADD COLUMN
"avatar_color" text;` (nullable, instantáneo, sin backfill).
Run: `pnpm db:migrate` — expect exit 0.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @jotapuntoce/db typecheck` — expect exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat(db): agrega avatar_color a profile

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `buildClientList` — lógica pura, con tests

**Files:**
- Create: `apps/improvement/server/companies/clientList.ts`
- Test: `apps/improvement/tests/client-list.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `buildClientList(adminUserId, orgs, membershipsByOrgId, profilesById): ClientSummary[]`,
  tipos `ClientOrgMembership`, `ClientProfile`, `ClientOrgRow`, `ClientSummary` — usados por Task 4
  (`loadClients.ts`) y, vía el tipo `ClientSummary`, por Task 9 (`ClientPicker.tsx`).

- [ ] **Step 1: Escribir los tests (deben fallar)**

Crear `apps/improvement/tests/client-list.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildClientList } from "../server/companies/clientList.ts";

const ADMIN_ID = "admin-1";

describe("buildClientList", () => {
  it(
    "WHEN una organización no tiene ningún otro owner además del admin THE SYSTEM SHALL " +
      "excluirla del resultado (ej. la org demo de la plataforma)",
    () => {
      const orgs = [{ id: "org-1", name: "JotaPuntoCe (demo)" }];
      const membershipsByOrgId = new Map([
        ["org-1", [{ orgId: "org-1", userId: ADMIN_ID, role: "owner" as const, acceptedAt: new Date() }]],
      ]);
      const profilesById = new Map();

      expect(buildClientList(ADMIN_ID, orgs, membershipsByOrgId, profilesById)).toEqual([]);
    },
  );

  it("WHEN dos organizaciones tienen el mismo owner real THE SYSTEM SHALL agruparlas bajo un solo cliente", () => {
    const orgs = [
      { id: "org-camibel", name: "Camibel" },
      { id: "org-afianza", name: "Afianza" },
    ];
    const membershipsByOrgId = new Map([
      [
        "org-camibel",
        [
          { orgId: "org-camibel", userId: ADMIN_ID, role: "owner" as const, acceptedAt: new Date("2026-01-01") },
          { orgId: "org-camibel", userId: "jaime-1", role: "owner" as const, acceptedAt: new Date("2026-01-01") },
        ],
      ],
      [
        "org-afianza",
        [
          { orgId: "org-afianza", userId: ADMIN_ID, role: "owner" as const, acceptedAt: new Date("2026-01-02") },
          { orgId: "org-afianza", userId: "jaime-1", role: "owner" as const, acceptedAt: new Date("2026-01-02") },
        ],
      ],
    ]);
    const profilesById = new Map([
      ["jaime-1", { id: "jaime-1", fullName: "Jaime Salinas", email: "jaime@example.com", avatarColor: "indigo" }],
    ]);

    expect(buildClientList(ADMIN_ID, orgs, membershipsByOrgId, profilesById)).toEqual([
      {
        clientUserId: "jaime-1",
        name: "Jaime Salinas",
        avatarColor: "indigo",
        companies: [
          { orgId: "org-camibel", name: "Camibel" },
          { orgId: "org-afianza", name: "Afianza" },
        ],
      },
    ]);
  });

  it("WHEN una organización tiene dos owners que no son el admin THE SYSTEM SHALL usar el primero por acceptedAt", () => {
    const orgs = [{ id: "org-1", name: "Co-owned Co" }];
    const membershipsByOrgId = new Map([
      [
        "org-1",
        [
          { orgId: "org-1", userId: "later-1", role: "owner" as const, acceptedAt: new Date("2026-02-01") },
          { orgId: "org-1", userId: "earlier-1", role: "owner" as const, acceptedAt: new Date("2026-01-01") },
        ],
      ],
    ]);
    const profilesById = new Map([
      ["earlier-1", { id: "earlier-1", fullName: "Earlier Owner", email: "earlier@example.com", avatarColor: null }],
      ["later-1", { id: "later-1", fullName: "Later Owner", email: "later@example.com", avatarColor: null }],
    ]);

    const result = buildClientList(ADMIN_ID, orgs, membershipsByOrgId, profilesById);
    expect(result).toHaveLength(1);
    expect(result[0].clientUserId).toBe("earlier-1");
  });

  it("WHEN el nombre completo del cliente no existe THE SYSTEM SHALL usar su email como nombre", () => {
    const orgs = [{ id: "org-1", name: "Sin Nombre Co" }];
    const membershipsByOrgId = new Map([
      ["org-1", [{ orgId: "org-1", userId: "no-name-1", role: "owner" as const, acceptedAt: new Date() }]],
    ]);
    const profilesById = new Map([
      ["no-name-1", { id: "no-name-1", fullName: null, email: "sinnombre@example.com", avatarColor: null }],
    ]);

    const result = buildClientList(ADMIN_ID, orgs, membershipsByOrgId, profilesById);
    expect(result[0].name).toBe("sinnombre@example.com");
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/client-list.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

Crear `apps/improvement/server/companies/clientList.ts`:

```ts
// Lógica pura de agrupación de organizaciones por cliente real — sin acceso a datos. Un platform
// admin tiene membership en TODA organización (provisionOrganization, apps/admin), así que agrupar
// "sus" orgs directo produciría un mosaico plano sin sentido; esto identifica, para cada org, quién
// es su OTRO owner (el cliente real) y agrupa por esa persona. server/companies/loadClients.ts
// alimenta esto con datos reales.
export interface ClientOrgMembership {
  orgId: string;
  userId: string;
  role: "owner" | "employee";
  acceptedAt: Date | null;
}

export interface ClientProfile {
  id: string;
  fullName: string | null;
  email: string;
  avatarColor: string | null;
}

export interface ClientOrgRow {
  id: string;
  name: string;
}

export interface ClientSummary {
  clientUserId: string;
  name: string;
  avatarColor: string | null;
  companies: { orgId: string; name: string }[];
}

/**
 * WHEN una organización no tiene ningún membership role='owner' cuyo userId sea distinto de
 * adminUserId THE SYSTEM SHALL excluirla del resultado (criterio #1) — no pertenece a ningún
 * cliente. WHEN dos organizaciones comparten el mismo owner real THE SYSTEM SHALL agruparlas bajo
 * un solo ClientSummary (criterio #2). WHEN una organización tiene más de un owner no-admin THE
 * SYSTEM SHALL usar el más antiguo por acceptedAt, determinista (criterio #3).
 */
export function buildClientList(
  adminUserId: string,
  orgs: ClientOrgRow[],
  membershipsByOrgId: Map<string, ClientOrgMembership[]>,
  profilesById: Map<string, ClientProfile>,
): ClientSummary[] {
  const clientsByUserId = new Map<string, ClientSummary>();

  for (const org of orgs) {
    const orgMemberships = membershipsByOrgId.get(org.id) ?? [];
    const ownerMemberships = orgMemberships
      .filter((m) => m.role === "owner" && m.userId !== adminUserId)
      .sort((a, b) => (a.acceptedAt?.getTime() ?? 0) - (b.acceptedAt?.getTime() ?? 0));

    const clientMembership = ownerMemberships[0];
    if (!clientMembership) continue;

    const clientProfile = profilesById.get(clientMembership.userId);
    if (!clientProfile) continue;

    let client = clientsByUserId.get(clientMembership.userId);
    if (!client) {
      client = {
        clientUserId: clientMembership.userId,
        name: clientProfile.fullName ?? clientProfile.email,
        avatarColor: clientProfile.avatarColor,
        companies: [],
      };
      clientsByUserId.set(clientMembership.userId, client);
    }
    client.companies.push({ orgId: org.id, name: org.name });
  }

  return Array.from(clientsByUserId.values());
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/client-list.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0 ambos.

- [ ] **Step 6: Commit**

```bash
git add apps/improvement/server/companies/clientList.ts apps/improvement/tests/client-list.test.ts
git commit -m "feat(improvement): buildClientList, puro y testeado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `guard.ts` — `isPlatformAdmin` + `requirePlatformAdminSession`, con tests

**Files:**
- Modify: `apps/improvement/server/auth/guard.ts`
- Modify: `apps/improvement/tests/auth/guard.test.ts` (agregar tests, no tocar los existentes)

**Interfaces:**
- Consumes: `getSessionUserId` (ya existe, mismo archivo).
- Produces: `isPlatformAdmin(userId: string): Promise<boolean>`,
  `requirePlatformAdminSession(): Promise<string>` — usados por Task 9 (`/empresas/page.tsx`) y
  Task 10 (`/empresas/clientes/[clientUserId]/page.tsx`).

- [ ] **Step 1: Leer el archivo actual completo**

Leer `apps/improvement/server/auth/guard.ts` y `apps/improvement/tests/auth/guard.test.ts` antes de
editar — este task solo AGREGA, nunca modifica `findMembership`, `getSessionUserId`,
`assertMembership`, `requireOrgMembership` ni los tests que ya existen para ellas.

- [ ] **Step 2: Agregar el import de `profile`**

En `apps/improvement/server/auth/guard.ts`, cambiar la línea de import de schema de:

```ts
import { membership, organization } from "@jotapuntoce/db/schema";
```

a:

```ts
import { membership, organization, profile } from "@jotapuntoce/db/schema";
```

- [ ] **Step 3: Agregar las dos funciones nuevas**

Al final de `apps/improvement/server/auth/guard.ts`, después de `requireOrgMembership`, agregar:

```ts
async function fetchIsPlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isPlatformAdmin: profile.isPlatformAdmin })
    .from(profile)
    .where(eq(profile.id, userId))
    .limit(1);
  return row?.isPlatformAdmin ?? false;
}

/**
 * WHEN userId corresponde a un profile con is_platform_admin=true THE SYSTEM SHALL devolver true
 * (criterio #1); WHEN no existe ese profile, o existe con is_platform_admin=false, THE SYSTEM
 * SHALL devolver false, nunca lanzar (criterio #2) — usado para decidir qué renderizar en
 * /empresas, no para bloquear acceso (eso es requirePlatformAdminSession, abajo).
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  return fetchIsPlatformAdmin(userId);
}

/**
 * Guard de tenencia para rutas exclusivas de platform admin dentro de apps/improvement (ej.
 * /empresas/clientes/[clientUserId]) — mismo criterio 404-nunca-403 que requireOrgMembership: WHEN
 * no hay sesión, o la sesión no es platform admin, THE SYSTEM SHALL responder 404. Devuelve el
 * userId cuando sí lo es.
 */
export async function requirePlatformAdminSession(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) notFound();

  const admin = await fetchIsPlatformAdmin(userId);
  if (!admin) notFound();

  return userId;
}
```

- [ ] **Step 4: Agregar los tests**

En `apps/improvement/tests/auth/guard.test.ts`, agregar (sin tocar nada existente en el archivo):

```ts
import { isPlatformAdmin } from "../../server/auth/guard.ts";

describe("isPlatformAdmin", () => {
  it("WHEN el profile tiene is_platform_admin=true THE SYSTEM SHALL devolver true", async () => {
    // Reutiliza el mismo profile de platform admin real que ya usan los otros tests de este
    // archivo para el caso is_platform_admin=true (ver setup existente arriba) — no crear uno
    // nuevo, solo llamar isPlatformAdmin con ese mismo userId.
  });

  it("WHEN el profile tiene is_platform_admin=false o no existe THE SYSTEM SHALL devolver false", async () => {
    expect(await isPlatformAdmin("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
```

**Nota para quien implemente:** el primer test de arriba necesita el userId real de un platform
admin — leer el resto de `guard.test.ts` primero para ver cómo los tests existentes obtienen o
crean ese dato (ya hay al menos un test en este archivo que ejercita el flag
`is_platform_admin=true`), y reutilizar exactamente esa misma fuente de dato, no inventar un
profile nuevo ni hardcodear un email real de este entorno.

- [ ] **Step 5: Correr los tests**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/auth/guard.test.ts`
Expected: PASS, todos los tests (existentes + los 2 nuevos).

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0 ambos.

- [ ] **Step 7: Commit**

```bash
git add apps/improvement/server/auth/guard.ts apps/improvement/tests/auth/guard.test.ts
git commit -m "feat(improvement): guard — isPlatformAdmin + requirePlatformAdminSession

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `loadClients` — puente DB → `buildClientList`

**Files:**
- Create: `apps/improvement/server/companies/loadClients.ts`

**Interfaces:**
- Consumes: `buildClientList` y sus tipos (Task 2, `./clientList.ts`).
- Produces: `loadClients(adminUserId: string): Promise<ClientSummary[]>` — usado por Task 9
  (`app/empresas/page.tsx`).

- [ ] **Step 1: Implementar**

Crear `apps/improvement/server/companies/loadClients.ts`:

```ts
// Puente entre datos reales y buildClientList — apps/*/app/** nunca importa @jotapuntoce/db
// directo. La conexión de Drizzle de esta app (DATABASE_URL, pooled) no lleva auth.uid() por
// request, así que la política RLS de membership ("users read their own memberships") no bloquea
// esta consulta cross-usuario a nivel de base de datos — la única capa de seguridad real aquí es
// requirePlatformAdminSession() en el caller (app/empresas/page.tsx), no RLS. Ver
// docs/superpowers/specs/2026-09-04-panel-clientes-platform-admin-design.md.
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { buildClientList, type ClientOrgMembership, type ClientProfile, type ClientSummary } from "./clientList.ts";

export async function loadClients(adminUserId: string): Promise<ClientSummary[]> {
  const orgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(eq(membership.userId, adminUserId))
    .orderBy(asc(membership.acceptedAt));

  if (orgs.length === 0) return [];

  const orgIds = orgs.map((o) => o.id);
  const allMemberships = await db
    .select({
      orgId: membership.orgId,
      userId: membership.userId,
      role: membership.role,
      acceptedAt: membership.acceptedAt,
    })
    .from(membership)
    .where(inArray(membership.orgId, orgIds));

  const membershipsByOrgId = new Map<string, ClientOrgMembership[]>();
  for (const m of allMemberships) {
    const list = membershipsByOrgId.get(m.orgId) ?? [];
    list.push({
      orgId: m.orgId,
      userId: m.userId,
      role: m.role as ClientOrgMembership["role"],
      acceptedAt: m.acceptedAt,
    });
    membershipsByOrgId.set(m.orgId, list);
  }

  const clientUserIds = Array.from(
    new Set(allMemberships.filter((m) => m.userId !== adminUserId).map((m) => m.userId)),
  );
  if (clientUserIds.length === 0) return [];

  const profiles = await db
    .select({ id: profile.id, fullName: profile.fullName, email: profile.email, avatarColor: profile.avatarColor })
    .from(profile)
    .where(inArray(profile.id, clientUserIds));

  const profilesById = new Map<string, ClientProfile>(profiles.map((p) => [p.id, p]));

  return buildClientList(adminUserId, orgs, membershipsByOrgId, profilesById);
}
```

Sin test unitario — puente delgado de I/O, mismo criterio que `loadDashboardScene.ts`/`loadCompanies.ts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/improvement/server/companies/loadClients.ts
git commit -m "feat(improvement): loadClients — puente DB para buildClientList

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Tokens — presets nombrados + CSS de personalización

**Files:**
- Modify: `packages/ui/src/tokens.css`
- Modify: `packages/ui/src/building.css`

**Interfaces:**
- Produces: variables `--preset-aurora-1/2`, `--preset-esmeralda-1/2`, `--preset-solar-1/2`,
  `--preset-indigo-1/2`; clases `.personalize-avatar*` — usadas por Task 6 (`AvatarIcon.tsx`) y
  Task 8 (`PersonalizeAvatar.tsx`).

- [ ] **Step 1: Agregar los 8 presets nombrados a `tokens.css`**

En `packages/ui/src/tokens.css`, después del bloque `:root[data-accent="indigo"] { ... }` (los 4
presets ya existentes), agregar dentro del bloque `:root { ... }` principal (junto a `--accent-1`/
`--accent-2`, NO dentro de ningún `[data-accent]`):

```css
  /* Mismos 4 presets de arriba, reexpuestos como tokens nombrados directamente (no solo activables
     vía [data-accent]) — un componente que necesita mostrar VARIOS presets a la vez (ej. AvatarIcon,
     un color distinto por cliente) no puede usar [data-accent], que solo activa un preset global.
     Valores idénticos, ninguno nuevo. */
  --preset-aurora-1: #7c5cff;
  --preset-aurora-2: #22d3ee;
  --preset-esmeralda-1: #10b981;
  --preset-esmeralda-2: #a3e635;
  --preset-solar-1: #fb923c;
  --preset-solar-2: #f472b6;
  --preset-indigo-1: #6366f1;
  --preset-indigo-2: #3b82f6;
```

- [ ] **Step 2: Agregar CSS de `PersonalizeAvatar` a `building.css`**

Al final de `packages/ui/src/building.css`, agregar:

```css
/* ===== PersonalizeAvatar (/empresas, apps/improvement) ===== */
.personalize-avatar {
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}
.personalize-avatar-trigger {
  font-family: var(--font-geist-mono), monospace;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  cursor: pointer;
}
.personalize-avatar-trigger:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.personalize-avatar-menu {
  position: absolute;
  top: 100%;
  margin-top: 8px;
  display: flex;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px;
  z-index: 1;
}
.personalize-avatar-option {
  font-size: 12px;
  color: var(--text-primary);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
}
.personalize-avatar-option:hover:not(:disabled) {
  border-color: var(--accent-2);
}
.personalize-avatar-option:disabled {
  opacity: 0.5;
  cursor: default;
}
.personalize-avatar-saved {
  position: absolute;
  top: 100%;
  margin-top: 8px;
  font-size: 12px;
  color: var(--success);
}
```

- [ ] **Step 3: Verificar que ambos builds compilan**

Run: `pnpm --filter @jotapuntoce/admin build && pnpm --filter @jotapuntoce/improvement build`
Expected: exit 0 ambos — nada consume estas clases/tokens todavía, es solo agregar CSS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/tokens.css packages/ui/src/building.css
git commit -m "feat(ui): agrega presets de acento nombrados + CSS de PersonalizeAvatar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `AvatarIcon.tsx` — componente compartido en `packages/ui`

**Files:**
- Create: `packages/ui/src/building/AvatarIcon.tsx`
- Modify: `packages/ui/package.json` (exportar `./building/AvatarIcon.tsx`)

**Interfaces:**
- Consumes: variables `--preset-*` de Task 5 (`packages/ui/src/tokens.css`), clases
  `.app-icon-large-wrap`/`.app-icon-large`/`.app-icon-large-grid`/`.app-icon-large-shine`/
  `.app-icon-large-label` (ya existen, de un plan anterior).
- Produces: `AvatarIcon({ name, avatarColor?, size? }): JSX.Element`, tipo `AvatarColorPreset` —
  usados por Task 9 (`ClientPicker.tsx`).

- [ ] **Step 1: Implementar**

Crear `packages/ui/src/building/AvatarIcon.tsx`:

```tsx
// Variante de AppIconLarge.tsx (mismo archivo, misma familia) para representar una PERSONA (un
// cliente), no una empresa — mismo lenguaje visual (degradado, grid, brillo), con iniciales en vez
// del glyph de cuadrícula, sin badge de etapa. El degradado usa uno de los 4 presets de acento ya
// existentes en packages/ui/src/tokens.css, reexpuestos como tokens nombrados (Task 5) — nunca un
// hex literal en este archivo.
export type AvatarColorPreset = "aurora" | "esmeralda" | "solar" | "indigo";

const PRESET_TOKENS: Record<AvatarColorPreset, [string, string]> = {
  aurora: ["var(--preset-aurora-1)", "var(--preset-aurora-2)"],
  esmeralda: ["var(--preset-esmeralda-1)", "var(--preset-esmeralda-2)"],
  solar: ["var(--preset-solar-1)", "var(--preset-solar-2)"],
  indigo: ["var(--preset-indigo-1)", "var(--preset-indigo-2)"],
};

export interface AvatarIconProps {
  name: string;
  avatarColor?: AvatarColorPreset;
  size?: number;
}

/**
 * WHEN name tiene 2 o más palabras THE SYSTEM SHALL devolver la primera letra de la primera
 * palabra más la primera letra de la última (criterio #1). WHEN name tiene una sola palabra THE
 * SYSTEM SHALL devolver solo esa letra (criterio #2). WHEN name está vacío THE SYSTEM SHALL
 * devolver una cadena vacía, nunca lanzar (criterio #3).
 */
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)).toUpperCase();
}

export function AvatarIcon({ name, avatarColor = "aurora", size = 96 }: AvatarIconProps) {
  const [c1, c2] = PRESET_TOKENS[avatarColor];
  const initialsFontSize = Math.round(size * 0.36);

  return (
    <span className="app-icon-large-wrap" style={{ width: size }}>
      <span
        className="app-icon-large"
        style={{ width: size, height: size, background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      >
        <span className="app-icon-large-grid" aria-hidden="true" />
        <span className="app-icon-large-shine" aria-hidden="true" />
        <span
          className="app-icon-large-glyph"
          style={{ fontSize: initialsFontSize, fontWeight: 700, color: "var(--text-primary)" }}
        >
          {initialsFor(name)}
        </span>
      </span>
      <span className="app-icon-large-label">{name}</span>
    </span>
  );
}
```

- [ ] **Step 2: Exportar desde `packages/ui`**

En `packages/ui/package.json`, agregar a `exports` (ya tiene `tokens.css`, `building.css`,
`Building.tsx`, `Reception.tsx`, `AppIconLarge.tsx` — agregar a esa lista):

```json
    "./building/AvatarIcon.tsx": "./src/building/AvatarIcon.tsx"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @jotapuntoce/ui exec tsc --noEmit --jsx react-jsx --esModuleInterop --skipLibCheck --ignoreConfig src/building/AvatarIcon.tsx`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/building/AvatarIcon.tsx packages/ui/package.json
git commit -m "feat(ui): AvatarIcon — ícono personalizable de cliente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `updateAvatarColor` — Server Action, con tests

**Files:**
- Create: `apps/improvement/server/profile/updateAvatarColor.ts`
- Test: `apps/improvement/tests/update-avatar-color.test.ts`

**Interfaces:**
- Consumes: `getSessionUserId` (ya existe, `server/auth/guard.ts`).
- Produces: `updateAvatarColor(preset: string): Promise<{ ok: true } | { ok: false; error: string }>`
  — usado por Task 8 (`PersonalizeAvatar.tsx`). También `setAvatarColorForUser(userId, preset)`, la
  lógica de negocio sin guard de sesión — usada solo por el propio test de este task.

- [ ] **Step 1: Escribir los tests (deben fallar)**

Crear `apps/improvement/tests/update-avatar-color.test.ts`. `updateAvatarColor` (el export público)
siempre resuelve el userId vía `getSessionUserId()`, que depende de `cookies()` de `next/headers` —
inalcanzable en un test fuera de un request real de Next, mismo problema ya resuelto para
`provisionOrganization`/`markProspectLive` en `apps/admin/app/prospects/actions.js` (ver
`apps/admin/tests/prospects.test.js`, línea 1-4: se prueba la lógica de negocio sin el wrapper que
usa `cookies()`, no el wrapper). Aquí el mismo patrón: `setAvatarColorForUser(userId, preset)` es la
lógica de negocio pura, testeable sin sesión real — Step 3 la exporta desde el mismo archivo.

```ts
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, supabaseAdmin } from "@jotapuntoce/db";
import { profile } from "@jotapuntoce/db/schema";
import { setAvatarColorForUser } from "../server/profile/updateAvatarColor.ts";

const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(eq(profile.id, userId));
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
  }
});

async function insertTestProfile() {
  const email = `test-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: "TestPass!123", email_confirm: true });
  if (error || !data.user) throw new Error(`No se pudo crear el usuario de prueba: ${error?.message}`);
  await db.insert(profile).values({ id: data.user.id, email, fullName: "Test User" });
  createdProfileIds.push(data.user.id);
  return data.user.id;
}

describe("setAvatarColorForUser", () => {
  it("WHEN el preset es uno de los 4 válidos THE SYSTEM SHALL actualizar avatar_color de ese userId", async () => {
    const userId = await insertTestProfile();

    const result = await setAvatarColorForUser(userId, "esmeralda");
    expect(result).toEqual({ ok: true });

    const [row] = await db.select().from(profile).where(eq(profile.id, userId)).limit(1);
    expect(row.avatarColor).toBe("esmeralda");
  });

  it("WHEN el preset no es uno de los 4 válidos THE SYSTEM SHALL rechazarlo y no tocar la fila", async () => {
    const userId = await insertTestProfile();

    const result = await setAvatarColorForUser(userId, "morado-invalido");
    expect(result.ok).toBe(false);

    const [row] = await db.select().from(profile).where(eq(profile.id, userId)).limit(1);
    expect(row.avatarColor).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/update-avatar-color.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

Crear `apps/improvement/server/profile/updateAvatarColor.ts`:

```ts
"use server";

// Server Action — un usuario solo puede cambiar SU PROPIO avatar_color, nunca el de otro (ni
// siquiera un platform admin puede cambiar el de un cliente). updateAvatarColor (el export público,
// llamado desde el cliente) SIEMPRE resuelve el userId desde la sesión real vía getSessionUserId()
// — nunca acepta un userId externo. setAvatarColorForUser es la lógica de negocio pura, sin ese
// guard, para poder probarla sin mockear cookies() (mismo patrón que provisionOrganization en
// apps/admin/app/prospects/actions.js).
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { profile } from "@jotapuntoce/db/schema";
import { getSessionUserId } from "../auth/guard.ts";

const VALID_PRESETS = ["aurora", "esmeralda", "solar", "indigo"] as const;
type AvatarColorPreset = (typeof VALID_PRESETS)[number];

function isValidPreset(value: string): value is AvatarColorPreset {
  return (VALID_PRESETS as readonly string[]).includes(value);
}

export async function setAvatarColorForUser(
  userId: string,
  preset: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidPreset(preset)) {
    return { ok: false, error: `Preset inválido: ${preset}` };
  }

  await db.update(profile).set({ avatarColor: preset }).where(eq(profile.id, userId));
  return { ok: true };
}

export async function updateAvatarColor(preset: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sin sesión" };

  return setAvatarColorForUser(userId, preset);
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `pnpm --filter @jotapuntoce/improvement exec vitest run tests/update-avatar-color.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0 ambos.

- [ ] **Step 6: Commit**

```bash
git add apps/improvement/server/profile/updateAvatarColor.ts apps/improvement/tests/update-avatar-color.test.ts
git commit -m "feat(improvement): updateAvatarColor — cada quien personaliza solo el suyo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `PersonalizeAvatar.tsx`

**Files:**
- Create: `apps/improvement/app/empresas/PersonalizeAvatar.tsx`

**Interfaces:**
- Consumes: `updateAvatarColor` (Task 7), tipo `AvatarColorPreset` (Task 6,
  `@jotapuntoce/ui/building/AvatarIcon.tsx`).
- Produces: `PersonalizeAvatar(): JSX.Element` — usado por Task 9 (`app/empresas/page.tsx`).

- [ ] **Step 1: Implementar**

Crear `apps/improvement/app/empresas/PersonalizeAvatar.tsx`:

```tsx
"use client";

// Visible en /empresas para CUALQUIER usuario (cliente o platform admin) — cada quien personaliza
// solo su propio ícono. Llama a updateAvatarColor (Task 7), que siempre resuelve el userId desde la
// sesión real, nunca desde un parámetro que este componente pudiera manipular.
import { useState, useTransition } from "react";
import { updateAvatarColor } from "@/server/profile/updateAvatarColor.ts";
import type { AvatarColorPreset } from "@jotapuntoce/ui/building/AvatarIcon.tsx";

const PRESETS: { id: AvatarColorPreset; label: string }[] = [
  { id: "aurora", label: "Aurora" },
  { id: "esmeralda", label: "Esmeralda" },
  { id: "solar", label: "Solar" },
  { id: "indigo", label: "Índigo" },
];

export function PersonalizeAvatar() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function choose(presetId: AvatarColorPreset) {
    startTransition(async () => {
      const result = await updateAvatarColor(presetId);
      if (result.ok) {
        setSaved(true);
        setOpen(false);
      }
    });
  }

  return (
    <div className="personalize-avatar">
      <button type="button" className="personalize-avatar-trigger" onClick={() => setOpen((o) => !o)}>
        Personalizar mi ícono
      </button>
      {open && (
        <div className="personalize-avatar-menu">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="personalize-avatar-option"
              disabled={isPending}
              onClick={() => choose(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {saved && <p className="personalize-avatar-saved">Guardado.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck`
Expected: exit 0 ambos (la integración real con `/empresas/page.tsx` es Task 9).

- [ ] **Step 3: Commit**

```bash
git add apps/improvement/app/empresas/PersonalizeAvatar.tsx
git commit -m "feat(improvement): PersonalizeAvatar — selector de color de ícono propio

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `ClientPicker.tsx` + `/empresas` se bifurca por rol

**Files:**
- Create: `apps/improvement/app/empresas/ClientPicker.tsx`
- Modify: `apps/improvement/app/empresas/page.tsx`

**Interfaces:**
- Consumes: `AvatarIcon` (Task 6), `loadClients` (Task 4), `isPlatformAdmin` (Task 3),
  `PersonalizeAvatar` (Task 8), tipo `ClientSummary` (Task 2, `server/companies/clientList.ts`).
- Produces: nada nuevo consumido por tareas posteriores — cierra el flujo de `/empresas`.

- [ ] **Step 1: `ClientPicker.tsx`**

Crear `apps/improvement/app/empresas/ClientPicker.tsx`:

```tsx
"use client";

// Panel de Clientes — solo se renderiza para platform admins (ver page.tsx). A diferencia de
// CompanyPicker, sin efecto Rappi: aquí no hay "estado de construcción" que resumir, es una lista
// de personas, no de empresas.
import { useRouter } from "next/navigation";
import { AvatarIcon } from "@jotapuntoce/ui/building/AvatarIcon.tsx";
import type { ClientSummary } from "@/server/companies/clientList.ts";

export function ClientPicker({ clients }: { clients: ClientSummary[] }) {
  const router = useRouter();

  return (
    <div className="empresas-grid">
      {clients.map((c) => (
        <button
          key={c.clientUserId}
          type="button"
          className="empresas-tile"
          onClick={() => router.push(`/empresas/clientes/${c.clientUserId}`)}
        >
          <AvatarIcon name={c.name} avatarColor={c.avatarColor ?? undefined} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Reemplazar `page.tsx`**

Reemplazar todo el contenido de `apps/improvement/app/empresas/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUserId, isPlatformAdmin } from "@/server/auth/guard.ts";
import { loadCompanies } from "@/server/companies/loadCompanies.ts";
import { loadClients } from "@/server/companies/loadClients.ts";
import { CompanyPicker } from "./CompanyPicker.tsx";
import { ClientPicker } from "./ClientPicker.tsx";
import { PersonalizeAvatar } from "./PersonalizeAvatar.tsx";

export default async function EmpresasPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const admin = await isPlatformAdmin(userId);

  if (admin) {
    const clients = await loadClients(userId);
    return (
      <main className="empresas-page">
        <PersonalizeAvatar />
        {clients.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
            Todavía no tienes ningún cliente con empresas activas.
          </p>
        ) : (
          <ClientPicker clients={clients} />
        )}
      </main>
    );
  }

  const companies = await loadCompanies(userId);
  return (
    <main className="empresas-page">
      <PersonalizeAvatar />
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

- [ ] **Step 3: Lint + typecheck + build**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck && pnpm --filter @jotapuntoce/improvement build`
Expected: exit 0 los tres.

- [ ] **Step 4: Commit**

```bash
git add apps/improvement/app/empresas/ClientPicker.tsx apps/improvement/app/empresas/page.tsx
git commit -m "feat(improvement): /empresas se bifurca por rol — ClientPicker para platform admin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Ruta `/empresas/clientes/[clientUserId]`

**Files:**
- Create: `apps/improvement/app/empresas/clientes/[clientUserId]/page.tsx`

**Interfaces:**
- Consumes: `requirePlatformAdminSession` (Task 3), `loadCompanies` (ya existe, reutilizado tal
  cual — ya acepta cualquier `userId`, no solo el de la sesión actual), `CompanyPicker` (ya existe).
- Produces: la ruta a la que `ClientPicker` (Task 9) ya navega.

- [ ] **Step 1: Implementar**

Crear `apps/improvement/app/empresas/clientes/[clientUserId]/page.tsx`:

```tsx
import { requirePlatformAdminSession } from "@/server/auth/guard.ts";
import { loadCompanies } from "@/server/companies/loadCompanies.ts";
import { CompanyPicker } from "@/app/empresas/CompanyPicker.tsx";

export default async function ClientCompaniesPage({
  params,
}: {
  params: Promise<{ clientUserId: string }>;
}) {
  await requirePlatformAdminSession();
  const { clientUserId } = await params;

  const companies = await loadCompanies(clientUserId);

  return (
    <main className="empresas-page">
      {companies.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Este cliente todavía no tiene ninguna empresa activa.
        </p>
      ) : (
        <CompanyPicker companies={companies} />
      )}
    </main>
  );
}
```

`loadCompanies` ya toma cualquier `userId` como parámetro (no está atado a la sesión actual) —
reutilizarla tal cual para el cliente específico es correcto, sin crear un archivo nuevo.

- [ ] **Step 2: Lint + typecheck + build**

Run: `pnpm --filter @jotapuntoce/improvement lint && pnpm --filter @jotapuntoce/improvement typecheck && pnpm --filter @jotapuntoce/improvement build`
Expected: exit 0 los tres.

- [ ] **Step 3: Commit**

```bash
git add "apps/improvement/app/empresas/clientes/"
git commit -m "feat(improvement): ruta /empresas/clientes/[clientUserId] — empresas activas de un cliente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Gate completo + verificación visual end-to-end

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Gate completo del monorepo**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: exit 0 en los 4.

- [ ] **Step 2: Verificación visual — flujo del platform admin**

Usar el Browser tool: `preview_start` con `pnpm dev:improvement`, iniciar sesión con la cuenta real
de platform admin.

Confirmar:
- `/empresas` muestra el panel de Clientes (no un mosaico de organizaciones sueltas) — orgs sin
  otro owner real (ej. la org demo de la plataforma) NO aparecen aquí.
- Cada tarjeta de cliente muestra sus iniciales sobre el degradado correspondiente a su
  `avatar_color` (o el degradado Aurora por default si no lo ha personalizado).
- Clic en un cliente navega a `/empresas/clientes/[clientUserId]` y muestra sus empresas activas
  reales, con el mismo `CompanyPicker` que ya existía.
- "Personalizar mi ícono" abre el selector de 4 presets; elegir uno lo guarda (confirmar
  recargando la página — el ícono del propio admin, si se muestra en algún lado, refleja el cambio).

- [ ] **Step 3: Verificación visual — flujo de un cliente normal**

Con una cuenta que NO sea platform admin (ej. reutilizar el patrón de datos sintéticos de
verificaciones anteriores: crear un usuario + org + membership de prueba, iniciar sesión,
verificar, limpiar después):
- `/empresas` sigue mostrando el `CompanyPicker` de siempre — sin el panel de Clientes, sin cambio
  de comportamiento respecto a antes de este plan.
- "Personalizar mi ícono" también está disponible aquí, y afecta solo su propio `avatar_color`.

- [ ] **Step 4: Verificación de aislamiento**

Con la cuenta de cliente normal (no admin) del Step 3, navegar directo a
`/empresas/clientes/<cualquier-uuid>`. Expected: 404 (nunca 403) — `requirePlatformAdminSession`
bloquea correctamente a quien no es platform admin.

- [ ] **Step 5: Commit final (si algo quedó sin commitear)**

```bash
git status --short
```
