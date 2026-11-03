# Improvement estilo Odoo — Fase 2 (Registro y arranque) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un dueño se registra solo, cuenta su negocio, sube su logo, acepta una propuesta de apps según su giro y llega a su Improvement armado; además puede crear apps propias ("Agregar aplicación") que funcionan con las mismas vistas lista/kanban/ficha.

**Architecture:** Sobre el motor de la Fase 1. Las apps custom viven en `app_model(kind='custom')` + `app_record(data jsonb)` y entran a `server/apps/records.ts` por un adaptador más, así las vistas genéricas no cambian. Las plantillas por giro son un catálogo genérico en código (`server/apps/templates.ts`) que se aplica creando filas. El registro reutiliza el patrón de `AcceptForm` (signUp en el cliente → cookie `imp-access-token` → Server Action que crea profile + organization + membership owner).

**Tech Stack:** Next 16 App Router · TypeScript · Drizzle + Supabase (Auth, Storage, RLS) · zod 4 · Vitest · Playwright + axe.

**Spec:** `blueprints/improvement-odoo/spec.md` (§3, §4, §5 pasos 1, 2 y 4, §9 fase 2). Base: Fase 1 (PR jotapuntoce/Improvement#6).

## Global Constraints

- Dos puertas: cada función de `server/**` empieza con su guard; cada tabla org-scoped nueva nace con su política RLS en la misma migración.
- Motor genérico: nada en `server/**` ni `packages/db/**` nombra un org, empresa o persona; lo de cada negocio vive en filas.
- Toda migración se muestra a Jose Carlos y espera un "sí" explícito antes de `pnpm db:migrate`. Nunca editar a mano un archivo de `packages/db/migrations/` generado; las de RLS/Storage van con `pnpm db:generate --custom`.
- Errores como `{ ok: true, data } | { ok: false, error: { code, message } }`; input validado con zod en el borde.
- Imports relativos con extensión `.ts`/`.tsx`; alias `@/`; sin barrels; rutas nunca importan `@jotapuntoce/db`.
- `"use client"` solo en la hoja que necesita estado o eventos.
- Tokens: ningún hex nuevo fuera de `packages/ui/src/tokens.css`; `org_brand` pinta vía `brandStyle()`.
- `SUPABASE_SERVICE_ROLE_KEY` nunca en `apps/improvement`; `@anthropic-ai/sdk` solo en `server/ai/gateway.ts`.
- Sin dependencia nueva en esta fase.
- Escribir "Jotapuntoce", nunca "J.C". Sin ranking dentro de Improvement.
- Gate: `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar una tarea por hecha.
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca `git add -A`.

## Decisiones de este plan (desvíos de la spec, a confirmar)

| # | Spec | Este plan | Por qué / cuándo cambiarlo |
|---|---|---|---|
| D1 | Tabla `app_template` (semilla) | Catálogo en código `server/apps/templates.ts` | Es genérico por giro, no por cliente; tabla cuando el dueño de Jotapuntoce quiera editar plantillas desde admin. |
| D2 | Permisos por app | Todas las apps custom comparten la sección nueva `aplicaciones` | Un permiso por app pide cambiar `SECTION_SLUGS` a datos; se hace cuando un cliente lo pida. |
| D3 | IA extrae colores y tipografía del logo | Colores con `<canvas>` en el navegador; tipografía queda Geist | El gateway hoy es solo texto; visión llega con la importación (Fase 3). |
| D4 | La propuesta "se ajusta conversando" | Se ajusta con casillas y nombres editables | La conversación llega con la burbuja de Improvement (Fase 4). |
| D5 | Registro con Google | Botón con `signInWithOAuth` + `/auth/callback` | Requiere que Jose Carlos encienda el proveedor Google en Supabase (Auth → Providers). Sin eso, el botón muestra el error de Supabase. |

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` | `orgProfile`, `appRecord`, `TEAM_SIZES` |
| `packages/db/migrations/00xx_*.sql` (generada) + `00xx_registro_rls.sql` (custom) | Tablas + RLS + bucket `brand` |
| `apps/improvement/server/permissions/sections.ts` | Sección `aplicaciones` |
| `apps/improvement/server/apps/templates.ts` | Catálogo de plantillas por giro + `applyTemplate()` |
| `apps/improvement/server/apps/custom.ts` | `createCustomApp()` y adaptador de `app_record` |
| `apps/improvement/server/apps/records.ts` | `gate()` por `app_model`; `createRecord()` |
| `apps/improvement/server/registro/business.ts` | `createOwnBusiness()` |
| `apps/improvement/server/storage/brand.ts` | `uploadBrandLogo()` |
| `apps/improvement/app/registro/**`, `app/auth/callback/**` | Alta de cuenta |
| `apps/improvement/app/arranque/**` | Pasos negocio → marca → propuesta |
| `apps/improvement/app/[org]/aplicaciones/nueva/page.tsx` | Agregar aplicación |
| `apps/improvement/components/shell/Sidebar.tsx` | Enlace "Agregar aplicación" (dueño) |

---

### Task 1: Esquema — `org_profile`, `app_record`, sección `aplicaciones`, bucket `brand`

**Files:**
- Modify: `packages/db/src/schema.ts` (al final, junto a las tablas de la Fase 1)
- Modify: `apps/improvement/server/permissions/sections.ts`
- Create: migración generada + `packages/db/migrations/<n>_registro_rls.sql` (custom)
- Test: `apps/improvement/tests/registro-schema.test.ts`

**Interfaces:**
- Produces: `orgProfile` (`orgId` pk, `teamSize`, `city`, `templateKey`, `onboardedAt`), `appRecord` (`id`, `orgId`, `appId`, `title`, `stage`, `data`, `createdBy`, `createdAt`, `updatedAt`), `TEAM_SIZES = ["solo","2-5","6-20","21+"] as const`, sección `"aplicaciones"` en `SECTION_SLUGS`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/improvement/tests/registro-schema.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appRecord, membership, organization, orgProfile, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-reg", slug: `t-reg-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return o!.id;
}
async function member(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
// Corre una consulta como `authenticated` con el uid dado (misma técnica que apps-schema.test.ts).
async function asUser<T>(uid: string, q: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`);
    await tx.execute(sql`set local role authenticated`);
    const r = await tx.execute(sql.raw(q));
    return r as unknown as T[];
  });
}

describe("esquema de registro y apps custom", () => {
  it("WHEN se guarda el perfil del negocio THE SYSTEM SHALL rechazar un tamaño fuera de TEAM_SIZES", async () => {
    const orgId = await org();
    await db.insert(orgProfile).values({ orgId, teamSize: "2-5", city: "Monterrey" });
    await expect(db.insert(orgProfile).values({ orgId: await org(), teamSize: "mil" })).rejects.toThrow(/org_profile_team_size_check/);
  });

  it("WHEN un empleado sin permiso de aplicaciones lee app_record por PostgREST THE SYSTEM SHALL no ver filas; el dueño sí", async () => {
    const orgId = await org();
    const owner = await member(orgId, "owner");
    const emp = await member(orgId, "employee");
    const [app] = await db.insert(appModel).values({ orgId, key: "mascotas", name: "Mascotas", kind: "custom", section: "aplicaciones" }).returning();
    await db.insert(appRecord).values({ orgId, appId: app!.id, title: "Firulais", stage: "nuevo" });
    expect(await asUser(owner, `select title from app_record`)).toHaveLength(1);
    expect(await asUser(emp, `select title from app_record`)).toHaveLength(0);
  });

  it("WHEN un miembro lee org_profile de otra empresa THE SYSTEM SHALL no verlo", async () => {
    const a = await org();
    const b = await org();
    await db.insert(orgProfile).values({ orgId: b, city: "León" });
    const owner = await member(a, "owner");
    expect(await asUser(owner, `select city from org_profile`)).toHaveLength(0);
  });
});
```

Antes de escribir `asUser`, abre `apps/improvement/tests/apps-schema.test.ts` y copia su helper de RLS tal cual si difiere del de arriba: ese es el que ya está probado contra este Supabase.

- [ ] **Step 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/registro-schema.test.ts`
Expected: FAIL — `orgProfile` / `appRecord` no se exportan de `@jotapuntoce/db/schema`.

- [ ] **Step 3: Agregar las tablas a `schema.ts`**

Al final de `packages/db/src/schema.ts` (los helpers `id()`, `createdAt()` y `organization`, `appModel`, `profile` ya existen arriba):

```ts
// ─── Registro y apps custom (Fase 2 de improvement-odoo) ─────────────────────────────────────────

export const TEAM_SIZES = ["solo", "2-5", "6-20", "21+"] as const;

// Lo que el dueño cuenta de su negocio al registrarse. El giro vive en organization.industry (ya
// existe); aquí lo demás. onboarded_at = terminó el arranque guiado (null = mandarlo a /arranque).
export const orgProfile = pgTable(
  "org_profile",
  {
    orgId: uuid("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
    teamSize: text("team_size"),
    city: text("city"),
    templateKey: text("template_key"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("org_profile_team_size_check", sql`${t.teamSize} is null or ${t.teamSize} in ('solo','2-5','6-20','21+')`)],
);

// Registros de las apps que crea el dueño (app_model.kind = 'custom'). Los valores de sus campos
// (app_field) van en data; title y stage son columnas porque toda vista los usa.
export const appRecord = pgTable(
  "app_record",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    appId: uuid("app_id").notNull().references(() => appModel.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    stage: text("stage").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_app_record_app").on(t.appId, t.updatedAt)],
);
```

Si `check`, `index` o `jsonb` no están ya en el import de `drizzle-orm/pg-core` de `schema.ts`, agrégalos ahí (revisa primero; la Fase 1 ya usa los tres).

- [ ] **Step 4: Agregar la sección**

En `apps/improvement/server/permissions/sections.ts`, agrega `"aplicaciones"` al final de `SECTION_SLUGS` y su etiqueta en el mapa de nombres del mismo archivo (búscalo con `grep -n "postventa" server/permissions/sections.ts`; la etiqueta es `"Aplicaciones propias"`).

- [ ] **Step 5: Generar la migración de tablas y la custom de RLS**

Run: `pnpm db:generate` y luego `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name registro_rls`
Contenido del archivo custom:

```sql
-- org_profile: lo leen los miembros de su empresa. app_record: el dueño, o quien tenga la sección
-- 'aplicaciones' en su tipo de permiso (misma regla que record_activity en 0059).
alter table org_profile enable row level security;
create policy "members read their org profile" on org_profile for select
  using (exists (select 1 from membership m where m.org_id = org_profile.org_id and m.user_id = auth.uid()));
alter table app_record enable row level security;
create policy "members read custom records their permission type allows" on app_record for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = app_record.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or coalesce(pt.grants->>'aplicaciones', 'ninguno') <> 'ninguno')));
grant select on org_profile, app_record to authenticated;

-- Bucket `brand`: logo y portada de cada negocio, lectura pública; escribe solo el dueño, en la
-- carpeta de su org (`<orgId>/logo.png`). Mismo patrón que avatars (0011).
insert into storage.buckets (id, name, public) values ('brand', 'brand', true) on conflict (id) do nothing;
drop policy if exists "brand is publicly readable" on storage.objects;
create policy "brand is publicly readable" on storage.objects for select using (bucket_id = 'brand');
drop policy if exists "owners write their brand" on storage.objects;
create policy "owners write their brand" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and exists (select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));
drop policy if exists "owners replace their brand" on storage.objects;
create policy "owners replace their brand" on storage.objects for update to authenticated
  using (bucket_id = 'brand' and exists (select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));
```

- [ ] **Step 6: Mostrar el SQL a Jose Carlos y esperar su "sí"**

Pega en el chat ambas migraciones completas. No corras nada hasta leer un "sí" explícito. Luego: `pnpm db:migrate`.

- [ ] **Step 7: Correr la prueba**

Run: `pnpm --filter improvement test tests/registro-schema.test.ts`
Expected: PASS (3).

- [ ] **Step 8: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/db/src/schema.ts packages/db/migrations apps/improvement/server/permissions/sections.ts apps/improvement/tests/registro-schema.test.ts
git commit -m "Fase 2 T1: org_profile, app_record, sección aplicaciones y bucket brand con RLS"
```

---

### Task 2: Apps custom en el motor — crear app, registros y vistas genéricas

**Files:**
- Create: `apps/improvement/server/apps/custom.ts`
- Modify: `apps/improvement/server/apps/records.ts` (`gate()`, nuevo `createRecord()`)
- Modify: `apps/improvement/server/apps/fields.ts` (`listFields`/`addField` aceptan apps custom: ya buscan por `appModel.key`, verifica que no filtren por `kind`)
- Modify: `apps/improvement/app/[org]/a/[app]/page.tsx`, `apps/improvement/app/[org]/a/[app]/[id]/page.tsx` (meta desde `app_model`, botón "Nuevo")
- Modify: `apps/improvement/components/views/ControlPanel.tsx` (formulario "Nuevo" opcional)
- Test: `apps/improvement/tests/apps-custom.test.ts`

**Interfaces:**
- Consumes: `appRecord`, sección `aplicaciones` (T1); `ADAPTERS`, `AppRecord` (Fase 1).
- Produces:
  - `createCustomApp(userId, orgId, input: { name: string; groupName: string; stages: string[] }): Promise<Result<{ key: string }>>` — solo dueño.
  - `customAdapter(appId: string): Adapter` (exporta también `type Adapter` desde `adapters.ts`).
  - `getAppMeta(userId, orgId, appKey): Promise<{ key: string; name: string; section: SectionSlug; kind: "base" | "custom"; id: string } | null>` en `records.ts`.
  - `createRecord(userId, orgId, appKey, title: string): Promise<Result<{ id: string }>>` — solo apps custom en esta fase.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/improvement/tests/apps-custom.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { createCustomApp } from "../server/apps/custom.ts";
import { addField } from "../server/apps/fields.ts";
import { createRecord, getRecord, listRecords, moveRecord, saveCustomValues } from "../server/apps/records.ts";
import { loadSidebar } from "../server/apps/sidebar.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-cus", slug: `t-cus-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return { orgId: o!.id, owner: await person(o!.id, "owner"), emp: await person(o!.id, "employee") };
}

describe("apps custom", () => {
  it("WHEN el dueño crea una app THE SYSTEM SHALL darle llave, etapas y lugar en la barra", async () => {
    const { orgId, owner } = await setup();
    const r = await createCustomApp(owner, orgId, { name: "Mascotas atendidas", groupName: "Operación", stages: ["Nuevo", "En consulta", "Alta"] });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.key).toBe("mascotas-atendidas");
    const bar = await loadSidebar(owner, orgId);
    expect(bar.groups.find((g) => g.name === "Operación")?.apps.map((a) => a.key)).toContain("mascotas-atendidas");
    const list = await listRecords(owner, orgId, r.data.key);
    expect(list.ok && list.data.stages.map((s) => s.key)).toEqual(["nuevo", "en-consulta", "alta"]);
  });

  it("WHEN un empleado intenta crear una app THE SYSTEM SHALL negarlo", async () => {
    const { orgId, emp } = await setup();
    const r = await createCustomApp(emp, orgId, { name: "X", groupName: "Ventas", stages: ["A"] });
    expect(r.ok).toBe(false);
  });

  it("WHEN se crea, mueve y llena un registro custom THE SYSTEM SHALL guardarlo con sus campos", async () => {
    const { orgId, owner } = await setup();
    const app = await createCustomApp(owner, orgId, { name: "Mascotas", groupName: "Operación", stages: ["Nuevo", "Alta"] });
    if (!app.ok) throw new Error(app.error.message);
    await addField(owner, orgId, "mascotas", { key: "raza", label: "Raza", type: "texto", options: [], required: false });
    const rec = await createRecord(owner, orgId, "mascotas", "Firulais");
    if (!rec.ok) throw new Error(rec.error.message);
    expect((await moveRecord(owner, orgId, "mascotas", rec.data.id, "alta")).ok).toBe(true);
    expect((await moveRecord(owner, orgId, "mascotas", rec.data.id, "inventada")).ok).toBe(false);
    expect((await saveCustomValues(owner, orgId, "mascotas", rec.data.id, { raza: "Pastor" })).ok).toBe(true);
    const got = await getRecord(owner, orgId, "mascotas", rec.data.id);
    expect(got.ok && got.data).toMatchObject({ title: "Firulais", stage: "alta", custom: { raza: "Pastor" } });
  });

  it("WHEN un empleado sin la sección aplicaciones lista una app custom THE SYSTEM SHALL negarlo", async () => {
    const { orgId, owner, emp } = await setup();
    await createCustomApp(owner, orgId, { name: "Mascotas", groupName: "Operación", stages: ["Nuevo"] });
    expect((await listRecords(emp, orgId, "mascotas")).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/apps-custom.test.ts`
Expected: FAIL — no existe `../server/apps/custom.ts`.

- [ ] **Step 3: Exportar `Adapter` en `adapters.ts`**

Cambia `interface Adapter {` por `export interface Adapter {`.

- [ ] **Step 4: Crear `server/apps/custom.ts`**

```ts
// Apps que crea el dueño: su fila en app_model (kind 'custom'), sus etapas y el adaptador que las
// conecta a las vistas genéricas sobre app_record. Mismo camino que las apps base (records.ts).
import { and, asc, desc, eq, ilike, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, appRecord, appStage } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { ensureOrgApps } from "./catalog.ts";
import type { Adapter, AppRecord } from "./adapters.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR") => ({ ok: false as const, error: { code, message } });

/** "Mascotas atendidas" → "mascotas-atendidas": llave estable para la URL y para app_field. */
export const slugKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const Input = z.object({
  name: z.string().trim().min(2).max(40),
  groupName: z.string().trim().min(2).max(30),
  stages: z.array(z.string().trim().min(1).max(30)).min(1).max(12),
});

export async function createCustomApp(userId: string, orgId: string, input: unknown): Promise<Result<{ key: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño crea aplicaciones.", "FORBIDDEN");
  const parsed = Input.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const { name, groupName, stages } = parsed.data;
  const key = slugKey(name);
  if (!key) return fail("Ese nombre no sirve para una aplicación.");
  await ensureOrgApps(orgId);
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, key)));
    if (taken) return fail("Ya tienes una aplicación con ese nombre.", "CONFLICT");
    const [group] = await tx.select({ id: appGroup.id }).from(appGroup).where(and(eq(appGroup.orgId, orgId), eq(appGroup.name, groupName)));
    const groupId =
      group?.id ??
      (await tx.insert(appGroup).values({ orgId, name: groupName, position: 99 }).returning({ id: appGroup.id }))[0]!.id;
    const [{ last } = { last: 0 }] = await tx.select({ last: max(appModel.position) }).from(appModel).where(eq(appModel.orgId, orgId));
    const [app] = await tx
      .insert(appModel)
      .values({ orgId, key, name, kind: "custom", section: "aplicaciones", icon: "grid", groupId, position: (last ?? 0) + 1 })
      .returning({ id: appModel.id });
    const keys = new Set<string>();
    await tx.insert(appStage).values(
      stages.map((s, position) => {
        let k = slugKey(s) || `etapa-${position + 1}`;
        while (keys.has(k)) k = `${k}-${position + 1}`;
        keys.add(k);
        return { orgId, appId: app!.id, key: k, name: s, position };
      }),
    );
    return { ok: true as const, data: { key } };
  });
}

const toRecord = (r: typeof appRecord.$inferSelect): AppRecord => ({
  id: r.id, title: r.title, subtitle: null, stage: r.stage, amountCents: null, custom: r.data, updatedAt: r.updatedAt,
});

/** El adaptador de una app custom: lee y escribe app_record de esa app, validando la etapa contra app_stage. */
export function customAdapter(appId: string): Adapter {
  const list: Adapter["list"] = async (orgId, q) => {
    const rows = await db
      .select().from(appRecord)
      .where(and(eq(appRecord.orgId, orgId), eq(appRecord.appId, appId), q ? ilike(appRecord.title, `%${q}%`) : undefined))
      .orderBy(desc(appRecord.updatedAt)).limit(200);
    return rows.map(toRecord);
  };
  return {
    list,
    async get(orgId, id) {
      const [r] = await db.select().from(appRecord).where(and(eq(appRecord.id, id), eq(appRecord.orgId, orgId), eq(appRecord.appId, appId)));
      return r ? toRecord(r) : undefined;
    },
    async move(_userId, orgId, id, stage) {
      const [ok] = await db.select({ key: appStage.key }).from(appStage).where(and(eq(appStage.appId, appId), eq(appStage.key, stage)));
      if (!ok) return fail("Esa etapa no existe.");
      const [row] = await db.update(appRecord).set({ stage, updatedAt: new Date() })
        .where(and(eq(appRecord.id, id), eq(appRecord.orgId, orgId), eq(appRecord.appId, appId))).returning({ id: appRecord.id });
      return row ? { ok: true, data: true } : fail("No existe.", "NOT_FOUND");
    },
    async saveCustom(orgId, id, values) {
      const [row] = await db.update(appRecord).set({ data: values, updatedAt: new Date() })
        .where(and(eq(appRecord.id, id), eq(appRecord.orgId, orgId), eq(appRecord.appId, appId))).returning({ data: appRecord.data });
      return row?.data;
    },
  };
}

/** Primera etapa de la app: donde nace todo registro nuevo. */
export async function firstStage(appId: string): Promise<string | undefined> {
  const [s] = await db.select({ key: appStage.key }).from(appStage).where(eq(appStage.appId, appId)).orderBy(asc(appStage.position)).limit(1);
  return s?.key;
}
```

- [ ] **Step 5: Cambiar `gate()` en `records.ts` para que lea `app_model`**

Reemplaza la función `gate` y agrega `getAppMeta` y `createRecord`:

```ts
import { appRecord } from "@jotapuntoce/db/schema"; // súmalo al import existente de schema
import { customAdapter, firstStage } from "./custom.ts";
import type { SectionSlug } from "../permissions/sections.ts";

export interface AppMeta { id: string; key: string; name: string; section: SectionSlug; kind: "base" | "custom" }

/** La app del org por su llave (base o custom), o null. Sin guard: solo la llaman gate() y las páginas tras requireSection. */
export async function getAppMeta(orgId: string, appKey: string): Promise<AppMeta | null> {
  await ensureOrgApps(orgId);
  const [row] = await db
    .select({ id: appModel.id, key: appModel.key, name: appModel.name, section: appModel.section, kind: appModel.kind })
    .from(appModel)
    .where(and(eq(appModel.orgId, orgId), eq(appModel.key, appKey), eq(appModel.enabled, true)));
  return row ? { ...row, section: row.section as SectionSlug, kind: row.kind as "base" | "custom" } : null;
}

/** Lectura: cualquier alcance distinto de "ninguno". Escritura: solo "empresa", igual que las apps base. */
async function gate(userId: string, orgId: string, appKey: string, write: boolean) {
  const app = await getAppMeta(orgId, appKey);
  if (!app) return { error: fail("Esa app no existe.", "NOT_FOUND") };
  const { scope } = await resolveSection(userId, orgId, app.section);
  if (scope === "ninguno" || (write && scope !== "empresa")) return { error: fail("No tienes acceso a esta app.", "FORBIDDEN") };
  const adapter = app.kind === "custom" ? customAdapter(app.id) : ADAPTERS[app.key as BaseAppKey];
  return { app, adapter };
}

export async function createRecord(userId: string, orgId: string, appKey: string, title: string): Promise<Result<{ id: string }>> {
  const g = await gate(userId, orgId, appKey, true);
  if (g.error) return g.error;
  if (g.app.kind !== "custom") return fail("En esta app los registros se crean desde su pantalla de siempre.");
  const t = z.string().trim().min(1).max(120).safeParse(title);
  if (!t.success) return fail("Ponle un nombre.");
  const stage = await firstStage(g.app.id);
  if (!stage) return fail("Esta app no tiene etapas.");
  const [row] = await db.insert(appRecord).values({ orgId, appId: g.app.id, title: t.data, stage, createdBy: userId }).returning({ id: appRecord.id });
  await log(orgId, appKey, g.app.section, row!.id, "cambio", "Registro creado", userId);
  return { ok: true, data: { id: row!.id } };
}
```

`ensureOrgApps(orgId)` en `listRecords` sobra ahora (ya lo hace `getAppMeta`); quítalo de ahí. Importa `BaseAppKey` desde `./catalog.ts`. Quita `BASE_APPS` del import si deja de usarse.

- [ ] **Step 6: Páginas — meta desde `app_model` y botón "Nuevo"**

En `app/[org]/a/[app]/page.tsx` y `[id]/page.tsx`, reemplaza `const meta = BASE_APPS.find((a) => a.key === app); if (!meta) notFound();` por:

```ts
const meta = await getAppMeta(orgId, app);
if (!meta) notFound();
```

(importa `getAppMeta` de `@/server/apps/records.ts` y quita el import de `BASE_APPS`). En la lista agrega la acción y pásala al panel solo para apps custom:

```ts
async function nuevo(formData: FormData) {
  "use server";
  const actor = await getSessionUserId();
  if (!actor) notFound();
  const r = await createRecord(actor, orgId, app, formData.get("title")?.toString() ?? "");
  if (r.ok) redirect(`${base}/${r.data.id}`);
  redirect(`${base}?error=${encodeURIComponent(r.error.message)}`);
}
// …
<ControlPanel title={meta.name} base={base} q={q} vista={vista} create={meta.kind === "custom" ? nuevo : undefined} />
```

Lee `error` de `searchParams` y muéstralo con `<p className="invite-error" role="alert">` como en la ficha.

En `components/views/ControlPanel.tsx` agrega la prop opcional y el formulario, junto al buscador:

```tsx
create?: (formData: FormData) => Promise<void>;
// …
{create && (
  <form action={create} className="view-new" aria-label="Nuevo registro">
    <label className="sr-only" htmlFor="new-title">Nombre del registro nuevo</label>
    <input id="new-title" name="title" required maxLength={120} placeholder="Nuevo…" className="config-input" />
    <button type="submit" className="panel-cta">Nuevo</button>
  </form>
)}
```

Y en `globals.css`, junto a `.view-*`: `.view-new { display: flex; gap: 8px; }`.

- [ ] **Step 7: Correr las pruebas de apps**

Run: `pnpm --filter improvement test tests/apps-custom.test.ts tests/apps-records.test.ts tests/apps-fields.test.ts tests/apps-sidebar.test.ts`
Expected: PASS (todas).

- [ ] **Step 8: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/apps apps/improvement/app/[org]/a apps/improvement/components/views/ControlPanel.tsx apps/improvement/app/globals.css apps/improvement/tests/apps-custom.test.ts
git commit -m "Fase 2 T2: apps custom sobre app_record con las vistas genéricas"
```

---

### Task 3: Agregar aplicación

**Files:**
- Create: `apps/improvement/app/[org]/aplicaciones/nueva/page.tsx`
- Modify: `apps/improvement/components/shell/Sidebar.tsx`, `apps/improvement/app/[org]/layout.tsx`
- Test: `apps/improvement/tests/e2e/frente.spec.ts` (caso nuevo)

**Interfaces:**
- Consumes: `createCustomApp` (T2), `NavLink` (Fase 1).
- Produces: ruta `/[org]/aplicaciones/nueva`; `SidebarData.canAddApps: boolean`.

- [ ] **Step 1: Escribir el caso E2E que falla**

En `tests/e2e/frente.spec.ts`, con el mismo login de dueño que ya usan los otros casos del archivo:

```ts
test("WHEN el dueño agrega una aplicación THE SYSTEM SHALL mostrarla en la barra y dejar crear registros", async ({ page }) => {
  await page.goto(`/${orgId}/aplicaciones/nueva`);
  await page.getByLabel("Nombre").fill("Mascotas");
  await page.getByLabel("Grupo").fill("Operación");
  await page.getByLabel("Etapas (una por renglón)").fill("Nuevo\nAlta");
  await page.getByRole("button", { name: "Crear aplicación" }).click();
  await expect(page).toHaveURL(new RegExp(`/${orgId}/a/mascotas$`));
  await expect(page.getByRole("navigation", { name: "Aplicaciones" }).getByRole("link", { name: "Mascotas" })).toBeVisible();
  await page.getByLabel("Nombre del registro nuevo").fill("Firulais");
  await page.getByRole("button", { name: "Nuevo" }).click();
  await expect(page.getByRole("heading", { name: "Firulais" })).toBeVisible();
});
```

Run: `pnpm --filter improvement test:e2e tests/e2e/frente.spec.ts` → Expected: FAIL (404 en `/aplicaciones/nueva`).

- [ ] **Step 2: La página**

```tsx
// Agregar aplicación: el dueño nombra su app, su grupo en la barra y sus etapas. Los campos se
// agregan después desde la ficha (addField), igual que en las apps base.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findOwnerMembership, getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { createCustomApp } from "@/server/apps/custom.ts";

export default async function NuevaAppPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  if (!(await findOwnerMembership(me.userId, orgId))) notFound();
  const pagina = `/${orgId}/aplicaciones/nueva`;

  async function crear(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await createCustomApp(actor, orgId, {
      name: formData.get("name")?.toString() ?? "",
      groupName: formData.get("groupName")?.toString() ?? "",
      stages: (formData.get("stages")?.toString() ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    });
    if (!r.ok) redirect(`${pagina}?error=${encodeURIComponent(r.error.message)}`);
    revalidatePath(`/${orgId}`, "layout");
    redirect(`/${orgId}/a/${r.data.key}`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Agregar aplicación</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form action={crear} className="config-form config-form-stack config-card" aria-label="Aplicación nueva">
        <label className="permiso-field"><span>Nombre</span><input name="name" required maxLength={40} className="config-input" /></label>
        <label className="permiso-field"><span>Grupo</span><input name="groupName" required maxLength={30} defaultValue="Operación" className="config-input" /></label>
        <label className="permiso-field">
          <span>Etapas (una por renglón)</span>
          <textarea name="stages" required rows={4} defaultValue={"Nuevo\nEn proceso\nTerminado"} className="config-input" />
        </label>
        <button type="submit" className="panel-cta">Crear aplicación</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Enlace en la barra, solo para el dueño**

En `Sidebar.tsx` suma `canAddApps: boolean` a `SidebarData` y, en `shell-fixed`, después de "Tu marca":

```tsx
{data.canAddApps && <li><NavLink href={`/${data.orgId}/aplicaciones/nueva`}>Agregar aplicación</NavLink></li>}
```

En `app/[org]/layout.tsx` pasa `canAddApps: sidebar.permissionTypes !== null` (es no-null solo para el dueño, ver `loadSidebar`).

- [ ] **Step 4: Correr el E2E y a11y**

Agrega `/[org]/aplicaciones/nueva` a la lista de rutas de `tests/e2e/a11y.spec.ts` (mismo formato que `/[org]/a/ventas`).
Run: `pnpm --filter improvement test:e2e tests/e2e/frente.spec.ts tests/e2e/a11y.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add "apps/improvement/app/[org]/aplicaciones" apps/improvement/components/shell/Sidebar.tsx "apps/improvement/app/[org]/layout.tsx" apps/improvement/tests/e2e
git commit -m "Fase 2 T3: Agregar aplicación desde la barra del dueño"
```

---

### Task 4: Plantillas por giro y `applyTemplate()`

**Files:**
- Create: `apps/improvement/server/apps/templates.ts`
- Test: `apps/improvement/tests/apps-templates.test.ts`

**Interfaces:**
- Consumes: `createCustomApp`, `slugKey` (T2); `addField` (Fase 1); `INDUSTRIES` ids (`packages/ui/src/building/industries.ts`).
- Produces:
  - `interface TemplateApp { name: string; group: string; stages: string[]; fields: { key: string; label: string; type: FieldType; options?: string[] }[] }`
  - `templateFor(industry: string | null): { key: string; apps: TemplateApp[] }`
  - `applyTemplate(userId, orgId, picks: { name: string; group: string; stages: string[]; fields: TemplateApp["fields"] }[]): Promise<Result<{ created: string[] }>>` — solo dueño; omite apps cuya llave ya existe.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/improvement/tests/apps-templates.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { applyTemplate, templateFor } from "../server/apps/templates.ts";
import { listFields } from "../server/apps/fields.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-tpl", slug: `t-tpl-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId: o!.id, role: "owner", acceptedAt: new Date() });
  return { orgId: o!.id, owner: id };
}

describe("plantillas por giro", () => {
  it("WHEN el giro no existe o es null THE SYSTEM SHALL usar la plantilla general", () => {
    expect(templateFor(null).key).toBe("general");
    expect(templateFor("inventado").key).toBe("general");
    expect(templateFor("restaurante").key).toBe("restaurante");
  });

  it("WHEN cada plantilla se lee THE SYSTEM SHALL traer apps con etapas y llaves de campo válidas", () => {
    for (const giro of ["restaurante", "retail", "servicios", "salud", "construccion", "tecnologia", "manufactura", "otro", null]) {
      for (const app of templateFor(giro).apps) {
        expect(app.stages.length).toBeGreaterThan(0);
        for (const f of app.fields) expect(f.key).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
      }
    }
  });

  it("WHEN el dueño aplica dos veces la misma plantilla THE SYSTEM SHALL crear las apps una sola vez con sus campos", async () => {
    const { orgId, owner } = await setup();
    const picks = templateFor("salud").apps;
    const first = await applyTemplate(owner, orgId, picks);
    if (!first.ok) throw new Error(first.error.message);
    expect(first.data.created.length).toBe(picks.length);
    const again = await applyTemplate(owner, orgId, picks);
    expect(again.ok && again.data.created).toEqual([]);
    const fields = await listFields(owner, orgId, first.data.created[0]!);
    expect(fields.map((f) => f.key)).toEqual(picks[0]!.fields.map((f) => f.key));
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/apps-templates.test.ts` → Expected: FAIL (módulo no existe).

- [ ] **Step 3: Crear `templates.ts`**

```ts
// Plantillas por giro: apps sugeridas además de las base (Clientes, Ventas, Proyectos, Postventa).
// Catálogo genérico, igual para todo negocio del mismo giro; lo de cada dueño vive en las filas que
// applyTemplate crea y que él cambia después. ponytail: en código, no en tabla app_template; pasa a
// tabla cuando las plantillas se editen desde admin.
import { findOwnerMembership } from "../auth/guard.ts";
import { createCustomApp, slugKey } from "./custom.ts";
import { addField, type FieldType } from "./fields.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface TemplateApp {
  name: string;
  group: string;
  stages: string[];
  fields: { key: string; label: string; type: FieldType; options?: string[] }[];
}

const TAREAS: TemplateApp = {
  name: "Tareas del equipo", group: "Operación", stages: ["Por hacer", "En proceso", "Hecho"],
  fields: [{ key: "responsable", label: "Responsable", type: "texto" }, { key: "fecha_limite", label: "Fecha límite", type: "fecha" }],
};

const TEMPLATES: Record<string, TemplateApp[]> = {
  general: [TAREAS],
  restaurante: [
    { name: "Reservaciones", group: "Ventas", stages: ["Solicitada", "Confirmada", "Atendida", "No llegó"],
      fields: [{ key: "fecha", label: "Fecha", type: "fecha" }, { key: "personas", label: "Personas", type: "numero" }] },
    { name: "Inventario", group: "Operación", stages: ["Suficiente", "Por pedir", "Pedido"],
      fields: [{ key: "proveedor", label: "Proveedor", type: "texto" }, { key: "costo", label: "Costo", type: "dinero" }] },
    TAREAS,
  ],
  retail: [
    { name: "Inventario", group: "Operación", stages: ["Disponible", "Bajo", "Agotado"],
      fields: [{ key: "sku", label: "SKU", type: "texto" }, { key: "precio", label: "Precio", type: "dinero" }] },
    { name: "Pedidos a proveedor", group: "Operación", stages: ["Por pedir", "Pedido", "Recibido"],
      fields: [{ key: "proveedor", label: "Proveedor", type: "texto" }, { key: "monto", label: "Monto", type: "dinero" }] },
    TAREAS,
  ],
  servicios: [
    { name: "Citas", group: "Ventas", stages: ["Agendada", "Confirmada", "Realizada", "Cancelada"],
      fields: [{ key: "fecha", label: "Fecha", type: "fecha" }, { key: "servicio", label: "Servicio", type: "texto" }] },
    TAREAS,
  ],
  salud: [
    { name: "Pacientes", group: "Ventas", stages: ["Primera vez", "En tratamiento", "Alta"],
      fields: [{ key: "telefono", label: "Teléfono", type: "texto" }, { key: "proxima_cita", label: "Próxima cita", type: "fecha" }] },
    { name: "Citas", group: "Operación", stages: ["Agendada", "Confirmada", "Atendida", "No asistió"],
      fields: [{ key: "fecha", label: "Fecha", type: "fecha" }, { key: "motivo", label: "Motivo", type: "texto" }] },
    TAREAS,
  ],
  construccion: [
    { name: "Obras", group: "Operación", stages: ["Planeación", "En obra", "Entregada"],
      fields: [{ key: "direccion", label: "Dirección", type: "texto" }, { key: "presupuesto", label: "Presupuesto", type: "dinero" }] },
    { name: "Materiales", group: "Operación", stages: ["Por cotizar", "Pedido", "En obra"],
      fields: [{ key: "proveedor", label: "Proveedor", type: "texto" }, { key: "costo", label: "Costo", type: "dinero" }] },
    TAREAS,
  ],
  tecnologia: [
    { name: "Soporte", group: "Operación", stages: ["Abierto", "En revisión", "Resuelto"],
      fields: [{ key: "prioridad", label: "Prioridad", type: "opcion", options: ["Alta", "Media", "Baja"] }] },
    TAREAS,
  ],
  manufactura: [
    { name: "Órdenes de producción", group: "Operación", stages: ["Programada", "En producción", "Terminada"],
      fields: [{ key: "cantidad", label: "Cantidad", type: "numero" }, { key: "fecha_entrega", label: "Fecha de entrega", type: "fecha" }] },
    { name: "Inventario", group: "Operación", stages: ["Suficiente", "Por pedir", "Pedido"],
      fields: [{ key: "proveedor", label: "Proveedor", type: "texto" }] },
    TAREAS,
  ],
};

export function templateFor(industry: string | null): { key: string; apps: TemplateApp[] } {
  const key = industry && industry in TEMPLATES ? industry : "general";
  return { key, apps: TEMPLATES[key]! };
}

/** Crea las apps elegidas (o ajustadas) por el dueño con sus campos; las que ya existen se saltan. */
export async function applyTemplate(userId: string, orgId: string, picks: TemplateApp[]): Promise<Result<{ created: string[] }>> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño arma su Improvement." } };
  const created: string[] = [];
  for (const app of picks) {
    const r = await createCustomApp(userId, orgId, { name: app.name, groupName: app.group, stages: app.stages });
    if (!r.ok) {
      if (r.error.code === "CONFLICT") continue;
      return r;
    }
    for (const f of app.fields) {
      const fr = await addField(userId, orgId, r.data.key, { key: f.key, label: f.label, type: f.type, options: f.options ?? [], required: false });
      if (!fr.ok) return fr;
    }
    created.push(r.data.key);
  }
  return { ok: true, data: { created } };
}

export { slugKey };
```

Si `addField` en `fields.ts` no exporta `FieldType`, el tipo ya está exportado (`export type FieldType`); si el input de `addField` usa otros nombres de propiedad, ajústalos al esquema de su `Input` (líneas ~48–57 de `fields.ts`).

- [ ] **Step 4: Correr la prueba**

Run: `pnpm --filter improvement test tests/apps-templates.test.ts` → Expected: PASS (3).

- [ ] **Step 5: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/apps/templates.ts apps/improvement/tests/apps-templates.test.ts
git commit -m "Fase 2 T4: plantillas por giro y applyTemplate"
```

---

### Task 5: Registro — `/registro`, Google y `createOwnBusiness()`

**Files:**
- Create: `apps/improvement/server/registro/business.ts`
- Create: `apps/improvement/app/registro/page.tsx`, `apps/improvement/app/registro/RegistroForm.tsx`
- Create: `apps/improvement/app/auth/callback/page.tsx`
- Create: `apps/improvement/app/arranque/page.tsx` (paso 1, negocio)
- Modify: `apps/improvement/app/login/LoginForm.tsx` (enlace "Crear cuenta"), `apps/improvement/app/page.tsx` (sin empresa → `/arranque`)
- Test: `apps/improvement/tests/registro.test.ts`

**Interfaces:**
- Consumes: `orgProfile`, `TEAM_SIZES` (T1); `ensureOrgApps` (Fase 1); `INDUSTRIES` (`@jotapuntoce/ui/building/industries` — verifica el subpath exportado en `packages/ui/package.json`; si no hay, copia los ids a un `z.enum` local y apunta un comentario a la fuente).
- Produces:
  - `createOwnBusiness(user: { id: string; email: string }, input: { fullName: string; name: string; industry: string; teamSize: string; city: string }): Promise<Result<{ orgId: string }>>`
  - `getSessionUser(): Promise<{ id: string; email: string } | null>` — si `guard.ts` ya expone algo equivalente (lo usa `server/invitations/mutations.ts` como `sessionUser`), reutilízalo en vez de crear otro.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/improvement/tests/registro.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, membership, organization, orgProfile, profile } from "@jotapuntoce/db/schema";
import { createOwnBusiness } from "../server/registro/business.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
const user = () => {
  const id = crypto.randomUUID();
  profileIds.push(id);
  return { id, email: `${id}@example.com` };
};
const input = { fullName: "Ana Pérez", name: "Clínica Sonrisa", industry: "salud", teamSize: "2-5", city: "Monterrey" };

describe("registro de un negocio propio", () => {
  it("WHEN alguien nuevo registra su negocio THE SYSTEM SHALL crearlo con él como dueño, su perfil y sus apps base", async () => {
    const u = user();
    const r = await createOwnBusiness(u, input);
    if (!r.ok) throw new Error(r.error.message);
    orgIds.push(r.data.orgId);
    const [m] = await db.select().from(membership).where(eq(membership.orgId, r.data.orgId));
    expect(m).toMatchObject({ userId: u.id, role: "owner" });
    expect(m!.acceptedAt).not.toBeNull();
    const [o] = await db.select().from(organization).where(eq(organization.id, r.data.orgId));
    expect(o).toMatchObject({ name: "Clínica Sonrisa", industry: "salud", kind: "barco" });
    const [p] = await db.select().from(orgProfile).where(eq(orgProfile.orgId, r.data.orgId));
    expect(p).toMatchObject({ teamSize: "2-5", city: "Monterrey", templateKey: "salud", onboardedAt: null });
    expect((await db.select().from(appModel).where(eq(appModel.orgId, r.data.orgId))).length).toBe(4);
  });

  it("WHEN el giro o el tamaño no son válidos THE SYSTEM SHALL rechazarlo sin crear nada", async () => {
    const u = user();
    expect((await createOwnBusiness(u, { ...input, industry: "astronautas" })).ok).toBe(false);
    expect((await createOwnBusiness(u, { ...input, teamSize: "mil" })).ok).toBe(false);
    expect(await db.select().from(membership).where(eq(membership.userId, u.id))).toEqual([]);
  });

  it("WHEN la misma persona registra un segundo negocio THE SYSTEM SHALL permitirlo y reutilizar su perfil", async () => {
    const u = user();
    const a = await createOwnBusiness(u, input);
    const b = await createOwnBusiness(u, { ...input, name: "Clínica Norte" });
    if (!a.ok || !b.ok) throw new Error("falló el alta");
    orgIds.push(a.data.orgId, b.data.orgId);
    expect(a.data.orgId).not.toBe(b.data.orgId);
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/registro.test.ts` → Expected: FAIL (módulo no existe).

- [ ] **Step 3: `server/registro/business.ts`**

```ts
// Alta de un negocio por su propio dueño (registro abierto). Crea perfil, organización, membresía de
// dueño y su perfil de negocio en una transacción; las apps base se siembran al final. "Solicitar
// empresa" (company_request) queda para lo que Jotapuntoce construye a la medida.
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { membership, organization, orgProfile, profile, TEAM_SIZES } from "@jotapuntoce/db/schema";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries";
import { ensureOrgApps } from "../apps/catalog.ts";
import { templateFor } from "../apps/templates.ts";
import { slugKey } from "../apps/custom.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const Input = z.object({
  fullName: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(80),
  industry: z.enum(INDUSTRIES.map((i) => i.id) as [string, ...string[]]),
  teamSize: z.enum(TEAM_SIZES),
  city: z.string().trim().min(2).max(60),
});

export async function createOwnBusiness(user: { id: string; email: string }, input: unknown): Promise<Result<{ orgId: string }>> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." } };
  const { fullName, name, industry, teamSize, city } = parsed.data;
  const orgId = await db.transaction(async (tx) => {
    await tx.insert(profile).values({ id: user.id, email: user.email, fullName }).onConflictDoUpdate({ target: profile.id, set: { fullName } });
    const [org] = await tx
      .insert(organization)
      .values({ name, slug: `${slugKey(name) || "negocio"}-${crypto.randomUUID().slice(0, 8)}`, industry, kind: "barco" })
      .returning({ id: organization.id });
    await tx.insert(membership).values({ userId: user.id, orgId: org!.id, role: "owner", acceptedAt: new Date() });
    await tx.insert(orgProfile).values({ orgId: org!.id, teamSize, city, templateKey: templateFor(industry).key });
    return org!.id;
  });
  await ensureOrgApps(orgId);
  return { ok: true, data: { orgId } };
}
```

Verifica que el subpath `@jotapuntoce/ui/building/industries` resuelva (`grep -n exports packages/ui/package.json`); si no, importa por la ruta que ya usa algún archivo de `apps/improvement` (`grep -rn "industries" apps/improvement --include=*.ts* | head`).

- [ ] **Step 4: Formulario de cuenta (`/registro`)**

`app/registro/page.tsx`: igual que `app/login/page.tsx` (envuelve en `<Suspense>`), renderiza `<RegistroForm />`.

`app/registro/RegistroForm.tsx` — copia la estructura de `app/login/LoginForm.tsx` (mismas constantes `supabaseUrl`/`supabaseAnonKey` con acceso literal a `process.env.NEXT_PUBLIC_*`, mismo estilo, misma cookie). Cambios:
- `supabase.auth.signUp({ email, password })`; si no hay sesión, `signInWithPassword` con los mismos datos (patrón de `AcceptForm.tsx` líneas ~67–85). Si sigue sin sesión: "Revisa tu correo para confirmar tu cuenta y luego entra."
- Contraseña con `minLength={8}`.
- Al tener sesión: `document.cookie = imp-access-token…` (idéntico a LoginForm) y `router.push("/arranque")`.
- Botón "Continuar con Google":

```ts
async function google() {
  const supabase = createClient(supabaseUrl!, supabaseAnonKey!);
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
  if (error) setError("Google no está disponible todavía. Usa tu correo.");
}
```

- Enlace "¿Ya tienes cuenta? Entra" a `/login`. En `LoginForm.tsx` agrega el inverso: "¿Nuevo? Crea tu cuenta" a `/registro`.

- [ ] **Step 5: `/auth/callback`**

```tsx
"use client";
// Regreso de Google: supabase-js lee la sesión del fragmento de la URL; aquí solo se copia el token
// a la cookie que lee guard.ts (mismo atajo documentado en LoginForm) y se manda a "/".
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return setError(true);
    createClient(supabaseUrl, supabaseAnonKey).auth.getSession().then(({ data }) => {
      if (!data.session) return setError(true);
      document.cookie = `imp-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax`;
      router.replace("/");
      router.refresh();
    });
  }, [router]);
  return <main className="config-page"><p role="status">{error ? "No pudimos entrar con Google. Intenta con tu correo." : "Entrando…"}</p></main>;
}
```

- [ ] **Step 6: Paso 1 del arranque (`/arranque`)**

```tsx
// Arranque, paso 1 de 3: el negocio. Crea la empresa y sigue con su marca.
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/guard.ts";
import { createOwnBusiness } from "@/server/registro/business.ts";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries";

const SIZES = [["solo", "Solo yo"], ["2-5", "2 a 5"], ["6-20", "6 a 20"], ["21+", "Más de 20"]] as const;

export default async function Arranque({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?returnTo=/arranque");
  const { error } = await searchParams;

  async function crear(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) notFound();
    const r = await createOwnBusiness(actor, Object.fromEntries(["fullName", "name", "industry", "teamSize", "city"].map((k) => [k, formData.get(k)?.toString() ?? ""])));
    if (!r.ok) redirect(`/arranque?error=${encodeURIComponent(r.error.message)}`);
    redirect(`/arranque/${r.data.orgId}/marca`);
  }

  return (
    <main className="config-page">
      <p className="config-hint">Paso 1 de 3</p>
      <h1 className="config-title">Cuéntanos de tu negocio</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form action={crear} className="config-form config-form-stack config-card" aria-label="Tu negocio">
        <label className="permiso-field"><span>Tu nombre</span><input name="fullName" required maxLength={80} className="config-input" /></label>
        <label className="permiso-field"><span>Nombre del negocio</span><input name="name" required maxLength={80} className="config-input" /></label>
        <label className="permiso-field"><span>Giro</span>
          <select name="industry" required className="config-input">{INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select>
        </label>
        <label className="permiso-field"><span>¿Cuántos son?</span>
          <select name="teamSize" required className="config-input">{SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="permiso-field"><span>Ciudad</span><input name="city" required maxLength={60} className="config-input" /></label>
        <button type="submit" className="panel-cta">Seguir</button>
      </form>
    </main>
  );
}
```

`getSessionUser()`: búscalo primero en `server/auth/guard.ts` (la invitación usa algo equivalente). Si no existe, agrégalo a `guard.ts` junto a `getSessionUserId`, reutilizando su misma lectura de cookie y devolviendo `{ id, email }` del usuario de Supabase.

En `app/page.tsx`, cambia `redirect(orgId ? \`/${orgId}\` : "/empresas")` por `redirect(orgId ? \`/${orgId}\` : "/arranque")`. El platform admin sigue yendo a `/empresas` antes.

- [ ] **Step 7: Correr las pruebas**

Run: `pnpm --filter improvement test tests/registro.test.ts tests/auth/guard.test.ts` → Expected: PASS.

- [ ] **Step 8: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/registro apps/improvement/app/registro apps/improvement/app/auth apps/improvement/app/arranque/page.tsx apps/improvement/app/login/LoginForm.tsx apps/improvement/app/page.tsx apps/improvement/server/auth/guard.ts apps/improvement/tests/registro.test.ts
git commit -m "Fase 2 T5: registro abierto, Google y alta del negocio propio"
```

---

### Task 6: Arranque — marca desde el logo y propuesta

**Files:**
- Create: `apps/improvement/server/storage/brand.ts`
- Create: `apps/improvement/app/arranque/[org]/marca/page.tsx`, `apps/improvement/app/arranque/[org]/marca/LogoColors.tsx`
- Create: `apps/improvement/app/arranque/[org]/propuesta/page.tsx`
- Create: `apps/improvement/server/registro/onboarding.ts`
- Test: `apps/improvement/tests/onboarding.test.ts`

**Interfaces:**
- Consumes: `saveBrand`, `getBrand` (Fase 1); `templateFor`, `applyTemplate` (T4); `orgProfile` (T1); `uploadAvatar` como patrón.
- Produces:
  - `uploadBrandLogo(userId, orgId, accessToken, file: File): Promise<Result<string>>` (URL pública).
  - `finishOnboarding(userId, orgId, picks: TemplateApp[]): Promise<Result<true>>` — aplica la plantilla y marca `onboarded_at`.
  - `loadProposal(userId, orgId): Promise<Result<{ templateKey: string; apps: TemplateApp[] }>>`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/improvement/tests/onboarding.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, organization, orgProfile, profile } from "@jotapuntoce/db/schema";
import { createOwnBusiness } from "../server/registro/business.ts";
import { finishOnboarding, loadProposal } from "../server/registro/onboarding.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function business(industry: string) {
  const u = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` };
  profileIds.push(u.id);
  const r = await createOwnBusiness(u, { fullName: "Ana", name: "Negocio", industry, teamSize: "solo", city: "León" });
  if (!r.ok) throw new Error(r.error.message);
  orgIds.push(r.data.orgId);
  return { owner: u.id, orgId: r.data.orgId };
}

describe("arranque guiado", () => {
  it("WHEN el dueño abre la propuesta THE SYSTEM SHALL darle la plantilla de su giro", async () => {
    const { owner, orgId } = await business("restaurante");
    const p = await loadProposal(owner, orgId);
    expect(p.ok && p.data.apps.map((a) => a.name)).toContain("Reservaciones");
  });

  it("WHEN el dueño acepta solo algunas apps, renombradas THE SYSTEM SHALL crear esas y marcar el arranque terminado", async () => {
    const { owner, orgId } = await business("restaurante");
    const p = await loadProposal(owner, orgId);
    if (!p.ok) throw new Error(p.error.message);
    const r = await finishOnboarding(owner, orgId, [{ ...p.data.apps[0]!, name: "Mesas apartadas" }]);
    expect(r.ok).toBe(true);
    const custom = await db.select({ key: appModel.key }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.kind, "custom")));
    expect(custom.map((c) => c.key)).toEqual(["mesas-apartadas"]);
    const [prof] = await db.select().from(orgProfile).where(eq(orgProfile.orgId, orgId));
    expect(prof!.onboardedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `pnpm --filter improvement test tests/onboarding.test.ts` → Expected: FAIL.

- [ ] **Step 3: `server/registro/onboarding.ts`**

```ts
// El arranque guiado después del alta: la propuesta (plantilla del giro) y su cierre.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, orgProfile } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { applyTemplate, templateFor, type TemplateApp } from "../apps/templates.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const forbidden = { ok: false as const, error: { code: "FORBIDDEN", message: "Solo el dueño arma su Improvement." } };

export async function loadProposal(userId: string, orgId: string): Promise<Result<{ templateKey: string; apps: TemplateApp[] }>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const [org] = await db.select({ industry: organization.industry }).from(organization).where(eq(organization.id, orgId));
  const t = templateFor(org?.industry ?? null);
  return { ok: true, data: { templateKey: t.key, apps: t.apps } };
}

export async function finishOnboarding(userId: string, orgId: string, picks: TemplateApp[]): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const r = await applyTemplate(userId, orgId, picks);
  if (!r.ok) return r;
  await db.update(orgProfile).set({ onboardedAt: new Date(), updatedAt: new Date() }).where(eq(orgProfile.orgId, orgId));
  return { ok: true, data: true };
}
```

- [ ] **Step 4: `server/storage/brand.ts`**

Copia `server/storage/avatar.ts` como base (mismas validaciones de tipo y 2 MB, mismo cliente con el token del usuario). Diferencias:
- Comprueba primero `findOwnerMembership(userId, orgId)`; si no, `FORBIDDEN`.
- Bucket `"brand"`, ruta `${orgId}/logo.${extension}`, `upsert: true`.
- Devuelve la URL pública: `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand/${path}?v=${Date.now()}` (el `?v=` evita que el navegador muestre el logo anterior tras reemplazarlo).

- [ ] **Step 5: Paso 2 — marca (`/arranque/[org]/marca`)**

`page.tsx` (Server Component): guard con `requireOrgMembership(org)` + `findOwnerMembership` (si no es dueño, `notFound()`). Server Action `guardar(formData)`:
1. Lee la sesión con `getSessionUserId()` y el token de la cookie con el mismo helper que usa la subida de avatar (búscalo: `grep -rn "uploadAvatar(" apps/improvement/app`).
2. Si viene `logo` (File con `size > 0`), `uploadBrandLogo` y usa su URL como `logoUrl`.
3. `saveBrand(actor, org, { logoUrl, coverUrl: null, primaryColor, secondaryColor })`.
4. `redirect(\`/arranque/${org}/propuesta\`)`. Enlace "Saltar este paso" a la misma ruta.

Formulario: `<input type="file" name="logo" accept="image/png,image/jpeg,image/webp">` dentro de `<LogoColors>` y los dos `<input type="color">` con `DEFAULT_PICKER` (Fase 1).

`LogoColors.tsx` (`"use client"`, la única hoja con estado): al elegir el archivo, lo dibuja en un `<canvas>` de 64×64, cuenta los píxeles por color redondeado a múltiplos de 32 e ignora los casi blancos, casi negros y transparentes. Pone los dos colores más frecuentes en los inputs `primaryColor` y `secondaryColor` (por `name`, con `form.elements.namedItem`). Muestra la vista previa del logo y un texto: "Tomamos estos colores de tu logo; cámbialos si quieres."

```ts
export function dominantColors(data: Uint8ClampedArray): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a < 128) continue;
    const light = (r + g + b) / 3;
    if (light > 235 || light < 20) continue;
    const q = (v: number) => Math.min(255, Math.round(v / 32) * 32);
    const hex = `#${[q(r), q(g), q(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([h]) => h);
}
```

Exporta `dominantColors` y agrégale una prueba Vitest en `tests/logo-colors.test.ts`: un arreglo con 10 píxeles rojos, 5 azules, 20 blancos y 3 transparentes devuelve `["#e00000"…]` — calcula el hex esperado con la misma cuantización (rojo `255,0,0` → `#ff0000`; azul `0,0,255` → `#0000ff`) y afirma `["#ff0000", "#0000ff"]`.

- [ ] **Step 6: Paso 3 — propuesta (`/arranque/[org]/propuesta`)**

Server Component con `loadProposal`. Una `config-card` por app sugerida con:
- casilla `<input type="checkbox" name="pick" value={i} defaultChecked>` y su `<label>`,
- `<input name={\`name-${i}\`} defaultValue={app.name}>` (renombrar),
- debajo, en `config-hint`, "Etapas: …" y "Campos: …".

Arriba, una línea fija: "Ya traes Clientes, Ventas, Proyectos y Postventa." Server Action `armar(formData)`: toma los índices de `pick`, arma `picks` con el nombre editado (`name-${i}`, recortado, máximo 40), llama `finishOnboarding` y hace `redirect(\`/${org}\`)`; si falla, vuelve con `?error=`. Botón "Armar mi Improvement".

- [ ] **Step 7: Mandar al arranque a quien no lo terminó**

En `app/[org]/page.tsx`, si quien entra es dueño y `org_profile` existe con `onboarded_at` null, `redirect(\`/arranque/${orgId}/marca\`)`. Agrega a `onboarding.ts`:

```ts
export async function needsOnboarding(userId: string, orgId: string): Promise<boolean> {
  if (!(await findOwnerMembership(userId, orgId))) return false;
  const [p] = await db.select({ done: orgProfile.onboardedAt }).from(orgProfile).where(eq(orgProfile.orgId, orgId));
  return Boolean(p) && p!.done === null;
}
```

Los negocios que ya existían no tienen fila en `org_profile`, así que no los afecta.

- [ ] **Step 8: Correr las pruebas**

Run: `pnpm --filter improvement test tests/onboarding.test.ts tests/logo-colors.test.ts tests/brand.test.ts` → Expected: PASS.

- [ ] **Step 9: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/storage/brand.ts apps/improvement/server/registro/onboarding.ts apps/improvement/app/arranque "apps/improvement/app/[org]/page.tsx" apps/improvement/tests/onboarding.test.ts apps/improvement/tests/logo-colors.test.ts
git commit -m "Fase 2 T6: arranque con marca desde el logo y propuesta por giro"
```

---

### Task 7: E2E del recorrido completo y a11y

**Files:**
- Create: `apps/improvement/tests/e2e/registro.spec.ts`
- Modify: `apps/improvement/tests/e2e/a11y.spec.ts`, `apps/improvement/tests/e2e/global-setup.ts` (solo si hace falta limpiar cuentas de prueba)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Leer cómo se crean usuarios en E2E**

Abre `tests/e2e/global-setup.ts`. Si crea usuarios con la Admin API de Supabase, eso es un secreto de pruebas en `.env.test`, no en la app: está permitido ahí y solo ahí. Si el proyecto de pruebas exige confirmar correo, crea el usuario confirmado en el setup y en el spec entra por `/login` en vez de `/registro`, y cubre `/registro` solo con a11y.

- [ ] **Step 2: Escribir el spec**

```ts
// apps/improvement/tests/e2e/registro.spec.ts
import { expect, test } from "@playwright/test";

test("WHEN alguien nuevo se registra y termina el arranque THE SYSTEM SHALL dejarlo en su inicio con las apps de su giro", async ({ page }) => {
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("prueba-segura-123");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/arranque$/);
  await page.getByLabel("Tu nombre").fill("Ana Prueba");
  await page.getByLabel("Nombre del negocio").fill("Clínica E2E");
  await page.getByLabel("Giro").selectOption("salud");
  await page.getByLabel("¿Cuántos son?").selectOption("2-5");
  await page.getByLabel("Ciudad").fill("Monterrey");
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page).toHaveURL(/\/marca$/);
  await page.getByRole("link", { name: "Saltar este paso" }).click();
  await expect(page.getByText("Pacientes")).toBeVisible();
  await page.getByRole("button", { name: "Armar mi Improvement" }).click();
  const nav = page.getByRole("navigation", { name: "Aplicaciones" });
  await expect(nav.getByRole("link", { name: "Pacientes" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Citas" })).toBeVisible();
});
```

Ajusta las etiquetas "Correo", "Contraseña" y "Crear cuenta" a las que dejó `RegistroForm.tsx` en T5 (deben coincidir; si difieren, cambia el formulario, no la prueba). Limpia la org y el usuario creados en un `test.afterAll` con la misma técnica de limpieza que use `global-setup.ts`.

- [ ] **Step 3: a11y**

Agrega a `a11y.spec.ts`: `/registro`, `/arranque` (con sesión de un usuario sin empresa, si el setup lo permite; si no, solo `/registro`), `/arranque/[org]/propuesta` con el dueño de prueba.

- [ ] **Step 4: Correr E2E**

Run: `pnpm --filter improvement test:e2e`
Expected: PASS (todo el suite; los flaky conocidos se reportan, no se ignoran).

- [ ] **Step 5: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/tests/e2e
git commit -m "Fase 2 T7: E2E del registro y arranque, a11y de las pantallas nuevas"
```

---

## Fuera de esta fase

- Importación de archivos y Drive, mapeo con IA (Fase 3).
- Ajustar la propuesta conversando, visión sobre el logo (D3, D4).
- Tablero inicial por rol (Fase 5); por ahora el inicio de Fase 1.
- Permisos por app custom (D2); vista "reporte"; borrar o archivar apps.
