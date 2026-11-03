# Fase 1 — Base del frente estilo Odoo: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

**Meta:** Que Jaime opere su ERP/CRM actual dentro de un frente nuevo:
- barra izquierda de apps al estilo Whop;
- inicio con su portada, su logo y sus tarjetas;
- su marca en todo;
- vistas lista, kanban y ficha generadas desde configuración;
- sin el edificio 3D.

**Arquitectura:** Motor de configuración híbrido (spec §3). Las apps base (`clientes`, `ventas`,
`proyectos`, `postventa`) conservan sus tablas reales y se describen con filas en `app_group`,
`app_model`, `app_stage`, `app_field` y `app_view`. Los campos extra viven en una columna nueva
`custom jsonb`.

Un **adaptador por app base** (`server/apps/adapters.ts`) traduce cada tabla real a un registro
normalizado, y un solo juego de vistas (lista, kanban, ficha) lo dibuja. Las escrituras de etapa
delegan en las funciones que ya existen (`moveDeal`, `moveTicket`, `authorizeProject`, `updateClient`)
para no duplicar reglas.

**Stack:** Next.js 16 App Router · TypeScript 6 · Drizzle 0.45 sobre Supabase · zod · Vitest ·
Playwright + axe · Tailwind v4 CSS-first.

**Spec:** `blueprints/improvement-odoo/spec.md` (secciones 2, 3, 4 y 9, fase 1).

## Restricciones globales

- Toda tabla org-scoped nueva nace con su política RLS en la migración `--custom` del mismo paso.
- Nunca editar a mano una migración generada; solo los `*_rls.sql` custom.
- `pnpm db:migrate` solo después de mostrar el SQL a Jose Carlos y recibir un "sí" explícito por
  migración.
- Cada función exportada de `apps/improvement/server/**` empieza con `assertMembership`,
  `findOwnerMembership` o `resolveSection`.
- Las rutas (`app/**`) no importan `@jotapuntoce/db`; los componentes no importan `server/`.
- Motor genérico: ningún uuid, slug ni nombre de cliente en `server/**` o `packages/db/**`.
- Import relativo con extensión `.ts`/`.tsx`, alias `@/`, sin barrel files.
- Errores como resultados `{ ok: true, data } | { ok: false, error: { code, message } }`.
- Tokens solo en `packages/ui/src/tokens.css`; ningún hex nuevo en componentes. Los colores del
  negocio entran como variables CSS inline calculadas de `org_brand`, nunca como literal.
- Improvement: negro + degradado verde `#1fbe79 → #98e33b` (login, registro, burbuja). Dentro del
  negocio, su marca.
- `apps/admin` sigue usando `packages/ui/src/building/*`: el edificio se quita **solo** de
  `apps/improvement`.
- Sin dependencias nuevas en esta fase.
- Sin ranking en Improvement. Textos en español; "Jotapuntoce", nunca "J.C".
- Gate antes de marcar una tarea: `pnpm lint && pnpm typecheck && pnpm test`.
- Mensaje de commit con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisiones de esta fase

- **Etapas de apps base:** se siembran desde los enums que ya existen (`DEAL_STAGES`,
  `TICKET_STATUSES`, `PROJECT_AUTHORIZATION`, salud del cliente). En la Fase 1 el dueño puede
  **renombrarlas y reordenarlas**; agregar o quitar etapas en apps base queda para la Fase 2, porque
  exige relajar los checks de la base y la lógica que depende de `ganado`.
- **Permisos de cada app base:** los da su sección existente (`clientes`, `proyectos`, `postventa`).
  `ventas` usa la sección `clientes`, igual que hoy el pipeline.
- **"Vista previa como":** solo **reduce** lo que ve el dueño en páginas y barra (cookie
  `imp-preview-as` con el id de un `permission_type` de ese org). Las Server Actions siguen usando el
  rol real.
- **Logo y portada:** en esta fase son URLs (el bucket de Storage que ya usa la app). Subirlos con
  extracción de colores por IA es Fase 2.
- **Tablero:** en esta fase el inicio tiene un juego fijo de tarjetas (lo que toca hoy e indicadores).
  El tablero personalizable es Fase 5.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` | Tablas `org_brand`, `app_group`, `app_model`, `app_stage`, `app_field`, `app_view`, `record_activity`; columna `custom` en `client`, `deal`, `project`, `ticket`. |
| `packages/db/migrations/00NN_*.sql` + `00NN+1_apps_rls.sql` | Generada + RLS. |
| `packages/ui/src/tokens.css` | Tokens `--brand-improvement-1/2` y remapeo `:root[data-brand="improvement"]`. |
| `apps/improvement/app/layout.tsx` | `data-brand="improvement"` en `<html>`. |
| `apps/improvement/server/apps/catalog.ts` | `BASE_APPS` (catálogo genérico) y `ensureOrgApps(orgId)`. |
| `apps/improvement/server/apps/fields.ts` | `schemaFor(fields)`, `addField`, `saveCustomValues`. |
| `apps/improvement/server/apps/adapters.ts` | Un adaptador por app base: listar, obtener, mover de etapa. |
| `apps/improvement/server/apps/records.ts` | `listRecords`, `getRecord`, `moveRecord`, `addNote`, `listActivity`. |
| `apps/improvement/server/apps/sidebar.ts` | `loadSidebar(userId, orgId)` filtrado por permisos y vista previa. |
| `apps/improvement/server/apps/config.ts` | `renameStage`, `reorderStages`, `saveGroups` (solo dueño). |
| `apps/improvement/server/brand/brand.ts` | `getBrand`, `saveBrand`, `brandStyle` (puro). |
| `apps/improvement/server/auth/preview.ts` | `getPreviewGrants(orgId)`, `setPreview`, `clearPreview`. |
| `apps/improvement/components/shell/*` | `AppShell`, `Sidebar`, `OrgSwitcher`, `PreviewAs`, `ControlPanel`. |
| `apps/improvement/components/views/*` | `ListView`, `KanbanBoard` (cliente), `RecordForm`, `ActivityLog`. |
| `apps/improvement/app/[org]/layout.tsx` | Reemplazado por `AppShell`. |
| `apps/improvement/app/[org]/page.tsx` | Inicio: portada, logo y tarjetas. |
| `apps/improvement/app/[org]/a/[app]/page.tsx` | Lista o kanban (`?vista=`). |
| `apps/improvement/app/[org]/a/[app]/[id]/page.tsx` | Ficha con campos extra y bitácora. |
| `apps/improvement/app/[org]/configuracion/marca/page.tsx` | Editar `org_brand` (dueño). |
| `apps/improvement/app/page.tsx`, `app/empresas/[orgId]/page.tsx` | Sin edificio: el dueño llega a `/[org]`. |

---

### Tarea 1: Esquema de configuración y RLS

**Archivos:**
- Modificar: `packages/db/src/schema.ts` (al final, más la columna `custom` en 4 tablas)
- Crear: migraciones generadas + `packages/db/migrations/00NN_apps_rls.sql`
- Test: `apps/improvement/tests/apps-schema.test.ts`

**Interfaces:**
- Produce: tablas `orgBrand`, `appGroup`, `appModel`, `appStage`, `appField`, `appView`,
  `recordActivity`; constantes `APP_FIELD_TYPES`, `APP_VIEW_KINDS`; columna `custom` en `client`,
  `deal`, `project`, `ticket`.

- [ ] **Paso 1: Prueba que falla**

```ts
// apps/improvement/tests/apps-schema.test.ts
// El esquema de configuración contra el Supabase de desarrollo: llaves únicas, custom por defecto y
// RLS de lectura (miembro sí, ajeno no).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appStage, client, membership, orgBrand, organization, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db.insert(organization).values({ name: "t-apps", slug: `t-apps-${crypto.randomUUID()}` }).returning();
  orgIds.push(row!.id);
  return row!.id;
}
async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
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

describe("esquema de apps", () => {
  it("WHEN se crea un cliente THE SYSTEM SHALL dejar custom en {}", async () => {
    const o = await org();
    const [c] = await db.insert(client).values({ orgId: o, name: "C" }).returning();
    expect(c!.custom).toEqual({});
  });

  it("WHEN se repite la llave de una app en el mismo org THE SYSTEM SHALL rechazarla", async () => {
    const o = await org();
    await db.insert(appModel).values({ orgId: o, key: "ventas", name: "Ventas", kind: "base", section: "clientes" });
    await expect(
      db.insert(appModel).values({ orgId: o, key: "ventas", name: "Otra", kind: "base", section: "clientes" }),
    ).rejects.toThrow();
  });

  it("WHEN un miembro lee la configuración de su org THE SYSTEM SHALL verla; uno ajeno ve 0 filas", async () => {
    const o = await org();
    const other = await org();
    const member = await person(o, "employee");
    const outsider = await person(other, "owner");
    const [m] = await db.insert(appModel).values({ orgId: o, key: "ventas", name: "Ventas", kind: "base", section: "clientes" }).returning();
    await db.insert(appStage).values({ orgId: o, appId: m!.id, key: "prospecto", name: "Prospecto", position: 0 });
    await db.insert(orgBrand).values({ orgId: o, primaryColor: "#123456" });
    for (const table of ["app_model", "app_stage", "org_brand"]) {
      expect(await asUser(member, `select 1 from ${table} where org_id = '${o}'`)).toHaveLength(1);
      expect(await asUser(outsider, `select 1 from ${table} where org_id = '${o}'`)).toHaveLength(0);
    }
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/apps-schema.test.ts`
Expected: FAIL; `appModel` no se exporta de `@jotapuntoce/db/schema`.

- [ ] **Paso 3: Esquema**

Agrega `custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default(sql\`'{}'::jsonb\`),`
justo antes de `createdAt` en `client`, `deal`, `project` y `ticket`. Luego agrega al final de
`schema.ts`:

```ts
// ─── Motor de apps (blueprint improvement-odoo, fase 1) ───────────────────────────────────────────
// Lo que el dueño personaliza son filas: apps, grupos, etapas, campos extra y vistas. Las apps base
// apuntan a su tabla real (`kind = 'base'`); las del dueño (`custom`) llegan en la fase 2.

export const APP_FIELD_TYPES = ["texto", "numero", "dinero", "fecha", "opcion", "si_no"] as const;
export const APP_VIEW_KINDS = ["lista", "kanban", "ficha"] as const;

export const orgBrand = pgTable("org_brand", {
  id: id(),
  orgId: uuid("org_id").notNull().unique().references(() => organization.id, { onDelete: "cascade" }),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("org_brand_primary_hex", sql`${t.primaryColor} is null or ${t.primaryColor} ~ '^#[0-9a-fA-F]{6}$'`),
  check("org_brand_secondary_hex", sql`${t.secondaryColor} is null or ${t.secondaryColor} ~ '^#[0-9a-fA-F]{6}$'`),
]);

export const appGroup = pgTable("app_group", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("idx_app_group_org").on(t.orgId)]);

export const appModel = pgTable("app_model", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["base", "custom"] }).notNull(),
  // La sección de permisos que la abre (SECTION_SLUGS). Las custom de la fase 2 traerán la suya.
  section: text("section").notNull(),
  icon: text("icon"),
  groupId: uuid("group_id").references(() => appGroup.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("uq_app_model_org_key").on(t.orgId, t.key),
  check("app_model_kind_check", sql`${t.kind} in ('base','custom')`),
]);

export const appStage = pgTable("app_stage", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  appId: uuid("app_id").notNull().references(() => appModel.id, { onDelete: "cascade" }),
  // En apps base, el valor real de la columna de etapa (p. ej. 'ganado'). Nunca cambia; el nombre sí.
  key: text("key").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [unique("uq_app_stage_app_key").on(t.appId, t.key)]);

export const appField = pgTable("app_field", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  appId: uuid("app_id").notNull().references(() => appModel.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: text("type", { enum: APP_FIELD_TYPES }).notNull(),
  options: jsonb("options").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  required: boolean("required").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("uq_app_field_app_key").on(t.appId, t.key),
  check("app_field_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]{1,39}$'`),
]);

export const appView = pgTable("app_view", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  appId: uuid("app_id").notNull().references(() => appModel.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: APP_VIEW_KINDS }).notNull(),
  // Llaves de campo visibles, en orden. Las de la tabla base usan su nombre ('title', 'amount').
  columns: jsonb("columns").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recordActivity = pgTable("record_activity", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  appKey: text("app_key").notNull(),
  // La sección que permite leerla: la RLS la usa sin unir con app_model.
  section: text("section").notNull(),
  recordId: uuid("record_id").notNull(),
  kind: text("kind", { enum: ["nota", "cambio"] }).notNull(),
  body: text("body").notNull(),
  actorId: uuid("actor_id").references(() => profile.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("idx_record_activity_record").on(t.orgId, t.recordId)]);
```

Confirma que `boolean` esté en el import de `drizzle-orm/pg-core`; si no, agrégalo.

- [ ] **Paso 4: Migraciones**

```bash
pnpm db:generate
pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=apps_rls
```

Pega en el `*_apps_rls.sql`:

```sql
-- Motor de apps: lo lee cualquier miembro del org (la barra y las vistas lo necesitan); se escribe
-- solo desde el servidor. record_activity se lee con la misma regla que su sección.
alter table org_brand enable row level security;
create policy "members read their org brand" on org_brand for select
  using (exists (select 1 from membership m where m.org_id = org_brand.org_id and m.user_id = auth.uid()));
alter table app_group enable row level security;
create policy "members read their app groups" on app_group for select
  using (exists (select 1 from membership m where m.org_id = app_group.org_id and m.user_id = auth.uid()));
alter table app_model enable row level security;
create policy "members read their apps" on app_model for select
  using (exists (select 1 from membership m where m.org_id = app_model.org_id and m.user_id = auth.uid()));
alter table app_stage enable row level security;
create policy "members read their app stages" on app_stage for select
  using (exists (select 1 from membership m where m.org_id = app_stage.org_id and m.user_id = auth.uid()));
alter table app_field enable row level security;
create policy "members read their app fields" on app_field for select
  using (exists (select 1 from membership m where m.org_id = app_field.org_id and m.user_id = auth.uid()));
alter table app_view enable row level security;
create policy "members read their app views" on app_view for select
  using (exists (select 1 from membership m where m.org_id = app_view.org_id and m.user_id = auth.uid()));
alter table record_activity enable row level security;
create policy "members read activity their permission type allows" on record_activity for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = record_activity.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or coalesce(pt.grants->>record_activity.section, 'ninguno') <> 'ninguno')));
grant select on org_brand, app_group, app_model, app_stage, app_field, app_view, record_activity to authenticated;
```

- [ ] **Paso 5: Detente y muestra los dos SQL a Jose Carlos.** Sin un "sí" explícito por migración, no
  sigas. Con el "sí": `pnpm db:migrate`.

- [ ] **Paso 6: Pruebas en verde**

Run: `pnpm --filter improvement test tests/apps-schema.test.ts` → PASS.
Run: `n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"` → exit 0.

- [ ] **Paso 7: Commit**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/apps-schema.test.ts
git commit -m "F1-T1: esquema del motor de apps con RLS"
```

---

### Tarea 2: Catálogo de apps base y siembra por org

**Archivos:**
- Crear: `apps/improvement/server/apps/catalog.ts`
- Test: `apps/improvement/tests/apps-catalog.test.ts`

**Interfaces:**
- Consume: `appGroup`, `appModel`, `appStage` (Tarea 1); `DEAL_STAGES`, `TICKET_STATUSES`,
  `PROJECT_AUTHORIZATION` (schema).
- Produce: `BASE_APPS: BaseApp[]`; `type BaseAppKey = "clientes" | "ventas" | "proyectos" | "postventa"`;
  `ensureOrgApps(orgId: string): Promise<void>` (idempotente; sin guard propio porque solo la llaman
  funciones que ya pasaron el suyo, y no se exporta a rutas).

- [ ] **Paso 1: Prueba que falla**

```ts
// apps/improvement/tests/apps-catalog.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, appStage, organization } from "@jotapuntoce/db/schema";
import { BASE_APPS, ensureOrgApps } from "../server/apps/catalog.ts";

const orgIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

describe("ensureOrgApps", () => {
  it("WHEN corre dos veces THE SYSTEM SHALL sembrar una vez las 4 apps base, sus grupos y las etapas de ventas en orden", async () => {
    const [o] = await db.insert(organization).values({ name: "t-cat", slug: `t-cat-${crypto.randomUUID()}` }).returning();
    orgIds.push(o!.id);
    await ensureOrgApps(o!.id);
    await ensureOrgApps(o!.id);
    const apps = await db.select().from(appModel).where(eq(appModel.orgId, o!.id));
    expect(apps.map((a) => a.key).sort()).toEqual(["clientes", "postventa", "proyectos", "ventas"]);
    expect(await db.select().from(appGroup).where(eq(appGroup.orgId, o!.id))).toHaveLength(2);
    const ventas = apps.find((a) => a.key === "ventas")!;
    const stages = await db.select().from(appStage).where(eq(appStage.appId, ventas.id)).orderBy(asc(appStage.position));
    expect(stages.map((s) => s.key)).toEqual(["prospecto", "propuesta", "negociacion", "ganado", "perdido"]);
  });

  it("WHEN se lee BASE_APPS THE SYSTEM SHALL tener una sección válida por app", () => {
    for (const app of BASE_APPS) expect(["clientes", "proyectos", "postventa"]).toContain(app.section);
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/apps-catalog.test.ts`
Expected: FAIL; no existe `../server/apps/catalog.ts`.

- [ ] **Paso 3: Implementación**

```ts
// apps/improvement/server/apps/catalog.ts
// Las apps base que toda empresa trae (catálogo genérico, igual para todos) y la siembra por org. Lo
// que cada dueño cambia —nombres, orden, grupos, campos extra— vive en filas, no aquí.
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, appStage, DEAL_STAGES, PROJECT_AUTHORIZATION, TICKET_STATUSES } from "@jotapuntoce/db/schema";
import type { SectionSlug } from "../permissions/sections.ts";

export type BaseAppKey = "clientes" | "ventas" | "proyectos" | "postventa";

export interface BaseApp {
  key: BaseAppKey;
  name: string;
  section: SectionSlug;
  icon: string;
  group: "Ventas" | "Operación";
  stages: { key: string; name: string }[];
}

const label = (key: string) => (key.charAt(0).toUpperCase() + key.slice(1)).replace("_", " ");

export const BASE_APPS: BaseApp[] = [
  {
    key: "clientes", name: "Clientes", section: "clientes", icon: "users", group: "Ventas",
    stages: [{ key: "healthy", name: "Activo" }, { key: "neutral", name: "Neutral" }, { key: "at_risk", name: "En riesgo" }],
  },
  {
    key: "ventas", name: "Ventas", section: "clientes", icon: "handshake", group: "Ventas",
    stages: DEAL_STAGES.map((k) => ({ key: k, name: k === "negociacion" ? "Negociación" : label(k) })),
  },
  {
    key: "proyectos", name: "Proyectos", section: "proyectos", icon: "hammer", group: "Operación",
    stages: PROJECT_AUTHORIZATION.map((k) => ({ key: k, name: label(k) })),
  },
  {
    key: "postventa", name: "Postventa", section: "postventa", icon: "lifebuoy", group: "Operación",
    stages: TICKET_STATUSES.map((k) => ({ key: k, name: k === "en_proceso" ? "En proceso" : label(k) })),
  },
];

/** Siembra grupos, apps base y sus etapas si faltan. Idempotente: nunca pisa lo que el dueño cambió. */
export async function ensureOrgApps(orgId: string): Promise<void> {
  const existing = await db.select({ key: appModel.key }).from(appModel).where(eq(appModel.orgId, orgId));
  const have = new Set(existing.map((r) => r.key));
  const missing = BASE_APPS.filter((a) => !have.has(a.key));
  if (missing.length === 0) return;

  await db.transaction(async (tx) => {
    const groups = new Map<string, string>();
    for (const [position, name] of [...new Set(BASE_APPS.map((a) => a.group))].entries()) {
      const [found] = await tx.select({ id: appGroup.id }).from(appGroup).where(and(eq(appGroup.orgId, orgId), eq(appGroup.name, name)));
      const id = found?.id ?? (await tx.insert(appGroup).values({ orgId, name, position }).returning({ id: appGroup.id }))[0]!.id;
      groups.set(name, id);
    }
    for (const app of missing) {
      const [row] = await tx
        .insert(appModel)
        .values({ orgId, key: app.key, name: app.name, kind: "base", section: app.section, icon: app.icon, groupId: groups.get(app.group), position: BASE_APPS.indexOf(app) })
        .onConflictDoNothing()
        .returning({ id: appModel.id });
      if (!row) continue;
      await tx.insert(appStage).values(app.stages.map((s, position) => ({ orgId, appId: row.id, key: s.key, name: s.name, position })));
    }
  });
}
```

- [ ] **Paso 4: Pruebas en verde**

Run: `pnpm --filter improvement test tests/apps-catalog.test.ts` → PASS.

- [ ] **Paso 5: Commit**

```bash
git add -- apps/improvement/server/apps/catalog.ts apps/improvement/tests/apps-catalog.test.ts
git commit -m "F1-T2: catálogo de apps base y siembra por org"
```

---

### Tarea 3: Campos extra validados

**Archivos:**
- Crear: `apps/improvement/server/apps/fields.ts`
- Test: `apps/improvement/tests/apps-fields.test.ts`

**Interfaces:**
- Consume: `appField`, `appModel` (Tarea 1), `ensureOrgApps` (Tarea 2).
- Produce:
  - `type FieldDef = { key: string; label: string; type: (typeof APP_FIELD_TYPES)[number]; options: string[]; required: boolean }`
  - `schemaFor(fields: FieldDef[]): z.ZodType<Record<string, unknown>>` (puro)
  - `listFields(orgId: string, appKey: string): Promise<FieldDef[]>`
  - `addField(userId, orgId, appKey, input): Promise<Result<FieldDef>>` (solo dueño)

- [ ] **Paso 1: Prueba que falla**

```ts
// apps/improvement/tests/apps-fields.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { addField, schemaFor, type FieldDef } from "../server/apps/fields.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function setup(role: "owner" | "employee") {
  const [o] = await db.insert(organization).values({ name: "t-f", slug: `t-f-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId: o!.id, role, acceptedAt: new Date() });
  return { orgId: o!.id, userId: id };
}

const FIELDS: FieldDef[] = [
  { key: "fecha_boda", label: "Fecha de boda", type: "fecha", options: [], required: true },
  { key: "anticipo", label: "Anticipo", type: "dinero", options: [], required: false },
  { key: "paquete", label: "Paquete", type: "opcion", options: ["Oro", "Plata"], required: false },
];

describe("schemaFor", () => {
  it("WHEN falta un obligatorio o la opción no existe THE SYSTEM SHALL rechazar; con datos válidos convierte dinero a centavos enteros", () => {
    const s = schemaFor(FIELDS);
    expect(s.safeParse({ anticipo: "100" }).success).toBe(false);
    expect(s.safeParse({ fecha_boda: "2027-03-01", paquete: "Bronce" }).success).toBe(false);
    expect(s.parse({ fecha_boda: "2027-03-01", anticipo: "1500.50", paquete: "Oro" })).toEqual({ fecha_boda: "2027-03-01", anticipo: 150050, paquete: "Oro" });
  });
});

describe("addField", () => {
  it("WHEN el dueño agrega un campo THE SYSTEM SHALL guardarlo; un empleado recibe FORBIDDEN y una llave repetida VALIDATION_ERROR", async () => {
    const { orgId, userId } = await setup("owner");
    const r = await addField(userId, orgId, "ventas", { label: "Fecha de boda", type: "fecha", required: true });
    expect(r.ok && r.data.key).toBe("fecha_de_boda");
    const dup = await addField(userId, orgId, "ventas", { label: "Fecha de boda", type: "fecha" });
    expect(dup.ok ? null : dup.error.code).toBe("VALIDATION_ERROR");
    const emp = await setup("employee");
    const f = await addField(emp.userId, emp.orgId, "ventas", { label: "X campo", type: "texto" });
    expect(f.ok ? null : f.error.code).toBe("FORBIDDEN");
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/apps-fields.test.ts` → FAIL (módulo inexistente).

- [ ] **Paso 3: Implementación**

```ts
// apps/improvement/server/apps/fields.ts
// Los campos extra de cada app: la única puerta que convierte su definición (app_field) en validación.
// Toda escritura de valores extra, en apps base o custom, pasa por schemaFor.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { APP_FIELD_TYPES, appField, appModel } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { ensureOrgApps } from "./catalog.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): Result<never> => ({ ok: false, error: { code, message } });

export type FieldType = (typeof APP_FIELD_TYPES)[number];
export interface FieldDef { key: string; label: string; type: FieldType; options: string[]; required: boolean }

function valueSchema(f: FieldDef): z.ZodType<unknown> {
  switch (f.type) {
    case "texto": return z.string().trim().max(2000);
    case "numero": return z.coerce.number();
    case "dinero": return z.coerce.number().min(0).transform((pesos) => Math.round(pesos * 100));
    case "fecha": return z.iso.date();
    case "opcion": return z.enum(f.options as [string, ...string[]]);
    case "si_no": return z.union([z.boolean(), z.enum(["on", "true", "false"]).transform((v) => v !== "false")]);
  }
}

/** Esquema zod de los valores extra. Vacío ("" o null) cuenta como ausente. */
export function schemaFor(fields: FieldDef[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const f of fields) {
    const base = z.preprocess((v) => (v === "" || v === null ? undefined : v), valueSchema(f));
    shape[f.key] = f.required ? base : base.optional();
  }
  return z.object(shape).strip() as z.ZodType<Record<string, unknown>>;
}

export async function listFields(orgId: string, appKey: string): Promise<FieldDef[]> {
  return db
    .select({ key: appField.key, label: appField.label, type: appField.type, options: appField.options, required: appField.required })
    .from(appField)
    .innerJoin(appModel, eq(appModel.id, appField.appId))
    .where(and(eq(appField.orgId, orgId), eq(appModel.key, appKey)))
    .orderBy(asc(appField.position));
}

const addSchema = z.object({
  label: z.string().trim().min(2, "El campo lleva un nombre de 2 a 60 letras.").max(60),
  type: z.enum(APP_FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  required: z.boolean().default(false),
});

const toKey = (label: string) =>
  label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "c_$1").slice(0, 40);

/** El dueño agrega un campo extra a una app. La llave sale del nombre y no cambia aunque lo renombre. */
export async function addField(userId: string, orgId: string, appKey: string, input: unknown): Promise<Result<FieldDef>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño agrega campos.", "FORBIDDEN");
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  if (parsed.data.type === "opcion" && parsed.data.options.length === 0) return fail("Un campo de opción necesita opciones.");
  await ensureOrgApps(orgId);
  const [app] = await db.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, appKey)));
  if (!app) return fail("Esa app no existe.", "NOT_FOUND");
  const key = toKey(parsed.data.label);
  const existing = await db.select({ key: appField.key }).from(appField).where(eq(appField.appId, app.id));
  if (existing.some((f) => f.key === key)) return fail("Ya hay un campo con ese nombre.");
  const [row] = await db
    .insert(appField)
    .values({ orgId, appId: app.id, key, label: parsed.data.label, type: parsed.data.type, options: parsed.data.options, required: parsed.data.required, position: existing.length })
    .returning();
  return { ok: true, data: { key: row!.key, label: row!.label, type: row!.type, options: row!.options, required: row!.required } };
}
```

- [ ] **Paso 4: Pruebas en verde**

Run: `pnpm --filter improvement test tests/apps-fields.test.ts` → PASS.

- [ ] **Paso 5: Commit**

```bash
git add -- apps/improvement/server/apps/fields.ts apps/improvement/tests/apps-fields.test.ts
git commit -m "F1-T3: campos extra con validación generada"
```

---

### Tarea 4: Adaptadores y registros normalizados

**Archivos:**
- Crear: `apps/improvement/server/apps/adapters.ts`, `apps/improvement/server/apps/records.ts`
- Test: `apps/improvement/tests/apps-records.test.ts`

**Interfaces:**
- Consume: `BASE_APPS`, `BaseAppKey`, `ensureOrgApps` (T2); `listFields`, `schemaFor` (T3);
  `moveDeal` (`server/crm/deals.ts`), `moveTicket` (`server/erp/tickets.ts`), `authorizeProject`
  (`server/erp/projects.ts`); `resolveSection`.
- Produce:
  - `interface AppRecord { id: string; title: string; subtitle: string | null; stage: string; amountCents: number | null; custom: Record<string, unknown>; updatedAt: Date }`
  - `listRecords(userId, orgId, appKey, opts?: { q?: string }): Promise<Result<{ records: AppRecord[]; stages: { key: string; name: string }[] }>>`
  - `getRecord(userId, orgId, appKey, id): Promise<Result<AppRecord>>`
  - `moveRecord(userId, orgId, appKey, id, stage: string): Promise<Result<true>>` (deja un "cambio" en la bitácora)
  - `saveCustomValues(userId, orgId, appKey, id, values: unknown): Promise<Result<Record<string, unknown>>>`
  - `addNote(userId, orgId, appKey, id, body: string): Promise<Result<true>>`
  - `listActivity(userId, orgId, appKey, id): Promise<Result<{ kind: "nota" | "cambio"; body: string; actorName: string | null; createdAt: Date }[]>>`

- [ ] **Paso 1: Prueba que falla**

```ts
// apps/improvement/tests/apps-records.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, membership, organization, profile } from "@jotapuntoce/db/schema";
import { addField } from "../server/apps/fields.ts";
import { addNote, listActivity, listRecords, moveRecord, saveCustomValues } from "../server/apps/records.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee", fullName: string) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com`, fullName });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-rec", slug: `t-rec-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const owner = await person(o!.id, "owner", "Dueña Rec");
  const [c] = await db.insert(client).values({ orgId: o!.id, name: "Familia García" }).returning();
  const [d] = await db.insert(deal).values({ orgId: o!.id, clientId: c!.id, title: "Boda García", amountCents: 8000000 }).returning();
  return { orgId: o!.id, owner, dealId: d!.id };
}

describe("registros normalizados de ventas", () => {
  it("WHEN se listan THE SYSTEM SHALL dar título, cliente, etapa y monto, y filtrar por q", async () => {
    const { orgId, owner } = await setup();
    const r = await listRecords(owner, orgId, "ventas");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.records[0]).toMatchObject({ title: "Boda García", subtitle: "Familia García", stage: "prospecto", amountCents: 8000000 });
    expect(r.data.stages.map((s) => s.key)[0]).toBe("prospecto");
    const none = await listRecords(owner, orgId, "ventas", { q: "XV años" });
    expect(none.ok && none.data.records).toEqual([]);
  });

  it("WHEN se mueve de etapa THE SYSTEM SHALL actualizar deal.stage y dejar el cambio en la bitácora", async () => {
    const { orgId, owner, dealId } = await setup();
    expect((await moveRecord(owner, orgId, "ventas", dealId, "propuesta")).ok).toBe(true);
    const [row] = await db.select({ stage: deal.stage }).from(deal).where(eq(deal.id, dealId));
    expect(row!.stage).toBe("propuesta");
    await addNote(owner, orgId, "ventas", dealId, "Llamar el lunes");
    const act = await listActivity(owner, orgId, "ventas", dealId);
    expect(act.ok && act.data.map((a) => a.kind).sort()).toEqual(["cambio", "nota"]);
  });

  it("WHEN se guardan valores extra THE SYSTEM SHALL validarlos con app_field y guardarlos en custom", async () => {
    const { orgId, owner, dealId } = await setup();
    await addField(owner, orgId, "ventas", { label: "Anticipo", type: "dinero" });
    const bad = await saveCustomValues(owner, orgId, "ventas", dealId, { anticipo: "-5" });
    expect(bad.ok ? null : bad.error.code).toBe("VALIDATION_ERROR");
    const good = await saveCustomValues(owner, orgId, "ventas", dealId, { anticipo: "2000" });
    expect(good.ok && good.data).toEqual({ anticipo: 200000 });
    const [row] = await db.select({ custom: deal.custom }).from(deal).where(eq(deal.id, dealId));
    expect(row!.custom).toEqual({ anticipo: 200000 });
  });

  it("WHEN un empleado sin la sección clientes lista ventas THE SYSTEM SHALL dar FORBIDDEN", async () => {
    const { orgId } = await setup();
    const emp = await person(orgId, "employee", "Empleado Rec");
    const r = await listRecords(emp, orgId, "ventas");
    expect(r.ok ? null : r.error.code).toBe("FORBIDDEN");
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/apps-records.test.ts` → FAIL (módulos inexistentes).

- [ ] **Paso 3: Adaptadores**

```ts
// apps/improvement/server/apps/adapters.ts
// Un adaptador por app base: traduce su tabla real a AppRecord y delega el cambio de etapa en la
// función que ya cuida esa regla (moveDeal, moveTicket, authorizeProject). No se exporta a rutas.
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, project, ticket } from "@jotapuntoce/db/schema";
import { moveDeal } from "../crm/deals.ts";
import { moveTicket } from "../erp/tickets.ts";
import { authorizeProject } from "../erp/projects.ts";
import type { BaseAppKey } from "./catalog.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface AppRecord {
  id: string;
  title: string;
  subtitle: string | null;
  stage: string;
  amountCents: number | null;
  custom: Record<string, unknown>;
  updatedAt: Date;
}

interface Adapter {
  list(orgId: string, q?: string): Promise<AppRecord[]>;
  get(orgId: string, id: string): Promise<AppRecord | undefined>;
  move(userId: string, orgId: string, id: string, stage: string): Promise<Result<true>>;
  /** La tabla y su columna custom, para guardar valores extra con un solo update. */
  table: typeof client | typeof deal | typeof project | typeof ticket;
}

const like = (q: string | undefined, ...cols: Parameters<typeof ilike>[0][]): SQL | undefined =>
  q ? or(...cols.map((c) => ilike(c, `%${q}%`))) : undefined;

export const ADAPTERS: Record<BaseAppKey, Adapter> = {
  clientes: {
    table: client,
    async list(orgId, q) {
      const rows = await db.select().from(client).where(and(eq(client.orgId, orgId), like(q, client.name))).orderBy(desc(client.updatedAt)).limit(200);
      return rows.map((r) => ({ id: r.id, title: r.name, subtitle: r.notes, stage: r.healthStatus, amountCents: null, custom: r.custom, updatedAt: r.updatedAt }));
    },
    async get(orgId, id) {
      return (await this.list(orgId)).find((r) => r.id === id);
    },
    async move(_userId, orgId, id, stage) {
      if (!["healthy", "neutral", "at_risk"].includes(stage)) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Esa etapa no existe." } };
      await db.update(client).set({ healthStatus: stage, updatedAt: new Date() }).where(and(eq(client.id, id), eq(client.orgId, orgId)));
      return { ok: true, data: true };
    },
  },
  ventas: {
    table: deal,
    async list(orgId, q) {
      const rows = await db
        .select({ d: deal, clientName: client.name })
        .from(deal)
        .innerJoin(client, eq(client.id, deal.clientId))
        .where(and(eq(deal.orgId, orgId), like(q, deal.title, client.name)))
        .orderBy(desc(deal.updatedAt))
        .limit(200);
      return rows.map(({ d, clientName }) => ({ id: d.id, title: d.title, subtitle: clientName, stage: d.stage, amountCents: d.amountCents, custom: d.custom, updatedAt: d.updatedAt }));
    },
    async get(orgId, id) {
      return (await this.list(orgId)).find((r) => r.id === id);
    },
    move: (userId, orgId, id, stage) => moveDeal(userId, orgId, id, stage),
  },
  proyectos: {
    table: project,
    async list(orgId, q) {
      const rows = await db.select().from(project).where(and(eq(project.orgId, orgId), like(q, project.name))).orderBy(desc(project.updatedAt)).limit(200);
      return rows.map((r) => ({ id: r.id, title: r.name, subtitle: r.detail, stage: r.authorizationStatus, amountCents: null, custom: r.custom, updatedAt: r.updatedAt }));
    },
    async get(orgId, id) {
      return (await this.list(orgId)).find((r) => r.id === id);
    },
    move: (userId, orgId, id, stage) =>
      authorizeProject(userId, orgId, id, stage === "autorizado" ? "autorizar" : stage === "rechazado" ? "rechazar" : stage),
  },
  postventa: {
    table: ticket,
    async list(orgId, q) {
      const rows = await db
        .select({ t: ticket, clientName: client.name })
        .from(ticket)
        .leftJoin(client, eq(client.id, ticket.clientId))
        .where(and(eq(ticket.orgId, orgId), like(q, ticket.title)))
        .orderBy(desc(ticket.updatedAt))
        .limit(200);
      return rows.map(({ t, clientName }) => ({ id: t.id, title: t.title, subtitle: clientName, stage: t.status, amountCents: null, custom: t.custom, updatedAt: t.updatedAt }));
    },
    async get(orgId, id) {
      return (await this.list(orgId)).find((r) => r.id === id);
    },
    move: (userId, orgId, id, stage) => moveTicket(userId, orgId, id, stage),
  },
};
```

> Antes de dar por buena esta tarea, lee las firmas reales:
> - qué valores acepta `authorizeProject` como `decision` (en `server/erp/projects.ts`), y ajusta el mapeo de `proyectos.move` a esos literales;
> - que `ticket` tenga `title`, `clientId` y `updatedAt`, y que `client.notes` y `project.detail` existan. Si una columna se llama distinto, usa la real.
>
> Los `get` reusan `list` a propósito (`ponytail:` hasta 200 filas; cambia a un `where id` cuando un org pase de ese tamaño).

- [ ] **Paso 4: Registros con guard y bitácora**

```ts
// apps/improvement/server/apps/records.ts
// La puerta única de las vistas genéricas: guard por sección, adaptador de la app, bitácora.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { appModel, appStage, profile, recordActivity } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { BASE_APPS, ensureOrgApps, type BaseAppKey } from "./catalog.ts";
import { ADAPTERS, type AppRecord } from "./adapters.ts";
import { listFields, schemaFor } from "./fields.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): Result<never> => ({ ok: false, error: { code, message } });

export type { AppRecord };

async function gate(userId: string, orgId: string, appKey: string, write: boolean) {
  const app = BASE_APPS.find((a) => a.key === appKey);
  if (!app) return { error: fail("Esa app no existe.", "NOT_FOUND") } as const;
  const { scope } = await resolveSection(userId, orgId, app.section);
  if (scope === "ninguno" || (write && scope !== "empresa")) return { error: fail("No tienes acceso a esta app.", "FORBIDDEN") } as const;
  return { app, adapter: ADAPTERS[app.key as BaseAppKey] } as const;
}

export async function listRecords(userId: string, orgId: string, appKey: string, opts: { q?: string } = {}) {
  const g = await gate(userId, orgId, appKey, false);
  if ("error" in g) return g.error;
  await ensureOrgApps(orgId);
  const q = z.string().trim().max(80).optional().parse(opts.q || undefined);
  const [records, stages] = await Promise.all([
    g.adapter.list(orgId, q),
    db.select({ key: appStage.key, name: appStage.name }).from(appStage).innerJoin(appModel, eq(appModel.id, appStage.appId))
      .where(and(eq(appStage.orgId, orgId), eq(appModel.key, appKey))).orderBy(appStage.position),
  ]);
  return { ok: true as const, data: { records, stages } };
}

export async function getRecord(userId: string, orgId: string, appKey: string, id: string): Promise<Result<AppRecord>> {
  const g = await gate(userId, orgId, appKey, false);
  if ("error" in g) return g.error;
  if (!z.uuid().safeParse(id).success) return fail("No existe.", "NOT_FOUND");
  const rec = await g.adapter.get(orgId, id);
  return rec ? { ok: true, data: rec } : fail("No existe.", "NOT_FOUND");
}

async function log(orgId: string, appKey: string, section: string, recordId: string, kind: "nota" | "cambio", body: string, actorId: string) {
  await db.insert(recordActivity).values({ orgId, appKey, section, recordId, kind, body, actorId });
}

export async function moveRecord(userId: string, orgId: string, appKey: string, id: string, stage: string): Promise<Result<true>> {
  const g = await gate(userId, orgId, appKey, true);
  if ("error" in g) return g.error;
  const before = await g.adapter.get(orgId, id);
  if (!before) return fail("No existe.", "NOT_FOUND");
  const r = await g.adapter.move(userId, orgId, id, stage);
  if (r.ok && before.stage !== stage) await log(orgId, appKey, g.app.section, id, "cambio", `Etapa: ${before.stage} → ${stage}`, userId);
  return r;
}

export async function saveCustomValues(userId: string, orgId: string, appKey: string, id: string, values: unknown): Promise<Result<Record<string, unknown>>> {
  const g = await gate(userId, orgId, appKey, true);
  if ("error" in g) return g.error;
  const parsed = schemaFor(await listFields(orgId, appKey)).safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const t = g.adapter.table;
  const [row] = await db.update(t).set({ custom: parsed.data, updatedAt: new Date() }).where(and(eq(t.id, id), eq(t.orgId, orgId))).returning({ custom: t.custom });
  if (!row) return fail("No existe.", "NOT_FOUND");
  await log(orgId, appKey, g.app.section, id, "cambio", "Campos actualizados", userId);
  return { ok: true, data: row.custom };
}

export async function addNote(userId: string, orgId: string, appKey: string, id: string, body: string): Promise<Result<true>> {
  const g = await gate(userId, orgId, appKey, false);
  if ("error" in g) return g.error;
  const text = z.string().trim().min(1, "Escribe la nota.").max(2000).safeParse(body);
  if (!text.success) return fail(text.error.issues[0]!.message);
  if (!(await g.adapter.get(orgId, id))) return fail("No existe.", "NOT_FOUND");
  await log(orgId, appKey, g.app.section, id, "nota", text.data, userId);
  return { ok: true, data: true };
}

export async function listActivity(userId: string, orgId: string, appKey: string, id: string) {
  const g = await gate(userId, orgId, appKey, false);
  if ("error" in g) return g.error;
  const rows = await db
    .select({ kind: recordActivity.kind, body: recordActivity.body, actorName: profile.fullName, createdAt: recordActivity.createdAt })
    .from(recordActivity)
    .leftJoin(profile, eq(profile.id, recordActivity.actorId))
    .where(and(eq(recordActivity.orgId, orgId), eq(recordActivity.recordId, id)))
    .orderBy(desc(recordActivity.createdAt));
  return { ok: true as const, data: rows };
}
```

- [ ] **Paso 5: Pruebas en verde**

Run: `pnpm --filter improvement test tests/apps-records.test.ts tests/crm.test.ts tests/erp.test.ts` → PASS.
(Si `tests/erp.test.ts` no existe, corre los que cubren `erp/tickets.ts` y `erp/projects.ts`:
`ls apps/improvement/tests | grep -i -E "ticket|proyect|erp"`.)

- [ ] **Paso 6: Commit**

```bash
git add -- apps/improvement/server/apps/adapters.ts apps/improvement/server/apps/records.ts apps/improvement/tests/apps-records.test.ts
git commit -m "F1-T4: registros normalizados de apps base con bitácora"
```

---

### Tarea 5: Marca del negocio y tokens de Improvement

**Archivos:**
- Modificar: `packages/ui/src/tokens.css`, `apps/improvement/app/layout.tsx`
- Crear: `apps/improvement/server/brand/brand.ts`, `apps/improvement/app/[org]/configuracion/marca/page.tsx`
- Test: `apps/improvement/tests/brand.test.ts`

**Interfaces:**
- Produce:
  - `getBrand(userId, orgId): Promise<{ logoUrl: string | null; coverUrl: string | null; primaryColor: string | null; secondaryColor: string | null }>`
  - `saveBrand(userId, orgId, input): Promise<Result<true>>` (solo dueño)
  - `brandStyle(brand): Record<string, string>` (puro; variables CSS para el `style` del shell)

- [ ] **Paso 1: Prueba que falla**

```ts
// apps/improvement/tests/brand.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { brandStyle, getBrand, saveBrand } from "../server/brand/brand.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function setup(role: "owner" | "employee") {
  const [o] = await db.insert(organization).values({ name: "t-b", slug: `t-b-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId: o!.id, role, acceptedAt: new Date() });
  return { orgId: o!.id, userId: id };
}

describe("brandStyle", () => {
  it("WHEN hay colores THE SYSTEM SHALL mapearlos a --accent-1/--accent-2; sin colores no pisa nada", () => {
    expect(brandStyle({ logoUrl: null, coverUrl: null, primaryColor: "#aa0000", secondaryColor: "#00aa00" })).toEqual({ "--accent-1": "#aa0000", "--accent-2": "#00aa00" });
    expect(brandStyle({ logoUrl: null, coverUrl: null, primaryColor: null, secondaryColor: null })).toEqual({});
  });
});

describe("saveBrand", () => {
  it("WHEN el dueño guarda colores válidos THE SYSTEM SHALL leerlos de vuelta; un hex inválido es VALIDATION_ERROR y un empleado FORBIDDEN", async () => {
    const { orgId, userId } = await setup("owner");
    expect((await saveBrand(userId, orgId, { primaryColor: "#112233", secondaryColor: "#445566", logoUrl: "https://x.test/l.png" })).ok).toBe(true);
    expect((await getBrand(userId, orgId)).primaryColor).toBe("#112233");
    const bad = await saveBrand(userId, orgId, { primaryColor: "rojo" });
    expect(bad.ok ? null : bad.error.code).toBe("VALIDATION_ERROR");
    const emp = await setup("employee");
    const f = await saveBrand(emp.userId, emp.orgId, { primaryColor: "#112233" });
    expect(f.ok ? null : f.error.code).toBe("FORBIDDEN");
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/brand.test.ts` → FAIL.

- [ ] **Paso 3: Implementación**

```ts
// apps/improvement/server/brand/brand.ts
// La marca del negocio. Sus colores entran como variables CSS que pisan los tokens dentro del shell
// del org; ningún hex se escribe en componentes.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { orgBrand } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export interface Brand { logoUrl: string | null; coverUrl: string | null; primaryColor: string | null; secondaryColor: string | null }

const EMPTY: Brand = { logoUrl: null, coverUrl: null, primaryColor: null, secondaryColor: null };

export async function getBrand(userId: string, orgId: string): Promise<Brand> {
  await assertMembership(userId, orgId);
  const [row] = await db.select().from(orgBrand).where(eq(orgBrand.orgId, orgId));
  return row ? { logoUrl: row.logoUrl, coverUrl: row.coverUrl, primaryColor: row.primaryColor, secondaryColor: row.secondaryColor } : EMPTY;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "El color va como #RRGGBB.");
const brandSchema = z.object({
  logoUrl: z.url().nullish(),
  coverUrl: z.url().nullish(),
  primaryColor: hex.nullish(),
  secondaryColor: hex.nullish(),
});

export async function saveBrand(userId: string, orgId: string, input: unknown): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño cambia la marca." } };
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." } };
  const values = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v ?? null]));
  await db.insert(orgBrand).values({ orgId, ...values }).onConflictDoUpdate({ target: orgBrand.orgId, set: { ...values, updatedAt: new Date() } });
  return { ok: true, data: true };
}

/** Variables CSS del shell del org. Solo los colores que el dueño definió; lo demás sigue los tokens. */
export function brandStyle(brand: Brand): Record<string, string> {
  const style: Record<string, string> = {};
  if (brand.primaryColor) style["--accent-1"] = brand.primaryColor;
  if (brand.secondaryColor) style["--accent-2"] = brand.secondaryColor;
  return style;
}
```

En `packages/ui/src/tokens.css`, agrega junto a los `--brand-*`:

```css
  /* Improvement (memoria colores-improvement): degradado verde sobre negro. */
  --brand-improvement-1: #1fbe79;
  --brand-improvement-2: #98e33b;
```

y al final del archivo:

```css
/* Improvement: <html data-brand="improvement"> (apps/improvement/app/layout.tsx). Dentro de un
   negocio, el shell pisa --accent-1/2 con los colores de org_brand (brandStyle). */
:root[data-brand="improvement"] {
  --bg: #000000;
  --accent-1: var(--brand-improvement-1);
  --accent-2: var(--brand-improvement-2);
  --shadow-glow: 0 0 0 1px var(--border), 0 20px 60px -20px color-mix(in srgb, var(--brand-improvement-1) 35%, transparent);
}
```

En `apps/improvement/app/layout.tsx`, cambia `<html lang="es" className={...}>` por
`<html lang="es" data-brand="improvement" className={...}>`.

Página `apps/improvement/app/[org]/configuracion/marca/page.tsx`: sigue el patrón de
`app/[org]/clientes/pipeline/page.tsx` (`finish`, `field`, una Server Action). Usa
`requireOrgMembership` y `getBrand`; un formulario con `logoUrl`, `coverUrl` y dos
`<input type="color">` (`primaryColor`, `secondaryColor`) que llama `saveBrand`; `h1` "Tu marca".
Solo el dueño ve el formulario; el resto ve un aviso de que solo el dueño la cambia.

```tsx
// apps/improvement/app/[org]/configuracion/marca/page.tsx
// La marca del negocio: logo, portada y colores que pintan todo su Improvement. Solo el dueño la cambia.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findOwnerMembership, getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { getBrand, saveBrand } from "@/server/brand/brand.ts";

function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(`/${pagina.split("/")[1]}`, "layout");
  redirect(pagina);
}
const field = (formData: FormData, name: string) => formData.get(name)?.toString() || null;

export default async function MarcaPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const membership = await requireOrgMembership(orgId);
  const isOwner = Boolean(await findOwnerMembership(membership.userId, orgId));
  const brand = await getBrand(membership.userId, orgId);
  const pagina = `/${orgId}/configuracion/marca`;

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await saveBrand(actor, orgId, {
      logoUrl: field(formData, "logoUrl"), coverUrl: field(formData, "coverUrl"),
      primaryColor: field(formData, "primaryColor"), secondaryColor: field(formData, "secondaryColor"),
    }));
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Tu marca</h1>
      {error && <p className="invite-error">{error}</p>}
      {!isOwner && <p className="config-hint">Solo el dueño cambia la marca.</p>}
      {isOwner && (
        <form action={guardar} className="config-form config-card" aria-label="Marca del negocio">
          <label className="permiso-field"><span>Logo (URL)</span><input name="logoUrl" type="url" defaultValue={brand.logoUrl ?? ""} className="config-input" /></label>
          <label className="permiso-field"><span>Portada (URL)</span><input name="coverUrl" type="url" defaultValue={brand.coverUrl ?? ""} className="config-input" /></label>
          <label className="permiso-field"><span>Color principal</span><input name="primaryColor" type="color" defaultValue={brand.primaryColor ?? "#1fbe79"} /></label>
          <label className="permiso-field"><span>Color secundario</span><input name="secondaryColor" type="color" defaultValue={brand.secondaryColor ?? "#98e33b"} /></label>
          <button type="submit" className="panel-cta">Guardar marca</button>
        </form>
      )}
    </main>
  );
}
```

> Los `defaultValue` de los `<input type="color">` son el valor inicial de un control, no un estilo;
> aun así, si el lint de tokens los marca, léelos de una constante exportada por `brand.ts`
> (`DEFAULT_PICKER = { primary: "#1fbe79", secondary: "#98e33b" }`).

- [ ] **Paso 4: Pruebas en verde**

Run: `pnpm --filter improvement test tests/brand.test.ts` → PASS.
Run: `pnpm --filter @jotapuntoce/admin build` → exit 0 (los tokens nuevos no tocan al admin).

- [ ] **Paso 5: Commit**

```bash
git add -- packages/ui/src/tokens.css apps/improvement/app/layout.tsx apps/improvement/server/brand/brand.ts ":(literal)apps/improvement/app/[org]/configuracion/marca/page.tsx" apps/improvement/tests/brand.test.ts
git commit -m "F1-T5: marca del negocio y tokens verdes de Improvement"
```

---

### Tarea 6: Barra izquierda, selector de empresa y "Vista previa como"

**Archivos:**
- Crear: `apps/improvement/server/apps/sidebar.ts`, `apps/improvement/server/auth/preview.ts`,
  `apps/improvement/components/shell/AppShell.tsx`, `Sidebar.tsx`, `OrgSwitcher.tsx`, `PreviewAs.tsx`
- Modificar: `apps/improvement/app/[org]/layout.tsx`, `apps/improvement/server/auth/guard.ts`
  (solo `requireSection`), `apps/improvement/app/globals.css` (clases `.shell-*`)
- Test: `apps/improvement/tests/apps-sidebar.test.ts`

**Interfaces:**
- Consume: `ensureOrgApps` (T2); `loadVisibleSections` (`server/permissions/loadSections.ts`);
  `getBrand`, `brandStyle` (T5); `scopeFor` (`server/permissions/sections.ts`).
- Produce:
  - `loadSidebar(userId, orgId, previewGrants?: Record<string, string> | null): Promise<{ orgs: { id: string; name: string }[]; groups: { name: string; apps: { key: string; name: string; icon: string | null; href: string }[] }[]; permissionTypes: { id: string; name: string }[] | null }>`
    (`permissionTypes` solo para el dueño)
  - `getPreviewGrants(orgId): Promise<Record<string, string> | null>`, `setPreview(orgId, permissionTypeId | null)`

- [ ] **Paso 1: Prueba que falla**

```ts
// apps/improvement/tests/apps-sidebar.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { loadSidebar } from "../server/apps/sidebar.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function org(name: string) {
  const [o] = await db.insert(organization).values({ name, slug: `t-sb-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return o!.id;
}

describe("loadSidebar", () => {
  it("WHEN el dueño tiene dos empresas THE SYSTEM SHALL listar ambas y las 4 apps en 2 grupos", async () => {
    const a = await org("Camibel");
    const b = await org("Segunda");
    const owner = crypto.randomUUID();
    await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
    profileIds.push(owner);
    await db.insert(membership).values([{ userId: owner, orgId: a, role: "owner", acceptedAt: new Date() }, { userId: owner, orgId: b, role: "owner", acceptedAt: new Date() }]);
    const s = await loadSidebar(owner, a);
    expect(s.orgs.map((o) => o.name).sort()).toEqual(["Camibel", "Segunda"]);
    expect(s.groups.map((g) => g.name)).toEqual(["Ventas", "Operación"]);
    expect(s.groups.flatMap((g) => g.apps.map((x) => x.href))).toContain(`/${a}/a/ventas`);
    expect(s.permissionTypes).toEqual([]);
  });

  it("WHEN el dueño ve como un tipo que solo tiene postventa THE SYSTEM SHALL mostrar solo Postventa", async () => {
    const a = await org("Vista");
    const owner = crypto.randomUUID();
    await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
    profileIds.push(owner);
    await db.insert(membership).values({ userId: owner, orgId: a, role: "owner", acceptedAt: new Date() });
    const [pt] = await db.insert(permissionType).values({ orgId: a, name: "Soporte", grants: { postventa: "empresa" } }).returning();
    const s = await loadSidebar(owner, a, pt!.grants as Record<string, string>);
    expect(s.groups.flatMap((g) => g.apps.map((x) => x.key))).toEqual(["postventa"]);
  });
});
```

> Lee las columnas reales de `permission_type` (`name`, `grants`) en `schema.ts` antes de correrla.

- [ ] **Paso 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/apps-sidebar.test.ts` → FAIL.

- [ ] **Paso 3: Servidor**

```ts
// apps/improvement/server/apps/sidebar.ts
// La barra izquierda: empresas del usuario, grupos con sus apps visibles y, para el dueño, los tipos
// de permiso con los que puede previsualizar. "Vista previa" solo reduce lo visible.
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, membership, organization, permissionType } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { loadVisibleSections } from "../permissions/loadSections.ts";
import { ensureOrgApps } from "./catalog.ts";

export async function loadSidebar(userId: string, orgId: string, previewGrants: Record<string, string> | null = null) {
  const me = await assertMembership(userId, orgId);
  await ensureOrgApps(orgId);
  const [orgs, visible, groups, apps] = await Promise.all([
    db.select({ id: organization.id, name: organization.name }).from(membership)
      .innerJoin(organization, eq(organization.id, membership.orgId))
      .where(and(eq(membership.userId, userId), isNotNull(membership.acceptedAt))).orderBy(asc(organization.name)),
    loadVisibleSections(userId, orgId),
    db.select().from(appGroup).where(eq(appGroup.orgId, orgId)).orderBy(asc(appGroup.position)),
    db.select().from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.enabled, true))).orderBy(asc(appModel.position)),
  ]);
  const allowed = new Set(visible.map((s) => s.slug));
  const canSee = (section: string) => allowed.has(section) && (!previewGrants || (previewGrants[section] ?? "ninguno") !== "ninguno");
  const toLink = (a: typeof apps[number]) => ({ key: a.key, name: a.name, icon: a.icon, href: `/${orgId}/a/${a.key}` });
  return {
    orgs,
    groups: groups
      .map((g) => ({ name: g.name, apps: apps.filter((a) => a.groupId === g.id && canSee(a.section)).map(toLink) }))
      .filter((g) => g.apps.length > 0),
    permissionTypes: me.role === "owner"
      ? await db.select({ id: permissionType.id, name: permissionType.name }).from(permissionType).where(eq(permissionType.orgId, orgId)).orderBy(asc(permissionType.name))
      : null,
  };
}
```

```ts
// apps/improvement/server/auth/preview.ts
// "Vista previa como": el dueño ve su Improvement con los permisos de un tipo. Cookie por org; solo
// reduce lo visible en páginas, nunca cambia lo que las Server Actions permiten.
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { permissionType } from "@jotapuntoce/db/schema";
import { findOwnerMembership, getSessionUserId } from "./guard.ts";

const COOKIE = "imp-preview-as";

export async function getPreviewGrants(orgId: string): Promise<Record<string, string> | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const [cookieOrg, typeId] = raw?.split(":") ?? [];
  if (cookieOrg !== orgId || !z.uuid().safeParse(typeId).success) return null;
  const userId = await getSessionUserId();
  if (!userId || !(await findOwnerMembership(userId, orgId))) return null;
  const [row] = await db.select({ grants: permissionType.grants }).from(permissionType)
    .where(and(eq(permissionType.id, typeId!), eq(permissionType.orgId, orgId)));
  return (row?.grants as Record<string, string> | undefined) ?? null;
}

export async function setPreview(orgId: string, permissionTypeId: string | null): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId || !(await findOwnerMembership(userId, orgId))) return;
  const jar = await cookies();
  if (!permissionTypeId || !z.uuid().safeParse(permissionTypeId).success) jar.delete(COOKIE);
  else jar.set(COOKIE, `${orgId}:${permissionTypeId}`, { httpOnly: true, sameSite: "lax", path: "/" });
}
```

En `server/auth/guard.ts`, `requireSection`: después de resolver, si hay vista previa, aplica el tope.

```ts
export async function requireSection(orgId: string, section: SectionSlug) {
  const row = await requireOrgMembership(orgId);
  const resolved = await resolveSection(row.userId, orgId, section);
  if (resolved.scope === "ninguno") notFound();
  // Vista previa del dueño: la página se ve con el alcance del tipo elegido (nunca más amplio).
  const preview = row.role === "owner" ? await getPreviewGrants(orgId) : null;
  if (preview) {
    const scope = scopeFor("employee", preview, section);
    if (scope === "ninguno") notFound();
    return { ...resolved, scope };
  }
  return resolved;
}
```

con `import { getPreviewGrants } from "./preview.ts";`. Cuida el ciclo de imports: `preview.ts`
importa `guard.ts`. Si da un problema de ciclo en tiempo de carga, mueve `getPreviewGrants` a una
función local en `guard.ts` y deja `preview.ts` solo con `setPreview`.

- [ ] **Paso 4: Componentes del shell**

```tsx
// apps/improvement/components/shell/Sidebar.tsx
// Barra izquierda al estilo Whop: empresa arriba, fijos, y los grupos de apps con sus enlaces.
import Link from "next/link";
import type { ReactNode } from "react";

export interface SidebarData {
  orgId: string;
  groups: { name: string; apps: { key: string; name: string; href: string }[] }[];
}

export function Sidebar({ data, header, footer }: { data: SidebarData; header: ReactNode; footer?: ReactNode }) {
  return (
    <nav className="shell-sidebar" aria-label="Aplicaciones">
      {header}
      <ul className="shell-fixed">
        <li><Link href={`/${data.orgId}`}>Inicio</Link></li>
        <li><Link href={`/${data.orgId}/configuracion/marca`}>Tu marca</Link></li>
      </ul>
      {data.groups.map((g) => (
        <details key={g.name} open className="shell-group">
          <summary>{g.name}</summary>
          <ul>
            {g.apps.map((a) => (
              <li key={a.key}><Link href={a.href}>{a.name}</Link></li>
            ))}
          </ul>
        </details>
      ))}
      {footer}
    </nav>
  );
}
```

```tsx
// apps/improvement/components/shell/OrgSwitcher.tsx
// Selector de empresa: un <details> nativo, sin estado de cliente.
import Link from "next/link";

export function OrgSwitcher({ current, orgs, logoUrl }: { current: string; orgs: { id: string; name: string }[]; logoUrl: string | null }) {
  const active = orgs.find((o) => o.id === current);
  return (
    <details className="shell-org">
      <summary>
        {logoUrl ? <img src={logoUrl} alt="" className="shell-org-logo" /> : <span className="shell-org-logo" aria-hidden="true" />}
        <span>{active?.name ?? "Tu empresa"}</span>
      </summary>
      <ul>
        {orgs.map((o) => (
          <li key={o.id}><Link href={`/${o.id}`} aria-current={o.id === current ? "page" : undefined}>{o.name}</Link></li>
        ))}
      </ul>
    </details>
  );
}
```

```tsx
// apps/improvement/components/shell/PreviewAs.tsx
// "Vista previa como": un select con su Server Action; sin JS de cliente.
export function PreviewAs({ types, action }: { types: { id: string; name: string }[]; action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="shell-preview">
      <label>
        <span>Vista previa como</span>
        <select name="permissionTypeId" defaultValue="">
          <option value="">Dueño</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <button type="submit" className="panel-btn-ghost">Ver</button>
    </form>
  );
}
```

```tsx
// apps/improvement/components/shell/AppShell.tsx
// El marco de todo el negocio: barra izquierda + centro, con la marca del negocio como variables CSS.
import type { CSSProperties, ReactNode } from "react";

export function AppShell({ sidebar, style, children }: { sidebar: ReactNode; style: Record<string, string>; children: ReactNode }) {
  return (
    <div className="shell" style={style as CSSProperties}>
      {sidebar}
      <div className="shell-main">{children}</div>
    </div>
  );
}
```

`apps/improvement/app/[org]/layout.tsx` (reemplazo completo):

```tsx
// El shell de todo el negocio: barra izquierda con empresas, apps visibles y vista previa, y el
// centro. No autentica: cada página sigue llamando su guard. Sin sesión (p. ej. un error) se dibuja
// solo el contenido.
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { getPreviewGrants, setPreview } from "@/server/auth/preview.ts";
import { loadSidebar } from "@/server/apps/sidebar.ts";
import { brandStyle, getBrand } from "@/server/brand/brand.ts";
import { AppShell } from "@/components/shell/AppShell.tsx";
import { Sidebar } from "@/components/shell/Sidebar.tsx";
import { OrgSwitcher } from "@/components/shell/OrgSwitcher.tsx";
import { PreviewAs } from "@/components/shell/PreviewAs.tsx";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const userId = await getSessionUserId();
  if (!userId) return <>{children}</>;
  const loaded = await Promise.all([loadSidebar(userId, org, await getPreviewGrants(org)), getBrand(userId, org)]).catch(() => null);
  if (!loaded) return <>{children}</>;
  const [sidebar, brand] = loaded;

  async function verComo(formData: FormData) {
    "use server";
    if (!(await getSessionUserId())) notFound();
    await setPreview(org, formData.get("permissionTypeId")?.toString() || null);
    revalidatePath(`/${org}`, "layout");
  }

  return (
    <AppShell
      style={brandStyle(brand)}
      sidebar={
        <Sidebar
          data={{ orgId: org, groups: sidebar.groups }}
          header={<OrgSwitcher current={org} orgs={sidebar.orgs} logoUrl={brand.logoUrl} />}
          footer={sidebar.permissionTypes && sidebar.permissionTypes.length > 0 ? <PreviewAs types={sidebar.permissionTypes} action={verComo} /> : undefined}
        />
      }
    >
      {children}
    </AppShell>
  );
}
```

Se elimina `BackLink "Volver al edificio"` y el enlace suelto a Dirección (Dirección se integra como
app base en la Fase 2; mientras tanto se llega por `/[org]/direccion`).

> ⚠️ Antes de borrar el enlace a Dirección, agrégalo a `Sidebar` como fijo cuando
> `loadDireccionNav(userId, org)` devuelva algo, para no dejar a Jaime sin acceso.

En `apps/improvement/app/globals.css` agrega (solo tokens):

```css
/* Shell estilo Whop (blueprint improvement-odoo, fase 1). Solo tokens. */
.shell { display: grid; grid-template-columns: 17rem 1fr; min-height: 100dvh; background: var(--bg); }
.shell-sidebar { position: sticky; top: 0; height: 100dvh; overflow-y: auto; border-right: 1px solid var(--border); background: var(--bg-elevated); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }
.shell-sidebar a { display: block; padding: 0.45rem 0.6rem; border-radius: var(--radius-sm); color: var(--text-secondary); text-decoration: none; transition: background 0.15s ease, color 0.15s ease; }
.shell-sidebar a:hover, .shell-sidebar a[aria-current="page"] { background: var(--bg-card-hover); color: var(--text-primary); }
.shell-group > summary { cursor: pointer; padding: 0.3rem 0.6rem; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.shell-fixed, .shell-group ul, .shell-org ul { list-style: none; margin: 0; padding: 0; }
.shell-org > summary { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; padding: 0.5rem; border-bottom: 1px solid var(--border); color: var(--text-primary); font-weight: 600; }
.shell-org-logo { width: 2.25rem; height: 2.25rem; border-radius: var(--radius-sm); object-fit: cover; background: linear-gradient(135deg, var(--accent-1), var(--accent-2)); }
.shell-preview { margin-top: auto; display: flex; gap: 0.5rem; align-items: end; color: var(--text-secondary); font-size: 0.875rem; }
.shell-main { min-width: 0; }
@media (max-width: 767px) {
  .shell { grid-template-columns: 1fr; }
  .shell-sidebar { position: static; height: auto; }
}
```

- [ ] **Paso 5: Pruebas en verde**

Run: `pnpm --filter improvement test tests/apps-sidebar.test.ts` → PASS.
Run: `pnpm --filter improvement typecheck && pnpm lint` → exit 0.

- [ ] **Paso 6: Commit**

```bash
git add -- apps/improvement/server/apps/sidebar.ts apps/improvement/server/auth/preview.ts apps/improvement/server/auth/guard.ts apps/improvement/components/shell ":(literal)apps/improvement/app/[org]/layout.tsx" apps/improvement/app/globals.css apps/improvement/tests/apps-sidebar.test.ts
git commit -m "F1-T6: barra izquierda, selector de empresa y vista previa como"
```

---

### Tarea 7: Vistas genéricas lista, kanban y ficha

**Archivos:**
- Crear: `apps/improvement/components/views/ControlPanel.tsx`, `ListView.tsx`, `KanbanBoard.tsx`
  (`"use client"`), `RecordForm.tsx`, `ActivityLog.tsx`
- Crear: `apps/improvement/app/[org]/a/[app]/page.tsx`, `apps/improvement/app/[org]/a/[app]/[id]/page.tsx`
- Modificar: `apps/improvement/app/globals.css` (clases `.view-*`)

**Interfaces:**
- Consume: `listRecords`, `getRecord`, `moveRecord`, `saveCustomValues`, `addNote`, `listActivity`
  (T4); `listFields`, `addField` (T3); `BASE_APPS` (T2).

- [ ] **Paso 1: Componentes**

```tsx
// apps/improvement/components/views/ControlPanel.tsx
// El panel de control estilo Odoo: migas, buscador y cambio de vista. Un <form method="get">.
import Link from "next/link";

export function ControlPanel({ title, base, q, vista }: { title: string; base: string; q: string; vista: "lista" | "kanban" }) {
  return (
    <header className="view-control">
      <h1 className="config-title">{title}</h1>
      <form method="get" className="view-search" role="search">
        <label className="sr-only" htmlFor="q">Buscar</label>
        <input id="q" name="q" defaultValue={q} placeholder="Buscar…" className="config-input" />
        <input type="hidden" name="vista" value={vista} />
      </form>
      <nav aria-label="Vista" className="view-switch">
        <Link href={`${base}?vista=lista`} aria-current={vista === "lista" ? "page" : undefined}>Lista</Link>
        <Link href={`${base}?vista=kanban`} aria-current={vista === "kanban" ? "page" : undefined}>Kanban</Link>
      </nav>
    </header>
  );
}
```

```tsx
// apps/improvement/components/views/ListView.tsx
import Link from "next/link";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export interface ViewRecord { id: string; title: string; subtitle: string | null; stage: string; amountCents: number | null }

export function ListView({ base, records, stageName }: { base: string; records: ViewRecord[]; stageName: Record<string, string> }) {
  const total = records.reduce((s, r) => s + (r.amountCents ?? 0), 0);
  const hasAmount = records.some((r) => r.amountCents !== null);
  return (
    <table className="view-table">
      <thead>
        <tr><th scope="col">Nombre</th><th scope="col">Relacionado</th><th scope="col">Etapa</th>{hasAmount && <th scope="col">Monto</th>}</tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.id}>
            <th scope="row"><Link href={`${base}/${r.id}`}>{r.title}</Link></th>
            <td>{r.subtitle ?? "—"}</td>
            <td>{stageName[r.stage] ?? r.stage}</td>
            {hasAmount && <td>{r.amountCents === null ? "—" : MXN.format(r.amountCents / 100)}</td>}
          </tr>
        ))}
        {records.length === 0 && <tr><td colSpan={4} className="config-hint">Sin registros todavía.</td></tr>}
      </tbody>
      {hasAmount && <tfoot><tr><th scope="row" colSpan={3}>Total</th><td>{MXN.format(total / 100)}</td></tr></tfoot>}
    </table>
  );
}
```

```tsx
// apps/improvement/components/views/KanbanBoard.tsx
"use client";
// Kanban: arrastrar una tarjeta a otra columna llama la Server Action de mover. Con teclado, cada
// tarjeta trae un select de etapa (arrastrar no es la única forma).
import Link from "next/link";
import { useTransition } from "react";
import type { ViewRecord } from "./ListView.tsx";

export function KanbanBoard({ base, records, stages, move }: {
  base: string; records: ViewRecord[]; stages: { key: string; name: string }[];
  move: (id: string, stage: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const drop = (stage: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) start(() => move(id, stage));
  };
  return (
    <div className="view-kanban" aria-busy={pending}>
      {stages.map((s) => (
        <section key={s.key} className="view-column" aria-labelledby={`col-${s.key}`} onDragOver={(e) => e.preventDefault()} onDrop={drop(s.key)}>
          <h2 id={`col-${s.key}`} className="config-card-title">{s.name}</h2>
          <ul>
            {records.filter((r) => r.stage === s.key).map((r) => (
              <li key={r.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)} className="view-card">
                <Link href={`${base}/${r.id}`}>{r.title}</Link>
                {r.subtitle && <p className="config-hint">{r.subtitle}</p>}
                <label className="sr-only" htmlFor={`stage-${r.id}`}>Etapa de {r.title}</label>
                <select id={`stage-${r.id}`} value={r.stage} onChange={(e) => start(() => move(r.id, e.target.value))}>
                  {stages.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

```tsx
// apps/improvement/components/views/RecordForm.tsx
// Los campos extra de la ficha, generados de app_field.
export interface FormField { key: string; label: string; type: string; options: string[]; required: boolean }

const inputType: Record<string, string> = { texto: "text", numero: "number", dinero: "number", fecha: "date" };

export function RecordForm({ fields, values, action }: { fields: FormField[]; values: Record<string, unknown>; action: (formData: FormData) => Promise<void> }) {
  if (fields.length === 0) return <p className="config-hint">Esta app todavía no tiene campos extra.</p>;
  return (
    <form action={action} className="config-form" aria-label="Campos">
      {fields.map((f) => {
        const raw = values[f.key];
        const value = f.type === "dinero" && typeof raw === "number" ? String(raw / 100) : raw == null ? "" : String(raw);
        return (
          <label key={f.key} className="permiso-field">
            <span>{f.label}{f.required ? " *" : ""}</span>
            {f.type === "opcion" ? (
              <select name={f.key} defaultValue={value} required={f.required} className="config-input">
                <option value="">—</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "si_no" ? (
              <input type="checkbox" name={f.key} defaultChecked={raw === true} />
            ) : (
              <input name={f.key} type={inputType[f.type] ?? "text"} step={f.type === "dinero" ? "0.01" : undefined} defaultValue={value} required={f.required} className="config-input" />
            )}
          </label>
        );
      })}
      <button type="submit" className="panel-cta">Guardar</button>
    </form>
  );
}
```

```tsx
// apps/improvement/components/views/ActivityLog.tsx
// La bitácora de la ficha (el "chatter" de Odoo): notas y cambios, el más reciente arriba.
const WHEN = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

export function ActivityLog({ items, action }: {
  items: { kind: "nota" | "cambio"; body: string; actorName: string | null; createdAt: Date }[];
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="config-card" aria-labelledby="bitacora">
      <h2 id="bitacora" className="config-card-title">Bitácora</h2>
      <form action={action} className="config-form" aria-label="Nueva nota">
        <label className="permiso-field"><span>Nota</span><textarea name="body" required maxLength={2000} className="config-input" /></label>
        <button type="submit" className="panel-btn-ghost">Agregar nota</button>
      </form>
      <ul className="equipo-list">
        {items.map((a, i) => (
          <li key={i}>
            <strong>{a.actorName ?? "Alguien"}</strong> · {WHEN.format(a.createdAt)}
            <p className={a.kind === "cambio" ? "config-hint" : undefined}>{a.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Paso 2: Páginas**

```tsx
// apps/improvement/app/[org]/a/[app]/page.tsx
// Una app base en lista o kanban. Lo que se ve sale de la configuración (etapas, nombres), no de código por app.
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { listRecords, moveRecord } from "@/server/apps/records.ts";
import { BASE_APPS } from "@/server/apps/catalog.ts";
import { ControlPanel } from "@/components/views/ControlPanel.tsx";
import { ListView } from "@/components/views/ListView.tsx";
import { KanbanBoard } from "@/components/views/KanbanBoard.tsx";

export default async function AppPage({ params, searchParams }: {
  params: Promise<{ org: string; app: string }>;
  searchParams: Promise<{ q?: string; vista?: string }>;
}) {
  const { org: orgId, app } = await params;
  const { q = "", vista: rawVista } = await searchParams;
  const vista = rawVista === "kanban" ? "kanban" : "lista";
  const meta = BASE_APPS.find((a) => a.key === app);
  if (!meta) notFound();
  const { userId } = await requireOrgMembership(orgId);
  const result = await listRecords(userId, orgId, app, { q });
  if (!result.ok) notFound();
  const base = `/${orgId}/a/${app}`;
  const stageName = Object.fromEntries(result.data.stages.map((s) => [s.key, s.name]));

  async function move(id: string, stage: string) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    await moveRecord(actor, orgId, app, id, stage);
    revalidatePath(base);
  }

  return (
    <main className="config-page view-page">
      <ControlPanel title={meta.name} base={base} q={q} vista={vista} />
      {vista === "kanban"
        ? <KanbanBoard base={base} records={result.data.records} stages={result.data.stages} move={move} />
        : <ListView base={base} records={result.data.records} stageName={stageName} />}
    </main>
  );
}
```

> El nombre del `h1` viene de `meta.name` (catálogo). Cuando el dueño renombre apps (Fase 2), léelo de
> `app_model.name` con una función de `records.ts`; no lo leas aquí directo de la base.

```tsx
// apps/improvement/app/[org]/a/[app]/[id]/page.tsx
// La ficha: etapa, campos extra (app_field) y bitácora.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { addNote, getRecord, listActivity, listRecords, saveCustomValues } from "@/server/apps/records.ts";
import { listFields } from "@/server/apps/fields.ts";
import { RecordForm } from "@/components/views/RecordForm.tsx";
import { ActivityLog } from "@/components/views/ActivityLog.tsx";

export default async function RecordPage({ params, searchParams }: {
  params: Promise<{ org: string; app: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId, app, id } = await params;
  const { error } = await searchParams;
  const { userId } = await requireOrgMembership(orgId);
  const record = await getRecord(userId, orgId, app, id);
  if (!record.ok) notFound();
  const [fields, activity, list] = await Promise.all([listFields(orgId, app), listActivity(userId, orgId, app, id), listRecords(userId, orgId, app)]);
  const stages = list.ok ? list.data.stages : [];
  const pagina = `/${orgId}/a/${app}/${id}`;

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const values = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, v.toString()]));
    const r = await saveCustomValues(actor, orgId, app, id, values);
    if (!r.ok) redirect(`${pagina}?error=${encodeURIComponent(r.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }
  async function nota(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    await addNote(actor, orgId, app, id, formData.get("body")?.toString() ?? "");
    revalidatePath(pagina);
  }

  return (
    <main className="config-page view-page">
      <p className="config-hint"><a href={`/${orgId}/a/${app}`}>Volver a la lista</a></p>
      <h1 className="config-title">{record.data.title}</h1>
      {record.data.subtitle && <p className="config-hint">{record.data.subtitle}</p>}
      <ol className="view-stagebar" aria-label="Etapa">
        {stages.map((s) => <li key={s.key} aria-current={s.key === record.data.stage ? "step" : undefined}>{s.name}</li>)}
      </ol>
      {error && <p className="invite-error">{error}</p>}
      <section className="config-card" aria-labelledby="campos">
        <h2 id="campos" className="config-card-title">Campos</h2>
        <RecordForm fields={fields} values={record.data.custom} action={guardar} />
      </section>
      <ActivityLog items={activity.ok ? activity.data : []} action={nota} />
    </main>
  );
}
```

> `listFields` no tiene guard propio porque `getRecord` ya pasó el de la sección justo antes. Para
> respetar la regla "toda función exportada de `server/**` empieza con su guard", dale a `listFields`
> un `userId` y un `assertMembership` al inicio, y actualiza su uso en `records.ts` (Tarea 4).

En `globals.css` (solo tokens):

```css
/* Vistas genéricas (blueprint improvement-odoo, fase 1). Solo tokens. */
.view-page { max-width: none; }
.view-control { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.view-switch { display: flex; gap: 0.25rem; }
.view-switch a { padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); color: var(--text-secondary); }
.view-switch a[aria-current="page"] { background: linear-gradient(135deg, var(--accent-1), var(--accent-2)); color: var(--bg); }
.view-table { width: 100%; border-collapse: collapse; }
.view-table th, .view-table td { text-align: left; padding: 0.6rem; border-bottom: 1px solid var(--border); }
.view-kanban { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(16rem, 1fr); gap: 0.75rem; overflow-x: auto; }
.view-column { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem; }
.view-column ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.view-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.6rem; cursor: grab; }
.view-stagebar { display: flex; gap: 0.25rem; list-style: none; padding: 0; margin: 0.75rem 0; }
.view-stagebar li { padding: 0.35rem 0.75rem; border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text-secondary); }
.view-stagebar li[aria-current="step"] { background: linear-gradient(135deg, var(--accent-1), var(--accent-2)); color: var(--bg); }
```

Si `sr-only` no existe como clase de Tailwind en este proyecto, usa la utilidad de Tailwind v4
`sr-only` (sí existe por defecto).

- [ ] **Paso 3: Typecheck y lint**

Run: `pnpm --filter improvement typecheck && pnpm lint` → exit 0.

- [ ] **Paso 4: Commit**

```bash
git add -- apps/improvement/components/views ":(literal)apps/improvement/app/[org]/a" apps/improvement/app/globals.css apps/improvement/server/apps/fields.ts apps/improvement/server/apps/records.ts
git commit -m "F1-T7: vistas lista, kanban y ficha con bitácora"
```

---

### Tarea 8: Inicio del negocio y adiós al edificio

**Archivos:**
- Crear: `apps/improvement/app/[org]/page.tsx`
- Modificar: `apps/improvement/app/page.tsx`, `apps/improvement/app/empresas/[orgId]/page.tsx`,
  `apps/improvement/app/empresas/page.tsx`
- Borrar: `apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx` y lo que solo él usaba
  (comprueba con `grep -rn "BuildingExperience\|buildingGraph" apps/improvement`)

**Interfaces:**
- Consume: `getBrand` (T5); `loadOwnerTasks(userId, now)` (`server/tasks/loadOwnerTasks.ts`);
  `isPlatformAdmin`; `loadOwnerPanel(userId)` para saber la primera empresa del dueño.

- [ ] **Paso 1: Inicio**

```tsx
// apps/improvement/app/[org]/page.tsx
// Inicio del negocio: portada y logo de su marca, y lo que le importa hoy. El tablero personalizable
// llega en la fase 5; aquí van las tarjetas fijas.
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { getBrand } from "@/server/brand/brand.ts";
import { loadOwnerTasks } from "@/server/tasks/loadOwnerTasks.ts";

export default async function OrgHome({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const { userId } = await requireOrgMembership(orgId);
  const [brand, tasks] = await Promise.all([getBrand(userId, orgId), loadOwnerTasks(userId)]);
  const mine = tasks.filter((t) => t.orgId === orgId).slice(0, 8);

  return (
    <main className="config-page">
      <header className="home-cover" style={brand.coverUrl ? { backgroundImage: `url(${brand.coverUrl})` } : undefined}>
        {brand.logoUrl && <img src={brand.logoUrl} alt="" className="home-logo" />}
      </header>
      <h1 className="config-title">Lo que toca hoy</h1>
      <section className="config-card" aria-labelledby="hoy">
        <h2 id="hoy" className="config-card-title">Pendientes</h2>
        <ul className="equipo-list">
          {mine.map((t) => <li key={t.id}>{t.title}</li>)}
          {mine.length === 0 && <li className="config-hint">Nada pendiente por ahora.</li>}
        </ul>
      </section>
    </main>
  );
}
```

> Lee la forma real de `OwnerTask` (`server/tasks/loadOwnerTasks.ts`) y usa sus campos verdaderos (id,
> título, org); si no trae `orgId`, filtra con el que tenga.

CSS (solo tokens):

```css
.home-cover { position: relative; height: 12rem; border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--accent-1), var(--accent-2)); background-size: cover; background-position: center; margin-bottom: 3rem; }
.home-logo { position: absolute; left: 1.5rem; bottom: -2.5rem; width: 5.5rem; height: 5.5rem; border-radius: var(--radius-md); border: 3px solid var(--bg); object-fit: cover; background: var(--bg-elevated); }
```

- [ ] **Paso 2: Sin edificio**

- `app/page.tsx`: sin sesión → `/login`; platform admin → `/empresas`; dueño o empleado → `/<primera
  empresa>`. Si no tiene empresa → `/empresas` (conserva "solicitar empresa" mientras llega el
  registro de la Fase 2).
- `app/empresas/[orgId]/page.tsx`: reemplaza su contenido por `redirect(\`/${orgId}\`)` después de su
  guard actual.
- Borra `BuildingExperience.tsx` y lo que solo él importaba. **No toques**
  `packages/ui/src/building/*` (lo usa `apps/admin`).
- Busca y cambia cada enlace a `/empresas/${id}` dentro de `apps/improvement` por `/${id}`:
  `grep -rn "/empresas/\${" apps/improvement/app apps/improvement/components`.

- [ ] **Paso 3: Gate**

Run: `pnpm lint && pnpm typecheck && pnpm test` → exit 0.

- [ ] **Paso 4: Commit**

```bash
git add -- ":(literal)apps/improvement/app/[org]/page.tsx" apps/improvement/app/page.tsx apps/improvement/app/empresas apps/improvement/app/globals.css
git commit -m "F1-T8: inicio con la marca del negocio y sin edificio"
```

---

### Tarea 9: E2E del frente nuevo

**Archivos:**
- Crear: `apps/improvement/tests/e2e/frente.spec.ts`
- Modificar: cualquier spec que navegue por el edificio (`grep -rln "empresas/\|edificio" apps/improvement/tests/e2e`)

- [ ] **Paso 1: Spec**

```ts
// apps/improvement/tests/e2e/frente.spec.ts
// El frente nuevo contra el build de producción: shell con marca, apps en la barra, lista, kanban y
// ficha, y que el edificio ya no existe. Siembra un org con dueño, un cliente y un trato.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, membership, organization, orgBrand, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const EMAIL = `frente-owner-${Date.now()}@example.com`;
const PASSWORD = crypto.randomUUID();
let orgId: string;
let ownerId: string;
let dealId: string;
let token: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(EMAIL, PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Frente E2E", slug: `frente-e2e-${Date.now()}` }).returning();
  orgId = org!.id;
  await db.insert(profile).values({ id: ownerId, email: EMAIL, fullName: "Dueña Frente" });
  await db.insert(membership).values({ userId: ownerId, orgId, role: "owner", acceptedAt: new Date() });
  await db.insert(orgBrand).values({ orgId, primaryColor: "#cc3366" });
  const [c] = await db.insert(client).values({ orgId, name: "Familia García" }).returning();
  const [d] = await db.insert(deal).values({ orgId, clientId: c!.id, title: "Boda García", amountCents: 8000000 }).returning();
  dealId = d!.id;
  token = await signInTestUser(EMAIL, PASSWORD);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId));
  if (ownerId) { await db.delete(profile).where(eq(profile.id, ownerId)); await deleteTestAuthUser(ownerId); }
});

async function as(context: BrowserContext, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: token, url: baseURL ?? "http://localhost:3200" }]);
}
async function noSerious(page: Page) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
}

test("WHEN el dueño entra a su negocio THE SYSTEM SHALL mostrar la barra con Ventas y su color de marca, y 0 serious o critical", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  expect((await page.goto(`/${orgId}`))?.status()).toBe(200);
  await expect(page.getByRole("navigation", { name: "Aplicaciones" }).getByRole("link", { name: "Ventas" })).toBeVisible();
  expect(await page.locator(".shell").evaluate((el) => getComputedStyle(el).getPropertyValue("--accent-1").trim())).toBe("#cc3366");
  await noSerious(page);
});

test("WHEN abre Ventas en lista y en kanban THE SYSTEM SHALL mostrar Boda García con su total", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}/a/ventas`);
  await expect(page.getByRole("link", { name: "Boda García" })).toBeVisible();
  await expect(page.getByText("$80,000.00").first()).toBeVisible();
  await page.goto(`/${orgId}/a/ventas?vista=kanban`);
  await expect(page.getByRole("heading", { name: "Prospecto" })).toBeVisible();
  await noSerious(page);
});

test("WHEN mueve el trato con el select de etapa THE SYSTEM SHALL guardarlo y la bitácora lo registra", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}/a/ventas?vista=kanban`);
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByLabel("Etapa de Boda García").selectOption("propuesta")]);
  await page.goto(`/${orgId}/a/ventas/${dealId}`);
  await expect(page.getByText("Etapa: prospecto → propuesta")).toBeVisible();
  await noSerious(page);
});

test("WHEN abre la ruta vieja del edificio THE SYSTEM SHALL llevarlo a su inicio", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/empresas/${orgId}`);
  await expect(page).toHaveURL(new RegExp(`/${orgId}$`));
});
```

- [ ] **Paso 2: Correr el e2e completo**

Run: `pnpm --filter improvement test:e2e` → exit 0. Corrige los specs que dependían del edificio.

- [ ] **Paso 3: Gate y build**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → exit 0.

- [ ] **Paso 4: Commit**

```bash
git add -- apps/improvement/tests/e2e
git commit -m "F1-T9: e2e del frente nuevo"
```

---

## Cobertura de la spec (fase 1)

| Spec | Tarea |
|---|---|
| §3 `org_brand`, `app_group`, `app_model`, `app_stage`, `app_field`, `app_view`, `custom` | T1 |
| §3 `schemaFor` única validación | T3, T4 |
| §4 barra izquierda, selector de empresa, vista previa como, grupos | T6 |
| §4 inicio con portada y logo | T8 |
| §4 vistas lista (totales), kanban (arrastrar), ficha (etapas, campos, bitácora) | T7 |
| §4 tokens por app, marca del negocio como variables CSS | T5, T6 |
| §2 sin edificio; `/empresas` solo cartera del admin | T8 |
| §10 pruebas: Vitest, RLS como `authenticated`, Playwright + axe, gate | T1–T9 |

Fuera de la fase 1 por diseño: `app_view` editable desde la UI, renombrar o reordenar etapas desde la
UI (el servidor queda listo en la Fase 2), apps custom, Agregar aplicación, Soporte y la burbuja de
Improvement.
