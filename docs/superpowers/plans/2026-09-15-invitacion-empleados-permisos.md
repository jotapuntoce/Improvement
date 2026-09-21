# Invitación de empleados + permisos por tipo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño de una empresa digital pueda invitar a su gente por enlace, decidir con un
tipo de permiso con nombre qué ve cada quien, y que el empleado se coloque solo llenando un
formulario al aceptar.

**Architecture:** Una tabla nueva `permission_type` guarda, por empresa, un mapa `sección → alcance`
(`empresa` / `area` / `propio` / `ninguno`). `membership` apunta a un tipo y guarda el área y el
puesto. El alcance se hace valer en tres capas: `resolveSection()` en el guard (404 si es `ninguno`),
el loader filtrando con el alcance que el guard le devuelve, y políticas RLS que leen el mismo mapa
desde Postgres. La invitación es una fila con el SHA-256 del token, de un solo uso, y la aceptación
crea usuario + perfil + membresía en una transacción.

**Tech Stack:** Next.js 16 App Router (Server Components), TypeScript 6, Drizzle ORM sobre Postgres
(Supabase), Supabase Auth (`signUp` con llave anon), zod v4, Vitest contra el proyecto Supabase real.

**Spec:** `docs/superpowers/specs/2026-09-15-invitacion-empleados-permisos-design.md`

## Global Constraints

Copiadas de `CLAUDE.md` y `.claude/rules/`. Aplican a **todas** las tareas:

- **Imports relativos con extensión explícita:** `./sections.ts`, nunca `./sections`.
- **Alias `@/` → raíz de la app** en `apps/improvement/app/**`. Sin `../../..`.
- **Server Components por default.** `"use client"` solo en la hoja que necesita estado o eventos.
- **Sin barrel files.** Importa del módulo real.
- **Valida en el borde con zod v4** (`z.uuid()`, `z.email()` — formas de v4, ya usadas en
  `server/kpis/sources.ts`).
- **Errores como resultados tipados:** `{ ok: true, data } | { ok: false, error: { code, message } }`.
- **RLS + guard siempre juntos.** Ninguna query nueva confía solo en uno.
- **404, nunca 403**, para lo que el usuario no puede ver.
- **Motor genérico:** nada bajo `packages/db/**` ni `apps/*/server/**` referencia una empresa, un
  empleado o un org por id o nombre literal.
- **`SUPABASE_SERVICE_ROLE_KEY` no existe en `apps/improvement`.** El alta del empleado va por
  `supabase.auth.signUp()` con la llave anon.
- **Sin hex nuevo fuera de `packages/ui/src/tokens.css`.**
- **Nunca editar a mano un archivo de `packages/db/migrations/`** salvo los `--custom`, que se crean
  vacíos a propósito.
- **Gate antes de cerrar cualquier tarea:** `pnpm lint && pnpm typecheck && pnpm test` en verde.

**Prerrequisito a verificar antes de la Tarea 7:** el proyecto de Supabase debe tener *Confirm email*
apagado (Authentication → Providers → Email). Si está encendido, `signUp` no devuelve sesión y el
empleado aterriza en `/login` en vez de entrar directo. Verificarlo antes, no descubrirlo después.

---

## Estructura de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `apps/improvement/server/permissions/sections.ts` | Qué secciones existen, qué alcances admite cada una, y `scopeFor()`. Puro, sin base de datos. |
| `apps/improvement/server/permissions/mutations.ts` | Alta/edición/borrado de tipos de permiso. Solo dueño. |
| `apps/improvement/server/permissions/loadSections.ts` | Las secciones visibles para una persona, ya renombradas por el dueño. |
| `apps/improvement/server/areas/mutations.ts` | Alta/renombre/borrado de áreas. Solo dueño. |
| `apps/improvement/server/invitations/mutations.ts` | Crear y aceptar invitaciones. |
| `apps/improvement/server/invitations/loadInvitations.ts` | Invitaciones vivas de una empresa + resolver un token. |
| `apps/improvement/server/employees/teammates.ts` | Compañeros visibles según alcance (nunca `responsibility_level`). |
| `apps/improvement/app/[org]/equipo/permisos/page.tsx` | Los tipos de permiso de la empresa. |
| `apps/improvement/app/[org]/equipo/invitar/page.tsx` | Generar el enlace de invitación. |
| `apps/improvement/app/[org]/equipo/invitar/InviteLink.tsx` | `"use client"` — botón de copiar el enlace. |
| `apps/improvement/app/invitacion/[token]/page.tsx` | Pantalla de aceptación (valida el token). |
| `apps/improvement/app/invitacion/[token]/AcceptForm.tsx` | `"use client"` — `signUp` + cookie + llamada a la acción. |
| `apps/improvement/tests/permissions.test.ts` | Alcances puros, guard y RLS. |
| `apps/improvement/tests/invitations.test.ts` | Token de un solo uso, vencimiento, transacción. |

**Modificar:**

| Archivo | Cambio |
|---|---|
| `packages/db/src/schema.ts` | Tabla `permission_type`; columnas nuevas en `membership`, `profile`, `invitation`, `organization`. |
| `apps/improvement/server/auth/guard.ts` | `getSessionUser()`, `findOwnerMembership()`, `resolveSection()`, `requireSection()`. |
| `apps/improvement/server/kpis/mutations.ts` | Su `requireOwner()` local pasa a usar `findOwnerMembership()`. |
| `apps/improvement/server/objectives/mutations.ts` | `listObjectives` filtra por alcance. |
| `apps/improvement/server/clients/mutations.ts` | `listClients` respeta `ninguno`. |
| `apps/improvement/app/[org]/dashboard/DashboardNav.tsx` | Dibuja solo las secciones permitidas, con el nombre del dueño. |
| `apps/improvement/app/[org]/equipo/page.tsx` | Botón Invitar, invitaciones vivas, alcance `area`. |
| `apps/improvement/app/[org]/objetivos/page.tsx`, `clientes/page.tsx`, `mapa/page.tsx`, `powerups/page.tsx` | `requireSection()` en vez de `requireOrgMembership()`. |
| `apps/improvement/app/empresas/configuracion/page.tsx` | Bloques de Áreas y de Nombres de secciones. |

---

### Task 1: Esquema, migraciones y políticas RLS

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create (generado): `packages/db/migrations/00XX_<nombre-aleatorio>.sql`
- Create (custom): `packages/db/migrations/00XX_permission_type_rls.sql`
- Test: `apps/improvement/tests/permissions.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `permissionType` (`id`, `orgId`, `name`, `grants`, `createdAt`, `updatedAt`);
  `membership.permissionTypeId`, `membership.areaId`, `membership.jobTitle`,
  `membership.responsibilities`; `profile.phone`; `invitation.permissionTypeId`;
  `organization.sectionLabels`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `apps/improvement/tests/permissions.test.ts`. Prueba la política RLS *de verdad*: simulando el
rol `authenticated` con el JWT del empleado, igual que `tests/auth/guard.test.ts`.

```ts
// Permisos por tipo: qué ve cada empleado. Las pruebas de RLS simulan el rol `authenticated` con el
// JWT de la persona, porque el cliente `db` normal conecta con el rol postgres y bypasea RLS — una
// prueba que no lo haga estaría probando nada (mismo patrón que tests/auth/guard.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, organization, permissionType, profile } from "@jotapuntoce/db/schema";

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(sql`${profile.id} = ${userId}`);
  }
});

async function newOrg(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);
  return org;
}

async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`,
    );
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

describe("RLS — objective por tipo de permiso", () => {
  it(
    "WHEN un empleado con alcance `area` consulta objetivos vía RLS THE SYSTEM SHALL devolver solo " +
      "los de su área — los de otra área no salen ni pidiéndolos por id",
    async () => {
      const org = await newOrg("Test Org Permisos");

      const [areaSuya] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Construcción", color: "#f59e0b" })
        .returning();
      const [areaAjena] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Ventas", color: "#22d3ee" })
        .returning();
      if (!areaSuya || !areaAjena) throw new Error("insert de area no devolvió fila");

      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Jefe de obra", grants: { objetivos: "area" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const employeeId = crypto.randomUUID();
      await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
      createdProfileIds.push(employeeId);
      await db.insert(membership).values({
        userId: employeeId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        areaId: areaSuya.id,
        acceptedAt: new Date(),
      });

      await db.insert(objective).values([
        { orgId: org.id, areaId: areaSuya.id, title: "Colado de losa", impactWeight: 50, dueDate: new Date() },
        { orgId: org.id, areaId: areaAjena.id, title: "Cerrar venta", impactWeight: 50, dueDate: new Date() },
      ]);

      const rows = await asUser<{ title: string }>(
        employeeId,
        `select title from objective where org_id = '${org.id}'`,
      );

      expect(rows.map((r) => r.title)).toEqual(["Colado de losa"]);
    },
  );

  it(
    "WHEN un miembro no tiene tipo de permiso asignado THE SYSTEM SHALL no devolverle ningún " +
      "objetivo — sin tipo no se ve nada, el default niega",
    async () => {
      const org = await newOrg("Test Org Sin Tipo");
      const employeeId = crypto.randomUUID();
      await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
      createdProfileIds.push(employeeId);
      await db
        .insert(membership)
        .values({ userId: employeeId, orgId: org.id, role: "employee", acceptedAt: new Date() });

      await db
        .insert(objective)
        .values({ orgId: org.id, title: "Invisible", impactWeight: 10, dueDate: new Date() });

      const rows = await asUser(employeeId, `select title from objective where org_id = '${org.id}'`);
      expect(rows.length).toBe(0);
    },
  );

  it("WHEN quien consulta es el dueño THE SYSTEM SHALL devolverle todo, sin tipo de permiso", async () => {
    const org = await newOrg("Test Org Dueno");
    const ownerId = crypto.randomUUID();
    await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
    createdProfileIds.push(ownerId);
    await db
      .insert(membership)
      .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

    await db.insert(objective).values([
      { orgId: org.id, title: "Uno", impactWeight: 10, dueDate: new Date() },
      { orgId: org.id, title: "Dos", impactWeight: 10, dueDate: new Date() },
    ]);

    const rows = await asUser(ownerId, `select title from objective where org_id = '${org.id}'`);
    expect(rows.length).toBe(2);
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: FAIL — `permissionType` no existe como export de `@jotapuntoce/db/schema`.

- [ ] **Step 3: Agregar la tabla y las columnas al esquema**

En `packages/db/src/schema.ts`, después de `organization` y antes de `membership`:

```ts
/**
 * Un tipo de permiso con nombre, de UNA empresa. El dueño los crea con los nombres de su propio
 * organigrama ("Jefe de obra", "Vendedor"); Improvement no trae ninguno de fábrica — los papeles de
 * un negocio son datos del cliente, no una rama de código (.claude/rules/motor-generico.md).
 */
export const permissionType = pgTable(
  "permission_type",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Mapa sección -> alcance, ej. {"objetivos":"area","clientes":"ninguno"}. Una sección AUSENTE se
    // lee como "ninguno": el default niega, nunca concede (server/permissions/sections.ts).
    grants: jsonb("grants").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_permission_type_org_id").on(t.orgId),
    uniqueIndex("uq_permission_type_org_name").on(t.orgId, t.name),
  ],
);
```

En `membership`, agregar dentro del objeto de columnas:

```ts
    // El tipo de permiso vive en membership y no en profile porque la misma persona puede estar en
    // dos empresas del mismo dueño con papeles distintos. null = no ve NADA (el default niega).
    permissionTypeId: uuid("permission_type_id").references(() => permissionType.id, {
      onDelete: "set null",
    }),
    areaId: uuid("area_id").references(() => area.id, { onDelete: "set null" }),
    jobTitle: text("job_title"),
    responsibilities: text("responsibilities"),
```

En `profile`, después de `avatarPath`:

```ts
    // Se captura cuando el empleado acepta su invitación — el único momento en que se le pregunta.
    phone: text("phone"),
```

En `invitation`, dentro del objeto de columnas:

```ts
    permissionTypeId: uuid("permission_type_id").references(() => permissionType.id, {
      onDelete: "cascade",
    }),
```

En `organization`, después de `industry`:

```ts
    // Cómo llama el dueño a cada sección de SU empresa digital, y cuáles apagó:
    // {"clientes":{"label":"Obras"},"powerups":{"hidden":true}}. Una columna y no una tabla: son
    // cinco llaves por empresa que solo se leen completas, nunca se consultan ni se ordenan.
    sectionLabels: jsonb("section_labels").notNull().default(sql`'{}'::jsonb`),
```

- [ ] **Step 4: Generar la migración**

Run: `pnpm db:generate`
Expected: exit 0, un archivo nuevo en `packages/db/migrations/`. **No editarlo a mano.**

- [ ] **Step 5: Crear la migración custom de RLS**

Run: `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name permission_type_rls`

Llenar el archivo vacío que generó:

```sql
-- RLS de permission_type (tabla org-scoped nueva) y reemplazo de las políticas de objective y
-- client, que ahora dependen del tipo de permiso del miembro.
--
-- DROP y no una segunda política: dos policies de SELECT sobre la misma tabla se SUMAN con OR, así
-- que dejar la de 0001 (membresía simple) volvería a abrir todo y la nueva no filtraría nada.

alter table permission_type enable row level security;
create policy "org members read their org's permission types"
  on permission_type for select
  using (exists (
    select 1 from membership m
    where m.org_id = permission_type.org_id and m.user_id = auth.uid()
  ));
grant select on permission_type to authenticated;

-- left join y no join: sin tipo asignado, pt es null, ninguna rama se cumple y la política niega —
-- que es exactamente la regla de negar por defecto, escrita en SQL.
drop policy "org members read their org's objectives" on objective;
create policy "members read objectives their permission type allows"
  on objective for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id
    where m.org_id = objective.org_id
      and m.user_id = auth.uid()
      and (
        m.role = 'owner'
        or pt.grants->>'objetivos' = 'empresa'
        or (pt.grants->>'objetivos' = 'area'   and objective.area_id = m.area_id)
        or (pt.grants->>'objetivos' = 'propio' and objective.assigned_employee_id = auth.uid())
      )
  ));

drop policy "org members read their org's clients" on client;
create policy "members read clients their permission type allows"
  on client for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id
    where m.org_id = client.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')
  ));
```

- [ ] **Step 6: Aplicar las migraciones**

Run: `pnpm db:migrate`
Expected: exit 0. Requiere `DATABASE_URL_DIRECT` real en `.env.local` — nunca el pooler.

- [ ] **Step 7: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: PASS, 3 pruebas.

- [ ] **Step 8: Gate y commit**

```bash
pnpm lint && pnpm typecheck
git add packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/permissions.test.ts
git commit -m "feat(db): permission_type, columnas de permiso en membership y RLS por alcance"
```

---

### Task 2: `sections.ts` — qué secciones hay y qué alcance aplica

**Files:**
- Create: `apps/improvement/server/permissions/sections.ts`
- Test: `apps/improvement/tests/permissions.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: nada (módulo puro, sin base de datos).
- Produces: `SECTION_SLUGS`, `SectionSlug`, `SCOPES`, `Scope`, `SECTIONS: Section[]`,
  `sectionBySlug(slug): Section | undefined`, `grantsSchema`, `Grants`,
  `scopeFor(role: string, grants: unknown, section: SectionSlug): Scope`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar al final de `apps/improvement/tests/permissions.test.ts`:

```ts
import { grantsSchema, scopeFor } from "../server/permissions/sections.ts";

describe("scopeFor", () => {
  it("WHEN el miembro es dueño THE SYSTEM SHALL darle `empresa` en toda sección, aun sin tipo", () => {
    expect(scopeFor("owner", null, "objetivos")).toBe("empresa");
    expect(scopeFor("owner", { objetivos: "ninguno" }, "objetivos")).toBe("empresa");
  });

  it("WHEN el miembro no tiene tipo THE SYSTEM SHALL devolver `ninguno`", () => {
    expect(scopeFor("employee", null, "objetivos")).toBe("ninguno");
  });

  it("WHEN el mapa no menciona la sección THE SYSTEM SHALL devolver `ninguno`, no `empresa`", () => {
    expect(scopeFor("employee", { objetivos: "empresa" }, "clientes")).toBe("ninguno");
  });

  it("WHEN el mapa concede un alcance THE SYSTEM SHALL devolverlo tal cual", () => {
    expect(scopeFor("employee", { objetivos: "area" }, "objetivos")).toBe("area");
  });
});

describe("grantsSchema", () => {
  it(
    "WHEN se guarda un alcance que esa sección no sabe filtrar THE SYSTEM SHALL rechazarlo al " +
      "guardar — `clientes` no tiene área ni responsable de quien colgarse",
    () => {
      expect(grantsSchema.safeParse({ clientes: "propio" }).success).toBe(false);
      expect(grantsSchema.safeParse({ objetivos: "propio" }).success).toBe(true);
    },
  );

  it("WHEN el mapa trae una sección que no existe THE SYSTEM SHALL ignorarla, no lanzar", () => {
    const parsed = grantsSchema.safeParse({ inventada: "empresa", objetivos: "area" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.objetivos).toBe("area");
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: FAIL — no existe `../server/permissions/sections.ts`.

- [ ] **Step 3: Escribir el módulo**

Crear `apps/improvement/server/permissions/sections.ts`:

```ts
// Qué secciones tiene una empresa digital y qué alcance puede tener cada una. Módulo PURO: no toca
// base de datos, para que la regla de "quién ve qué" se pueda probar sin una empresa de por medio.
//
// Cuáles secciones existen sí es código y no dato: cada una es una pantalla real con su ruta. Lo que
// el dueño personaliza es cómo se llaman y cuáles apaga (organization.section_labels), no inventar
// pantallas nuevas.
import { z } from "zod";

export const SCOPES = ["empresa", "area", "propio", "ninguno"] as const;
export type Scope = (typeof SCOPES)[number];

export const SECTION_SLUGS = ["mapa", "objetivos", "equipo", "clientes", "powerups"] as const;
export type SectionSlug = (typeof SECTION_SLUGS)[number];

export interface Section {
  slug: SectionSlug;
  /** Nombre por defecto. El dueño lo puede cambiar en organization.section_labels. */
  label: string;
  hint: string;
  /** Alcances que esta sección SABE filtrar. "ninguno" siempre vale y no se lista aquí. */
  scopes: Exclude<Scope, "ninguno">[];
}

// `planos` NO está en esta lista aunque la ruta exista: es herramienta de Jose Carlos, cerrada por su
// propio guard de platform admin. Ningún tipo de permiso puede abrirla.
export const SECTIONS: Section[] = [
  { slug: "mapa", label: "Mapa de Construcción", hint: "En qué etapa va tu empresa digital", scopes: ["empresa"] },
  { slug: "objetivos", label: "Objetivos", hint: "Las metas del equipo y sus puntos", scopes: ["empresa", "area", "propio"] },
  { slug: "equipo", label: "Equipo", hint: "Quién trabaja contigo", scopes: ["empresa", "area"] },
  { slug: "clientes", label: "Clientes", hint: "Tu cartera y cómo va cada cuenta", scopes: ["empresa"] },
  { slug: "powerups", label: "PowerUps", hint: "Canjea los puntos que acumula tu equipo", scopes: ["empresa"] },
];

export function sectionBySlug(slug: string): Section | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}

/**
 * La llave se valida como string suelto y no como enum: en zod v4 un `z.record` con llave enum exige
 * que estén TODAS las llaves, y este mapa es parcial por diseño (lo que falta se niega). Las
 * secciones desconocidas se ignoran al leer, así que una fila vieja nunca rompe la pantalla.
 */
export const grantsSchema = z
  .record(z.string(), z.enum(SCOPES))
  .refine(
    (grants) =>
      Object.entries(grants).every(([slug, scope]) => {
        const section = sectionBySlug(slug);
        if (!section) return true;
        return scope === "ninguno" || section.scopes.includes(scope as Exclude<Scope, "ninguno">);
      }),
    { message: "Ese alcance no existe para esa sección." },
  );

export type Grants = z.infer<typeof grantsSchema>;

/**
 * WHEN quien pregunta es el dueño THE SYSTEM SHALL conceder `empresa` siempre, aunque tenga un tipo
 * asignado que diga otra cosa. WHEN no hay tipo, o el mapa no menciona la sección, THE SYSTEM SHALL
 * devolver `ninguno` — las dos reglas que Jose Carlos puso como no negociables.
 */
export function scopeFor(role: string, grants: unknown, section: SectionSlug): Scope {
  if (role === "owner") return "empresa";
  const parsed = grantsSchema.safeParse(grants ?? {});
  if (!parsed.success) return "ninguno";
  return (parsed.data[section] as Scope | undefined) ?? "ninguno";
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: PASS, 9 pruebas.

- [ ] **Step 5: Gate y commit**

```bash
pnpm lint && pnpm typecheck
git add apps/improvement/server/permissions/sections.ts apps/improvement/tests/permissions.test.ts
git commit -m "feat(improvement): secciones y alcances de permiso, con el default que niega"
```

---

### Task 3: `resolveSection()` y `requireSection()` en el guard

**Files:**
- Modify: `apps/improvement/server/auth/guard.ts`
- Test: `apps/improvement/tests/permissions.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: `scopeFor`, `SectionSlug` de `../permissions/sections.ts`; `assertMembership`,
  `getSessionUserId` (ya existen en el mismo archivo).
- Produces:
  - `resolveSection(userId: string, orgId: string, section: SectionSlug): Promise<{ membership: typeof membership.$inferSelect; scope: Scope }>` — 404 si no es miembro; **no** lanza por `ninguno`.
  - `requireSection(orgId: string, section: SectionSlug)` — misma forma, pero resuelve la sesión de la cookie y hace `notFound()` cuando el alcance es `ninguno`.
  - `findOwnerMembership(userId: string, orgId: string)` — la fila si es dueño, `null` si es miembro pero no dueño, 404 si no es miembro.
  - `getSessionUser(): Promise<{ id: string; email: string } | null>`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `apps/improvement/tests/permissions.test.ts`:

```ts
import { resolveSection } from "../server/auth/guard.ts";

describe("resolveSection", () => {
  it(
    "WHEN el miembro tiene un tipo con alcance `area` THE SYSTEM SHALL devolver ese alcance junto " +
      "con su membresía — el loader nunca adivina el alcance, se lo dan",
    async () => {
      const org = await newOrg("Test Org Resolve");
      const [areaSuya] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Postventa", color: "#10b981" })
        .returning();
      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Postventa", grants: { objetivos: "area", clientes: "ninguno" } })
        .returning();
      if (!areaSuya || !tipo) throw new Error("insert no devolvió fila");

      const employeeId = crypto.randomUUID();
      await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
      createdProfileIds.push(employeeId);
      await db.insert(membership).values({
        userId: employeeId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        areaId: areaSuya.id,
        acceptedAt: new Date(),
      });

      const objetivos = await resolveSection(employeeId, org.id, "objetivos");
      expect(objetivos.scope).toBe("area");
      expect(objetivos.membership.areaId).toBe(areaSuya.id);

      const clientes = await resolveSection(employeeId, org.id, "clientes");
      expect(clientes.scope).toBe("ninguno");
    },
  );

  it("WHEN el miembro es dueño THE SYSTEM SHALL devolver `empresa` sin consultar ningún tipo", async () => {
    const org = await newOrg("Test Org Resolve Dueno");
    const ownerId = crypto.randomUUID();
    await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
    createdProfileIds.push(ownerId);
    await db
      .insert(membership)
      .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

    const { scope } = await resolveSection(ownerId, org.id, "clientes");
    expect(scope).toBe("empresa");
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: FAIL — `resolveSection` no está exportado por `guard.ts`.

- [ ] **Step 3: Agregar las funciones al guard**

En `apps/improvement/server/auth/guard.ts`, agregar el import de `permissionType` a la línea de
schema existente (`import { membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";`),
el import `import { scopeFor, type Scope, type SectionSlug } from "../permissions/sections.ts";`, y al
final del archivo:

```ts
/**
 * El usuario de la sesión con su correo — lo necesita la aceptación de invitación, que tiene que
 * comprobar que quien acaba de registrarse es el correo al que el dueño invitó, y no otro.
 */
export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const accessToken = await getSessionAccessToken();
  if (!accessToken) return null;

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

/** La fila si es dueño; null si es miembro pero no dueño. 404 si no es miembro (assertMembership). */
export async function findOwnerMembership(userId: string, orgId: string) {
  const row = await assertMembership(userId, orgId);
  return row.role === "owner" ? row : null;
}

/**
 * El alcance de una persona en una sección, junto con su membresía. Devuelve `ninguno` sin lanzar:
 * el menú necesita saberlo para NO dibujar la sección, y una ruta que lanzara aquí impediría eso.
 * Quien protege una ruta usa requireSection().
 */
export async function resolveSection(
  userId: string,
  orgId: string,
  section: SectionSlug,
): Promise<{ membership: Awaited<ReturnType<typeof assertMembership>>; scope: Scope }> {
  const row = await assertMembership(userId, orgId);
  if (row.role === "owner") return { membership: row, scope: "empresa" };
  if (!row.permissionTypeId) return { membership: row, scope: "ninguno" };

  const [type] = await db
    .select({ grants: permissionType.grants })
    .from(permissionType)
    .where(eq(permissionType.id, row.permissionTypeId))
    .limit(1);

  return { membership: row, scope: scopeFor(row.role, type?.grants ?? null, section) };
}

/**
 * WHEN el tipo de permiso de la persona no concede esta sección THE SYSTEM SHALL responder 404,
 * nunca 403 — mismo criterio que requireOrgMembership: un 403 le confirma que la sección existe.
 */
export async function requireSection(orgId: string, section: SectionSlug) {
  const row = await requireOrgMembership(orgId);
  const resolved = await resolveSection(row.userId, orgId, section);
  if (resolved.scope === "ninguno") notFound();
  return resolved;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: PASS, 11 pruebas.

- [ ] **Step 5: Dejar que `kpis/mutations.ts` use el helper compartido**

En `apps/improvement/server/kpis/mutations.ts`, reemplazar el cuerpo de su `requireOwner` local:

```ts
import { findOwnerMembership } from "../auth/guard.ts";

/** 404 si no es miembro (findOwnerMembership), error tipado si es miembro pero no dueño. */
async function requireOwner(userId: string, orgId: string): Promise<Result<true>> {
  const row = await findOwnerMembership(userId, orgId);
  if (!row) return fail("Solo el dueño configura los indicadores.", "FORBIDDEN");
  return { ok: true, data: true };
}
```

Borrar el import de `assertMembership` si queda sin uso.

- [ ] **Step 6: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/auth/guard.ts apps/improvement/server/kpis/mutations.ts apps/improvement/tests/permissions.test.ts
git commit -m "feat(improvement): requireSection y resolveSection en el guard"
```

---

### Task 4: Áreas — el dueño las crea

**Files:**
- Create: `apps/improvement/server/areas/mutations.ts`
- Modify: `apps/improvement/app/empresas/configuracion/page.tsx`
- Modify: `apps/improvement/app/globals.css`
- Test: `apps/improvement/tests/areas.test.ts`

**Interfaces:**
- Consumes: `findOwnerMembership` (Task 3); `listAreasByOrg` de `../areas/listAreas.ts` (ya existe).
- Produces: `createArea(userId, orgId, name, color): Promise<Result<string>>`,
  `renameArea(userId, orgId, areaId, name): Promise<Result<true>>`,
  `removeArea(userId, orgId, areaId): Promise<Result<true>>`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `apps/improvement/tests/areas.test.ts`:

```ts
// Las áreas de la empresa las crea el dueño. Existe porque el formulario de invitación le pide al
// empleado elegir su área de esta lista — sin esta pantalla, la lista siempre está vacía.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, organization, profile } from "@jotapuntoce/db/schema";
import { createArea, removeArea, renameArea } from "../server/areas/mutations.ts";

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(sql`${profile.id} = ${userId}`);
  }
});

async function orgConDueno(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);

  const ownerId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();
  await db.insert(profile).values([
    { id: ownerId, email: `${ownerId}@example.com` },
    { id: employeeId, email: `${employeeId}@example.com` },
  ]);
  createdProfileIds.push(ownerId, employeeId);
  await db.insert(membership).values([
    { userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() },
    { userId: employeeId, orgId: org.id, role: "employee", acceptedAt: new Date() },
  ]);

  return { org, ownerId, employeeId };
}

describe("createArea", () => {
  it("WHEN el dueño crea un área THE SYSTEM SHALL guardarla en su empresa", async () => {
    const { org, ownerId } = await orgConDueno("Test Org Areas");
    const result = await createArea(ownerId, org.id, "Construcción", "#f59e0b");
    expect(result.ok).toBe(true);

    const rows = await db.select().from(area).where(sql`${area.orgId} = ${org.id}`);
    expect(rows.map((r) => r.name)).toEqual(["Construcción"]);
  });

  it("WHEN quien la crea es un empleado THE SYSTEM SHALL rechazarlo — el organigrama es del dueño", async () => {
    const { org, employeeId } = await orgConDueno("Test Org Areas Empleado");
    const result = await createArea(employeeId, org.id, "Inventada", "#f59e0b");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
  });

  it("WHEN el nombre viene vacío THE SYSTEM SHALL rechazarlo", async () => {
    const { org, ownerId } = await orgConDueno("Test Org Areas Vacio");
    expect((await createArea(ownerId, org.id, "   ", "#f59e0b")).ok).toBe(false);
  });
});

describe("removeArea", () => {
  it(
    "WHEN el área todavía tiene objetivos colgando THE SYSTEM SHALL negarse a borrarla — borrarla " +
      "dejaría esos objetivos sin área y fuera del alcance de quien los trabaja",
    async () => {
      const { org, ownerId } = await orgConDueno("Test Org Areas Ocupada");
      const created = await createArea(ownerId, org.id, "Ventas", "#22d3ee");
      if (!created.ok) throw new Error("createArea falló");

      await db.insert(objective).values({
        orgId: org.id,
        areaId: created.data,
        title: "Cerrar venta",
        impactWeight: 50,
        dueDate: new Date(),
      });

      const result = await removeArea(ownerId, org.id, created.data);
      expect(result.ok).toBe(false);
    },
  );
});

describe("renameArea", () => {
  it("WHEN el dueño renombra un área de OTRA empresa THE SYSTEM SHALL no tocarla", async () => {
    const a = await orgConDueno("Test Org Areas A");
    const b = await orgConDueno("Test Org Areas B");
    const creada = await createArea(b.ownerId, b.org.id, "Obra", "#f59e0b");
    if (!creada.ok) throw new Error("createArea falló");

    const result = await renameArea(a.ownerId, a.org.id, creada.data, "Secuestrada");
    expect(result.ok).toBe(false);

    const [row] = await db.select().from(area).where(sql`${area.id} = ${creada.data}`);
    expect(row?.name).toBe("Obra");
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/areas.test.ts`
Expected: FAIL — no existe `../server/areas/mutations.ts`.

- [ ] **Step 3: Escribir el módulo**

Crear `apps/improvement/server/areas/mutations.ts`:

```ts
// El dueño arma las áreas de SU empresa. Solo el dueño: el organigrama es una decisión de quien
// dirige, y el área de cada empleado es lo que después decide qué ve (alcance `area`).
import { and, count, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

// Los colores que el panel ya sabe dibujar. No es un hex libre: un color arbitrario rompe el
// contraste del mapa y de las tarjetas (.claude/rules/tokens-de-diseno.md).
const COLORES = ["#7c5cff", "#22d3ee", "#f59e0b", "#10b981", "#f87171"];

export async function createArea(
  userId: string,
  orgId: string,
  name: string,
  color: string,
): Promise<Result<string>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define las áreas.", "FORBIDDEN");
  }

  const nombre = name.trim();
  if (!nombre) return fail("El área necesita un nombre.");
  const tono = COLORES.includes(color) ? color : COLORES[0]!;

  const [row] = await db.insert(area).values({ orgId, name: nombre, color: tono }).returning({ id: area.id });
  return row ? { ok: true, data: row.id } : fail("No se pudo crear el área.", "NOT_FOUND");
}

export async function renameArea(
  userId: string,
  orgId: string,
  areaId: string,
  name: string,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define las áreas.", "FORBIDDEN");
  }

  const nombre = name.trim();
  if (!nombre) return fail("El área necesita un nombre.");

  // orgId en el where y no solo el id: sin él, el id de un área de otra empresa sería editable por
  // quien fuera dueño de cualquier org (mismo criterio que server/kpis/mutations.ts).
  const [row] = await db
    .update(area)
    .set({ name: nombre })
    .where(and(eq(area.id, areaId), eq(area.orgId, orgId)))
    .returning({ id: area.id });

  return row ? { ok: true, data: true } : fail("Esa área no existe.", "NOT_FOUND");
}

/**
 * WHEN el área todavía tiene gente u objetivos THE SYSTEM SHALL negarse — la FK los dejaría en null
 * en silencio, y un empleado sin área con alcance `area` deja de ver su propio trabajo.
 */
export async function removeArea(userId: string, orgId: string, areaId: string): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define las áreas.", "FORBIDDEN");
  }

  const [objetivos] = await db.select({ value: count() }).from(objective).where(eq(objective.areaId, areaId));
  if ((objetivos?.value ?? 0) > 0) {
    return fail("Esa área todavía tiene objetivos. Muévelos antes de borrarla.");
  }

  const [gente] = await db.select({ value: count() }).from(membership).where(eq(membership.areaId, areaId));
  if ((gente?.value ?? 0) > 0) {
    return fail("Esa área todavía tiene gente. Cámbialos de área antes de borrarla.");
  }

  const [row] = await db
    .delete(area)
    .where(and(eq(area.id, areaId), eq(area.orgId, orgId)))
    .returning({ id: area.id });

  return row ? { ok: true, data: true } : fail("Esa área no existe.", "NOT_FOUND");
}

export { COLORES as AREA_COLORS };
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/areas.test.ts`
Expected: PASS, 5 pruebas.

- [ ] **Step 5: Agregar el bloque de Áreas a la configuración del dueño**

En `apps/improvement/app/empresas/configuracion/page.tsx`, agregar los imports:

```ts
import { AREA_COLORS, createArea, removeArea, renameArea } from "@/server/areas/mutations.ts";
```

Agregar las Server Actions junto a las que ya existen ahí:

```ts
async function agregarArea(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  if (!orgId) return;
  await createArea(
    id,
    orgId,
    formData.get("name")?.toString() ?? "",
    formData.get("color")?.toString() ?? AREA_COLORS[0]!,
  );
  revalidatePath("/empresas/configuracion");
}

async function guardarArea(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  const areaId = formData.get("areaId")?.toString();
  if (!orgId || !areaId) return;
  await renameArea(id, orgId, areaId, formData.get("name")?.toString() ?? "");
  revalidatePath("/empresas/configuracion");
}

async function borrarArea(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  const areaId = formData.get("areaId")?.toString();
  if (!orgId || !areaId) return;
  await removeArea(id, orgId, areaId);
  revalidatePath("/empresas/configuracion");
}
```

Dentro del bloque que ya recorre las empresas (el mismo que dibuja "Qué mide {name}"), agregar
después de la lista de indicadores, usando el `areas` que la página ya carga con `listAreasByOrg`:

```tsx
<section className="config-section">
  <h3 className="config-subtitle">Las áreas de {company.name}</h3>
  <p className="config-hint">
    Cada persona que invites elige una de estas al entrar. Son también las que filtran tus
    indicadores y lo que cada quien puede ver.
  </p>

  {areas.map((areaOption) => (
    <div key={areaOption.id} className="config-area-row">
      <form action={guardarArea} className="config-area-form">
        <input type="hidden" name="orgId" value={company.orgId ?? ""} />
        <input type="hidden" name="areaId" value={areaOption.id} />
        <input name="name" defaultValue={areaOption.name} className="config-input" aria-label="Nombre del área" />
        <button type="submit" className="config-btn">Guardar</button>
      </form>
      <form action={borrarArea}>
        <input type="hidden" name="orgId" value={company.orgId ?? ""} />
        <input type="hidden" name="areaId" value={areaOption.id} />
        <button type="submit" className="config-btn config-btn--danger">Borrar</button>
      </form>
    </div>
  ))}

  <form action={agregarArea} className="config-area-form">
    <input type="hidden" name="orgId" value={company.orgId ?? ""} />
    <input name="name" placeholder="Nombre del área nueva" className="config-input" required />
    <select name="color" className="config-input" aria-label="Color del área">
      {AREA_COLORS.map((color) => (
        <option key={color} value={color}>{color}</option>
      ))}
    </select>
    <button type="submit" className="config-btn">Agregar área</button>
  </form>
</section>
```

- [ ] **Step 6: Agregar el CSS**

Al final de `apps/improvement/app/globals.css`:

```css
/* Áreas en la configuración del dueño — misma fila de campo + botones que .config-kpi-row. */
.config-area-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.config-area-form {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  flex: 1;
}

.config-btn--danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
}
```

- [ ] **Step 7: Verificar a mano**

Run: `pnpm dev:improvement` y abrir http://localhost:3200/empresas/configuracion
Expected: el bloque de áreas aparece bajo los indicadores de cada empresa; crear, renombrar y borrar
funcionan; borrar una con objetivos no hace nada (el error se ve en la Tarea 9, cuando la página
muestre mensajes).

- [ ] **Step 8: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/areas/mutations.ts apps/improvement/app/empresas/configuracion/page.tsx apps/improvement/app/globals.css apps/improvement/tests/areas.test.ts
git commit -m "feat(improvement): el dueño crea, renombra y borra las áreas de su empresa"
```

---

### Task 5: Tipos de permiso — el dueño decide qué ve cada puesto

**Files:**
- Create: `apps/improvement/server/permissions/mutations.ts`
- Create: `apps/improvement/app/[org]/equipo/permisos/page.tsx`
- Modify: `apps/improvement/app/globals.css`
- Test: `apps/improvement/tests/permissions.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: `findOwnerMembership` (Task 3); `grantsSchema`, `SECTIONS`, `SCOPES` (Task 2).
- Produces: `listPermissionTypes(orgId): Promise<{ id: string; name: string; grants: Grants }[]>`,
  `createPermissionType(userId, orgId, name, grants): Promise<Result<string>>`,
  `updatePermissionType(userId, orgId, typeId, name, grants): Promise<Result<true>>`,
  `deletePermissionType(userId, orgId, typeId): Promise<Result<true>>`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `apps/improvement/tests/permissions.test.ts`:

```ts
import { createPermissionType, deletePermissionType } from "../server/permissions/mutations.ts";

describe("createPermissionType", () => {
  it("WHEN el dueño crea un tipo THE SYSTEM SHALL guardarlo con su mapa de alcances", async () => {
    const org = await newOrg("Test Org Tipos");
    const ownerId = crypto.randomUUID();
    await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
    createdProfileIds.push(ownerId);
    await db
      .insert(membership)
      .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

    const result = await createPermissionType(ownerId, org.id, "Vendedor", {
      objetivos: "area",
      clientes: "empresa",
    });
    expect(result.ok).toBe(true);
  });

  it(
    "WHEN el mapa trae un alcance que esa sección no filtra THE SYSTEM SHALL rechazarlo antes de " +
      "escribir — una fila inválida haría que scopeFor devuelva `ninguno` sin que nadie sepa por qué",
    async () => {
      const org = await newOrg("Test Org Tipos Invalido");
      const ownerId = crypto.randomUUID();
      await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
      createdProfileIds.push(ownerId);
      await db
        .insert(membership)
        .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

      const result = await createPermissionType(ownerId, org.id, "Imposible", { clientes: "propio" });
      expect(result.ok).toBe(false);
    },
  );
});

describe("deletePermissionType", () => {
  it(
    "WHEN se borra un tipo que alguien tiene asignado THE SYSTEM SHALL dejar a esa persona sin " +
      "tipo, o sea sin ver nada — es el comportamiento seguro, no un accidente",
    async () => {
      const org = await newOrg("Test Org Tipos Borrado");
      const ownerId = crypto.randomUUID();
      const employeeId = crypto.randomUUID();
      await db.insert(profile).values([
        { id: ownerId, email: `${ownerId}@example.com` },
        { id: employeeId, email: `${employeeId}@example.com` },
      ]);
      createdProfileIds.push(ownerId, employeeId);
      await db
        .insert(membership)
        .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

      const creado = await createPermissionType(ownerId, org.id, "Temporal", { objetivos: "empresa" });
      if (!creado.ok) throw new Error("createPermissionType falló");

      await db.insert(membership).values({
        userId: employeeId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: creado.data,
        acceptedAt: new Date(),
      });

      expect((await deletePermissionType(ownerId, org.id, creado.data)).ok).toBe(true);
      const { scope } = await resolveSection(employeeId, org.id, "objetivos");
      expect(scope).toBe("ninguno");
    },
  );
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: FAIL — no existe `../server/permissions/mutations.ts`.

- [ ] **Step 3: Escribir el módulo**

Crear `apps/improvement/server/permissions/mutations.ts`:

```ts
// Los tipos de permiso de una empresa: un nombre del organigrama del cliente + qué ve en cada
// sección. Solo el dueño los toca — es literalmente la definición de quién ve qué.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { permissionType } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { grantsSchema, type Grants } from "./sections.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export interface PermissionTypeRow {
  id: string;
  name: string;
  grants: Grants;
}

export async function listPermissionTypes(orgId: string): Promise<PermissionTypeRow[]> {
  const rows = await db
    .select({ id: permissionType.id, name: permissionType.name, grants: permissionType.grants })
    .from(permissionType)
    .where(eq(permissionType.orgId, orgId))
    .orderBy(asc(permissionType.name));

  // El parse tolera filas viejas: lo que no pasa se lee como mapa vacío, que niega todo. Nunca lanza
  // en una lectura — un tipo corrupto no puede tumbar la pantalla del dueño.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    grants: grantsSchema.safeParse(row.grants).data ?? {},
  }));
}

function validate(name: string, grants: unknown): Result<{ name: string; grants: Grants }> {
  const nombre = name.trim();
  if (!nombre) return fail("El tipo de permiso necesita un nombre.");

  const parsed = grantsSchema.safeParse(grants ?? {});
  if (!parsed.success) return fail("Ese alcance no existe para esa sección.");

  return { ok: true, data: { name: nombre, grants: parsed.data } };
}

export async function createPermissionType(
  userId: string,
  orgId: string,
  name: string,
  grants: unknown,
): Promise<Result<string>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define los permisos.", "FORBIDDEN");
  }

  const checked = validate(name, grants);
  if (!checked.ok) return checked;

  const [row] = await db
    .insert(permissionType)
    .values({ orgId, name: checked.data.name, grants: checked.data.grants })
    .returning({ id: permissionType.id });

  return row ? { ok: true, data: row.id } : fail("No se pudo crear el tipo.", "NOT_FOUND");
}

export async function updatePermissionType(
  userId: string,
  orgId: string,
  typeId: string,
  name: string,
  grants: unknown,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define los permisos.", "FORBIDDEN");
  }

  const checked = validate(name, grants);
  if (!checked.ok) return checked;

  const [row] = await db
    .update(permissionType)
    .set({ name: checked.data.name, grants: checked.data.grants, updatedAt: new Date() })
    .where(and(eq(permissionType.id, typeId), eq(permissionType.orgId, orgId)))
    .returning({ id: permissionType.id });

  return row ? { ok: true, data: true } : fail("Ese tipo no existe.", "NOT_FOUND");
}

/**
 * La FK de membership.permission_type_id es `on delete set null`: quien tenía este tipo queda sin
 * tipo, o sea sin ver nada. Es a propósito — el caso seguro es que deje de ver, no que vea de más.
 */
export async function deletePermissionType(
  userId: string,
  orgId: string,
  typeId: string,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define los permisos.", "FORBIDDEN");
  }

  const [row] = await db
    .delete(permissionType)
    .where(and(eq(permissionType.id, typeId), eq(permissionType.orgId, orgId)))
    .returning({ id: permissionType.id });

  return row ? { ok: true, data: true } : fail("Ese tipo no existe.", "NOT_FOUND");
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: PASS, 14 pruebas.

- [ ] **Step 5: Escribir la pantalla**

Crear `apps/improvement/app/[org]/equipo/permisos/page.tsx`:

```tsx
// Los tipos de permiso de la empresa. Solo dueño — un empleado que llegue por URL recibe 404, no un
// 403 (mismo criterio que todo el resto del guard).
//
// Sin "use client": son <form> nativos con Server Actions, igual que /[org]/clientes.
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgMembership } from "@/server/auth/guard";
import {
  createPermissionType,
  deletePermissionType,
  listPermissionTypes,
  updatePermissionType,
} from "@/server/permissions/mutations";
import { SECTIONS } from "@/server/permissions/sections";

const SCOPE_LABEL: Record<string, string> = {
  empresa: "Toda la empresa",
  area: "Solo su área",
  propio: "Solo lo suyo",
  ninguno: "No lo ve",
};

function readGrants(formData: FormData): Record<string, string> {
  const grants: Record<string, string> = {};
  for (const section of SECTIONS) {
    grants[section.slug] = formData.get(`grant-${section.slug}`)?.toString() ?? "ninguno";
  }
  return grants;
}

export default async function PermisosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const member = await requireOrgMembership(orgId);
  if (member.role !== "owner") notFound();

  const tipos = await listPermissionTypes(orgId);

  async function agregar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    await createPermissionType(row.userId, orgId, formData.get("name")?.toString() ?? "", readGrants(formData));
    revalidatePath(`/${orgId}/equipo/permisos`);
  }

  async function guardar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const typeId = formData.get("typeId")?.toString();
    if (!typeId) return;
    await updatePermissionType(
      row.userId,
      orgId,
      typeId,
      formData.get("name")?.toString() ?? "",
      readGrants(formData),
    );
    revalidatePath(`/${orgId}/equipo/permisos`);
  }

  async function borrar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const typeId = formData.get("typeId")?.toString();
    if (!typeId) return;
    await deletePermissionType(row.userId, orgId, typeId);
    revalidatePath(`/${orgId}/equipo/permisos`);
  }

  return (
    <main className="permisos-page">
      <h1 className="permisos-title">Tipos de permiso</h1>
      <p className="permisos-hint">
        Tú decides qué ve cada puesto de tu empresa. Ponles los nombres que usas de verdad. Tú siempre
        ves todo; quien no tenga un tipo asignado no ve nada.
      </p>

      {tipos.map((tipo) => (
        <form key={tipo.id} action={guardar} className="permiso-card">
          <input type="hidden" name="typeId" value={tipo.id} />
          <input name="name" defaultValue={tipo.name} className="permiso-name" aria-label="Nombre del tipo" />
          <div className="permiso-grid">
            {SECTIONS.map((section) => (
              <label key={section.slug} className="permiso-field">
                <span>{section.label}</span>
                <select name={`grant-${section.slug}`} defaultValue={tipo.grants[section.slug] ?? "ninguno"}>
                  {[...section.scopes, "ninguno"].map((scope) => (
                    <option key={scope} value={scope}>{SCOPE_LABEL[scope]}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="permiso-actions">
            <button type="submit" className="config-btn">Guardar</button>
            <button type="submit" formAction={borrar} className="config-btn config-btn--danger">
              Borrar
            </button>
          </div>
        </form>
      ))}

      <form action={agregar} className="permiso-card permiso-card--new">
        <input name="name" placeholder="Nombre del tipo nuevo (ej. Jefe de obra)" className="permiso-name" required />
        <div className="permiso-grid">
          {SECTIONS.map((section) => (
            <label key={section.slug} className="permiso-field">
              <span>{section.label}</span>
              <select name={`grant-${section.slug}`} defaultValue="ninguno">
                {[...section.scopes, "ninguno"].map((scope) => (
                  <option key={scope} value={scope}>{SCOPE_LABEL[scope]}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button type="submit" className="config-btn">Crear tipo</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Agregar el CSS**

Al final de `apps/improvement/app/globals.css`:

```css
/* Tipos de permiso — una tarjeta por tipo, con su rejilla de sección x alcance. */
.permisos-page {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text-primary);
  padding: 32px 24px;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.permisos-title { font-size: 28px; font-weight: 700; margin: 0; }
.permisos-hint { color: var(--text-secondary); font-size: 14px; margin: 0; }

.permiso-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-md, 16px);
  border: 1px solid var(--border);
  background: var(--bg-card);
}

.permiso-card--new {
  border-style: dashed;
  background: color-mix(in srgb, var(--accent-1) 6%, transparent);
}

.permiso-name {
  padding: 9px 12px;
  border-radius: var(--radius-sm, 10px);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-primary);
  font-weight: 600;
}

.permiso-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.permiso-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }

.permiso-field select {
  padding: 8px 10px;
  border-radius: var(--radius-sm, 10px);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-primary);
}

.permiso-actions { display: flex; gap: 8px; }
```

- [ ] **Step 7: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/permissions/mutations.ts "apps/improvement/app/[org]/equipo/permisos/page.tsx" apps/improvement/app/globals.css apps/improvement/tests/permissions.test.ts
git commit -m "feat(improvement): el dueño crea tipos de permiso con nombre para su empresa"
```

---

### Task 6: Crear la invitación y su enlace

**Files:**
- Create: `apps/improvement/server/invitations/mutations.ts`
- Create: `apps/improvement/server/invitations/loadInvitations.ts`
- Create: `apps/improvement/app/[org]/equipo/invitar/page.tsx`
- Create: `apps/improvement/app/[org]/equipo/invitar/InviteLink.tsx`
- Modify: `apps/improvement/app/[org]/equipo/page.tsx`
- Modify: `apps/improvement/app/globals.css`
- Test: `apps/improvement/tests/invitations.test.ts`

**Interfaces:**
- Consumes: `findOwnerMembership` (Task 3); `listPermissionTypes` (Task 5).
- Produces: `hashToken(token: string): string`,
  `createInvitation(userId, orgId, email, permissionTypeId): Promise<Result<{ token: string; expiresAt: Date }>>`,
  `listLiveInvitations(orgId): Promise<{ id: string; email: string; typeName: string | null; expiresAt: Date }[]>`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `apps/improvement/tests/invitations.test.ts`:

```ts
// Invitaciones: el token vive una vez y solo en el correo de quien lo recibió — en la base queda
// únicamente su hash, así que quien se robe la base no se roba invitaciones usables.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { invitation, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { createInvitation, hashToken } from "../server/invitations/mutations.ts";

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(sql`${profile.id} = ${userId}`);
  }
});

// Sin `export`: la Tarea 7 agrega sus pruebas a ESTE mismo archivo y la usa directo.
async function orgConDuenoYTipo(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);

  const ownerId = crypto.randomUUID();
  await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
  createdProfileIds.push(ownerId);
  await db
    .insert(membership)
    .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

  const [tipo] = await db
    .insert(permissionType)
    .values({ orgId: org.id, name: "Vendedor", grants: { objetivos: "area" } })
    .returning();
  if (!tipo) throw new Error("insert de permission_type no devolvió fila");

  return { org, ownerId, tipo };
}

describe("createInvitation", () => {
  it(
    "WHEN el dueño invita THE SYSTEM SHALL guardar solo el hash del token y devolver el token " +
      "crudo una única vez",
    async () => {
      const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Invita");

      const result = await createInvitation(ownerId, org.id, "nuevo@example.com", tipo.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const [row] = await db.select().from(invitation).where(eq(invitation.orgId, org.id));
      expect(row?.tokenHash).toBe(hashToken(result.data.token));
      expect(row?.tokenHash).not.toBe(result.data.token);
      expect(row?.permissionTypeId).toBe(tipo.id);
      expect(row?.acceptedAt).toBeNull();
    },
  );

  it("WHEN el enlace se emite THE SYSTEM SHALL darle 7 días de vida", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Invita Vence");
    const result = await createInvitation(ownerId, org.id, "otro@example.com", tipo.id);
    if (!result.ok) throw new Error("createInvitation falló");

    const dias = (result.data.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);
  });

  it("WHEN quien invita no es el dueño THE SYSTEM SHALL rechazarlo", async () => {
    const { org, tipo } = await orgConDuenoYTipo("Test Org Invita Empleado");
    const employeeId = crypto.randomUUID();
    await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
    createdProfileIds.push(employeeId);
    await db
      .insert(membership)
      .values({ userId: employeeId, orgId: org.id, role: "employee", acceptedAt: new Date() });

    const result = await createInvitation(employeeId, org.id, "colado@example.com", tipo.id);
    expect(result.ok).toBe(false);
  });

  it(
    "WHEN el tipo de permiso es de OTRA empresa THE SYSTEM SHALL rechazarlo — si no, el dueño de " +
      "una empresa podría colar el tipo de otra y conceder lo que no es suyo",
    async () => {
      const a = await orgConDuenoYTipo("Test Org Invita A");
      const b = await orgConDuenoYTipo("Test Org Invita B");

      const result = await createInvitation(a.ownerId, a.org.id, "cruzado@example.com", b.tipo.id);
      expect(result.ok).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/invitations.test.ts`
Expected: FAIL — no existe `../server/invitations/mutations.ts`.

- [ ] **Step 3: Escribir el módulo de mutaciones**

Crear `apps/improvement/server/invitations/mutations.ts`:

```ts
// El dueño emite un enlace de invitación. El token crudo se devuelve UNA vez, para que la pantalla
// lo muestre; en la base queda solo su SHA-256, así que quien se robe la base no se roba
// invitaciones usables.
//
// Mandarlo por correo o WhatsApp no es de este módulo: esa integración está en pausa por decisión de
// Jose Carlos hasta terminar de construir la empresa digital. Hoy el dueño copia el enlace.
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { invitation, permissionType } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

const DIAS_DE_VIDA = 7;
const emailSchema = z.email();

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation(
  userId: string,
  orgId: string,
  email: string,
  permissionTypeId: string,
): Promise<Result<{ token: string; expiresAt: Date }>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño invita a su equipo.", "FORBIDDEN");
  }

  const correo = emailSchema.safeParse(email.trim().toLowerCase());
  if (!correo.success) return fail("Ese correo no es válido.");

  // El tipo tiene que ser de ESTA empresa: sin este chequeo, el dueño de una podría colar el id de
  // un tipo de otra y conceder permisos que no son suyos.
  const [tipo] = await db
    .select({ id: permissionType.id })
    .from(permissionType)
    .where(and(eq(permissionType.id, permissionTypeId), eq(permissionType.orgId, orgId)))
    .limit(1);
  if (!tipo) return fail("Ese tipo de permiso no es de esta empresa.");

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + DIAS_DE_VIDA * 86_400_000);

  const [row] = await db
    .insert(invitation)
    .values({
      orgId,
      email: correo.data,
      role: "employee",
      tokenHash: hashToken(token),
      permissionTypeId: tipo.id,
      expiresAt,
    })
    .returning({ id: invitation.id });

  return row ? { ok: true, data: { token, expiresAt } } : fail("No se pudo crear la invitación.", "NOT_FOUND");
}
```

- [ ] **Step 4: Escribir el módulo de lectura**

Crear `apps/improvement/server/invitations/loadInvitations.ts`:

```ts
// Las invitaciones vivas de una empresa (para que el dueño vea a quién ya invitó) y la resolución de
// un token a la pantalla de aceptación.
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { invitation, organization, permissionType } from "@jotapuntoce/db/schema";
import { hashToken } from "./mutations.ts";

export interface LiveInvitation {
  id: string;
  email: string;
  typeName: string | null;
  expiresAt: Date;
}

export async function listLiveInvitations(orgId: string): Promise<LiveInvitation[]> {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      typeName: permissionType.name,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .leftJoin(permissionType, eq(permissionType.id, invitation.permissionTypeId))
    .where(
      and(
        eq(invitation.orgId, orgId),
        isNull(invitation.acceptedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.expiresAt));
}

export interface OpenInvitation {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
}

/**
 * WHEN el token no existe, ya fue usado o venció THE SYSTEM SHALL devolver null — y la pantalla dice
 * "este enlace ya no sirve" sin decir de qué empresa era: quien tiene un token muerto no tiene por
 * qué enterarse de que esa empresa existe.
 */
export async function findOpenInvitation(token: string): Promise<OpenInvitation | null> {
  const [row] = await db
    .select({
      id: invitation.id,
      orgId: invitation.orgId,
      orgName: organization.name,
      email: invitation.email,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.orgId))
    .where(
      and(
        eq(invitation.tokenHash, hashToken(token)),
        isNull(invitation.acceptedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}
```

- [ ] **Step 5: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/invitations.test.ts`
Expected: PASS, 4 pruebas.

- [ ] **Step 6: Escribir la pantalla de invitar**

Crear `apps/improvement/app/[org]/equipo/invitar/InviteLink.tsx`:

```tsx
"use client";

// El enlace recién emitido, con botón de copiar. Es la única hoja con estado de esta pantalla: el
// token se muestra UNA vez y no se vuelve a poder leer, así que copiarlo tiene que ser fácil.
import { useState } from "react";

export function InviteLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="invite-link">
      <code className="invite-link-url">{url}</code>
      <button
        type="button"
        className="config-btn"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
        }}
      >
        {copiado ? "Copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}
```

Crear `apps/improvement/app/[org]/equipo/invitar/page.tsx`:

```tsx
// Emitir una invitación. El enlace se muestra una sola vez, después de crearla: el token vive en la
// URL de vuelta (?token=) y nunca se vuelve a leer de la base, donde solo está su hash.
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { requireOrgMembership } from "@/server/auth/guard";
import { createInvitation } from "@/server/invitations/mutations";
import { listPermissionTypes } from "@/server/permissions/mutations";
import { InviteLink } from "./InviteLink.tsx";

export default async function InvitarPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { token, error } = await searchParams;

  const member = await requireOrgMembership(orgId);
  if (member.role !== "owner") notFound();

  const tipos = await listPermissionTypes(orgId);
  const host = (await headers()).get("host") ?? "localhost:3200";
  const proto = host.startsWith("localhost") ? "http" : "https";

  async function invitar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const result = await createInvitation(
      row.userId,
      orgId,
      formData.get("email")?.toString() ?? "",
      formData.get("permissionTypeId")?.toString() ?? "",
    );
    if (!result.ok) redirect(`/${orgId}/equipo/invitar?error=${encodeURIComponent(result.error.message)}`);
    redirect(`/${orgId}/equipo/invitar?token=${result.data.token}`);
  }

  return (
    <main className="permisos-page">
      <h1 className="permisos-title">Invitar a alguien</h1>

      {tipos.length === 0 ? (
        <p className="permisos-hint">
          Primero crea al menos un tipo de permiso — es lo que define qué va a ver esta persona.{" "}
          <Link href={`/${orgId}/equipo/permisos`}>Crear un tipo</Link>
        </p>
      ) : (
        <form action={invitar} className="permiso-card">
          <label className="permiso-field">
            <span>Su correo</span>
            <input type="email" name="email" required className="permiso-name" />
          </label>
          <label className="permiso-field">
            <span>Qué va a poder ver</span>
            <select name="permissionTypeId" required>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="config-btn">Generar enlace</button>
        </form>
      )}

      {error && <p className="invite-error">{error}</p>}

      {token && (
        <div className="permiso-card">
          <p className="permisos-hint">
            Listo. Mándale este enlace por donde tú quieras. Vence en 7 días, sirve una sola vez y no
            se vuelve a mostrar.
          </p>
          <InviteLink url={`${proto}://${host}/invitacion/${token}`} />
        </div>
      )}

      <Link href={`/${orgId}/equipo`}>← Volver al equipo</Link>
    </main>
  );
}
```

- [ ] **Step 7: Agregar los botones y la lista al Equipo**

En `apps/improvement/app/[org]/equipo/page.tsx`, dentro de la rama `memberRow.role === "owner"`,
agregar el import `import { listLiveInvitations } from "@/server/invitations/loadInvitations";` e
insertar antes de la lista de equipo:

```tsx
<div className="permiso-actions">
  <Link href={`/${orgId}/equipo/invitar`} className="config-btn">Invitar a alguien</Link>
  <Link href={`/${orgId}/equipo/permisos`} className="config-btn">Tipos de permiso</Link>
</div>
```

Y después de la lista de equipo:

```tsx
{invitaciones.length > 0 && (
  <section>
    <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Invitaciones sin usar</h2>
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
      {invitaciones.map((inv) => (
        <li key={inv.id} style={cardStyle}>
          {inv.email} · {inv.typeName ?? "sin tipo"} · vence el{" "}
          {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(inv.expiresAt)}
        </li>
      ))}
    </ul>
  </section>
)}
```

con `const invitaciones = await listLiveInvitations(orgId);` junto al `listTeamForOwner` que ya está
ahí, y `import Link from "next/link";` arriba.

- [ ] **Step 8: Agregar el CSS**

Al final de `apps/improvement/app/globals.css`:

```css
/* Enlace de invitación recién emitido — se muestra una sola vez. */
.invite-link {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.invite-link-url {
  flex: 1;
  min-width: 220px;
  padding: 8px 10px;
  border-radius: var(--radius-sm, 10px);
  border: 1px solid var(--border);
  background: var(--bg);
  font-family: var(--font-geist-mono), monospace;
  font-size: 12px;
  word-break: break-all;
}

.invite-error { color: var(--danger); font-size: 13px; }
```

- [ ] **Step 9: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/invitations "apps/improvement/app/[org]/equipo" apps/improvement/app/globals.css apps/improvement/tests/invitations.test.ts
git commit -m "feat(improvement): el dueño emite enlaces de invitación de un solo uso"
```

---

### Task 7: Aceptar la invitación

**Files:**
- Create: `apps/improvement/app/invitacion/[token]/page.tsx`
- Create: `apps/improvement/app/invitacion/[token]/AcceptForm.tsx`
- Modify: `apps/improvement/server/invitations/mutations.ts`
- Modify: `apps/improvement/app/globals.css`
- Test: `apps/improvement/tests/invitations.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: `findOpenInvitation`, `hashToken` (Task 6); `getSessionUser` (Task 3);
  `listAreasByOrg` de `../areas/listAreas.ts`.
- Produces:
  `acceptInvitation(token: string, sessionUser: { id: string; email: string }, form: unknown): Promise<Result<{ orgId: string }>>`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `apps/improvement/tests/invitations.test.ts`:

```ts
import { acceptInvitation } from "../server/invitations/mutations.ts";

const formValido = {
  fullName: "Lucía Ramírez",
  phone: "5215512345678",
  areaId: null,
  jobTitle: "Jefa de obra",
  responsibilities: "Coordina a los maestros y cierra las bitácoras",
};

describe("acceptInvitation", () => {
  it(
    "WHEN alguien acepta con un token vivo THE SYSTEM SHALL crear su perfil y su membresía con el " +
      "puesto y el tipo de permiso que traía la invitación",
    async () => {
      const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta");
      const emitida = await createInvitation(ownerId, org.id, "lucia@example.com", tipo.id);
      if (!emitida.ok) throw new Error("createInvitation falló");

      const nuevoId = crypto.randomUUID();
      createdProfileIds.push(nuevoId);

      const result = await acceptInvitation(
        emitida.data.token,
        { id: nuevoId, email: "lucia@example.com" },
        formValido,
      );
      expect(result.ok).toBe(true);

      const [row] = await db
        .select()
        .from(membership)
        .where(and(eq(membership.userId, nuevoId), eq(membership.orgId, org.id)));
      expect(row?.permissionTypeId).toBe(tipo.id);
      expect(row?.jobTitle).toBe("Jefa de obra");
      expect(row?.role).toBe("employee");

      const [perfil] = await db.select().from(profile).where(eq(profile.id, nuevoId));
      expect(perfil?.phone).toBe("5215512345678");
    },
  );

  it("WHEN el mismo enlace se usa dos veces THE SYSTEM SHALL rechazar el segundo intento", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Dos Veces");
    const emitida = await createInvitation(ownerId, org.id, "repetida@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    const primero = crypto.randomUUID();
    const segundo = crypto.randomUUID();
    createdProfileIds.push(primero, segundo);

    const uno = await acceptInvitation(emitida.data.token, { id: primero, email: "repetida@example.com" }, formValido);
    const dos = await acceptInvitation(emitida.data.token, { id: segundo, email: "repetida@example.com" }, formValido);

    expect(uno.ok).toBe(true);
    expect(dos.ok).toBe(false);
  });

  it(
    "WHEN quien acepta se registró con OTRO correo THE SYSTEM SHALL rechazarlo — el correo lo fijó " +
      "el dueño al invitar y el formulario no lo puede cambiar",
    async () => {
      const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Otro Correo");
      const emitida = await createInvitation(ownerId, org.id, "invitado@example.com", tipo.id);
      if (!emitida.ok) throw new Error("createInvitation falló");

      const intruso = crypto.randomUUID();
      const result = await acceptInvitation(
        emitida.data.token,
        { id: intruso, email: "intruso@example.com" },
        formValido,
      );
      expect(result.ok).toBe(false);
    },
  );

  it("WHEN el enlace ya venció THE SYSTEM SHALL rechazarlo", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Vencida");
    const emitida = await createInvitation(ownerId, org.id, "tarde@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitation.tokenHash, hashToken(emitida.data.token)));

    const tarde = crypto.randomUUID();
    const result = await acceptInvitation(emitida.data.token, { id: tarde, email: "tarde@example.com" }, formValido);
    expect(result.ok).toBe(false);
  });

  it("WHEN el formulario viene incompleto THE SYSTEM SHALL rechazarlo sin crear nada", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Incompleto");
    const emitida = await createInvitation(ownerId, org.id, "incompleto@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    const usuario = crypto.randomUUID();
    const result = await acceptInvitation(
      emitida.data.token,
      { id: usuario, email: "incompleto@example.com" },
      { ...formValido, fullName: "" },
    );
    expect(result.ok).toBe(false);

    const filas = await db.select().from(membership).where(eq(membership.userId, usuario));
    expect(filas.length).toBe(0);
  });
});
```

Agregar `and` al import de `drizzle-orm` del archivo.

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/invitations.test.ts`
Expected: FAIL — `acceptInvitation` no existe.

- [ ] **Step 3: Escribir `acceptInvitation`**

Agregar a `apps/improvement/server/invitations/mutations.ts` (y al import de `drizzle-orm`: `gt`,
`isNull`; al de schema: `membership`, `profile`):

```ts
const acceptSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe tu nombre completo."),
  phone: z.string().trim().min(7, "Escribe un teléfono donde te podamos avisar."),
  areaId: z.uuid().nullable(),
  jobTitle: z.string().trim().min(2, "Escribe tu puesto."),
  responsibilities: z.string().trim().min(3, "Escribe de qué te encargas."),
});

/**
 * El empleado ya se registró en Supabase Auth del lado del cliente (signUp con la llave anon — la
 * service-role key no existe en esta app, Non-negotiable #3). Aquí solo se confía en `sessionUser`,
 * que el guard resolvió del access token real: el id NUNCA llega como parámetro del formulario.
 *
 * WHEN el token está muerto, o el correo registrado no es el invitado, THE SYSTEM SHALL rechazar sin
 * escribir nada. WHEN todo cuadra THE SYSTEM SHALL crear perfil y membresía en UNA transacción, para
 * que un fallo a media pasada no deje a alguien a medio entrar.
 */
export async function acceptInvitation(
  token: string,
  sessionUser: { id: string; email: string },
  form: unknown,
): Promise<Result<{ orgId: string }>> {
  const parsed = acceptSchema.safeParse(form);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Faltan datos del formulario.");
  }

  const [inv] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.tokenHash, hashToken(token)),
        isNull(invitation.acceptedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!inv) return fail("Este enlace ya no sirve.", "NOT_FOUND");
  if (inv.email.toLowerCase() !== sessionUser.email.toLowerCase()) {
    return fail("Este enlace es para otro correo.", "FORBIDDEN");
  }

  try {
    return await db.transaction(async (tx) => {
      // El reclamo del enlace va PRIMERO: si dos personas abren el mismo enlace a la vez, la carrera
      // se resuelve antes de escribir nada. Misma guarda que server/reminders/deliver.ts.
      const [claimed] = await tx
        .update(invitation)
        .set({ acceptedAt: new Date() })
        .where(and(eq(invitation.id, inv.id), isNull(invitation.acceptedAt)))
        .returning({ id: invitation.id });
      if (!claimed) throw new Error("INVITACION_YA_USADA");

      await tx
        .insert(profile)
        .values({
          id: sessionUser.id,
          email: inv.email,
          fullName: parsed.data.fullName,
          phone: parsed.data.phone,
        })
        // Ya puede existir: la misma persona pudo haber entrado antes a otra empresa del mismo dueño.
        .onConflictDoUpdate({
          target: profile.id,
          set: { fullName: parsed.data.fullName, phone: parsed.data.phone },
        });

      await tx
        .insert(membership)
        .values({
          userId: sessionUser.id,
          orgId: inv.orgId,
          role: "employee",
          permissionTypeId: inv.permissionTypeId,
          areaId: parsed.data.areaId,
          jobTitle: parsed.data.jobTitle,
          responsibilities: parsed.data.responsibilities,
          acceptedAt: new Date(),
        })
        .onConflictDoNothing();

      return { ok: true as const, data: { orgId: inv.orgId } };
    });
  } catch {
    return fail("Este enlace ya no sirve.", "NOT_FOUND");
  }
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/invitations.test.ts`
Expected: PASS, 9 pruebas.

- [ ] **Step 5: Escribir la pantalla de aceptación**

Crear `apps/improvement/app/invitacion/[token]/AcceptForm.tsx`:

```tsx
"use client";

// Una sola pantalla: contraseña + quién eres. El alta en Supabase Auth pasa AQUÍ, del lado del
// cliente con la llave anon — la service-role key no existe en esta app (Non-negotiable #3).
//
// La cookie `imp-access-token` se escribe igual que en /login (ver la nota larga en LoginForm.tsx
// sobre por qué el nombre lleva prefijo propio); la Server Action que sigue la lee para saber quién
// es quien acaba de registrarse, así que el id nunca viaja como campo del formulario.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface AreaChoice {
  id: string;
  name: string;
}

export function AcceptForm({
  email,
  orgName,
  areas,
  accept,
}: {
  email: string;
  orgName: string;
  areas: AreaChoice[];
  accept: (form: {
    fullName: string;
    phone: string;
    areaId: string | null;
    jobTitle: string;
    responsibilities: string;
  }) => Promise<{ ok: boolean; message?: string; orgId?: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!supabaseUrl || !supabaseAnonKey) {
      setError("Supabase no está configurado en este entorno.");
      setLoading(false);
      return;
    }

    const data = new FormData(e.currentTarget);
    const password = data.get("password")?.toString() ?? "";
    if (password.length < 8) {
      setError("La contraseña necesita al menos 8 caracteres.");
      setLoading(false);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: signUp, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError || !signUp.session) {
      setError("No se pudo crear tu cuenta. Puede que ya exista — entra desde /login.");
      setLoading(false);
      return;
    }

    document.cookie = `imp-access-token=${signUp.session.access_token}; path=/; max-age=${signUp.session.expires_in}; SameSite=Lax`;

    const result = await accept({
      fullName: data.get("fullName")?.toString() ?? "",
      phone: data.get("phone")?.toString() ?? "",
      areaId: data.get("areaId")?.toString() || null,
      jobTitle: data.get("jobTitle")?.toString() ?? "",
      responsibilities: data.get("responsibilities")?.toString() ?? "",
    });

    if (!result.ok) {
      setError(result.message ?? "No se pudo completar tu registro.");
      setLoading(false);
      return;
    }

    router.push(`/${result.orgId}/dashboard`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="permiso-card">
      <p className="permisos-hint">
        Te invitaron a <strong>{orgName}</strong> como <strong>{email}</strong>.
      </p>

      <label className="permiso-field">
        <span>Crea tu contraseña</span>
        <input type="password" name="password" required minLength={8} className="permiso-name" />
      </label>
      <label className="permiso-field">
        <span>Tu nombre completo</span>
        <input name="fullName" required className="permiso-name" />
      </label>
      <label className="permiso-field">
        <span>Tu teléfono</span>
        <input name="phone" required className="permiso-name" />
      </label>
      <label className="permiso-field">
        <span>Tu área</span>
        <select name="areaId" required>
          <option value="">Elige tu área</option>
          {areas.map((areaChoice) => (
            <option key={areaChoice.id} value={areaChoice.id}>{areaChoice.name}</option>
          ))}
        </select>
      </label>
      <label className="permiso-field">
        <span>Tu puesto</span>
        <input name="jobTitle" required className="permiso-name" />
      </label>
      <label className="permiso-field">
        <span>De qué te encargas</span>
        <textarea name="responsibilities" required rows={3} className="permiso-name" />
      </label>

      {error && <p className="invite-error">{error}</p>}

      <button type="submit" disabled={loading} className="config-btn">
        {loading ? "Entrando..." : "Entrar a mi empresa"}
      </button>
    </form>
  );
}
```

Crear `apps/improvement/app/invitacion/[token]/page.tsx`:

```tsx
// Aceptación de invitación. Fuera de [org] a propósito: quien entra aquí todavía no es miembro de
// nada, así que no puede pasar por requireOrgMembership.
import { getSessionUser } from "@/server/auth/guard";
import { findOpenInvitation } from "@/server/invitations/loadInvitations";
import { acceptInvitation } from "@/server/invitations/mutations";
import { listAreasByOrg } from "@/server/areas/listAreas";
import { AcceptForm } from "./AcceptForm.tsx";

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitacion = await findOpenInvitation(token);

  // Sin decir de qué empresa era: quien tiene un token muerto no tiene por qué enterarse de que esa
  // empresa existe.
  if (!invitacion) {
    return (
      <main className="permisos-page">
        <h1 className="permisos-title">Este enlace ya no sirve</h1>
        <p className="permisos-hint">
          Puede que ya lo hayas usado o que haya vencido. Pídele a quien te invitó que te mande uno
          nuevo.
        </p>
      </main>
    );
  }

  const areas = (await listAreasByOrg([invitacion.orgId])).get(invitacion.orgId) ?? [];

  async function aceptar(form: {
    fullName: string;
    phone: string;
    areaId: string | null;
    jobTitle: string;
    responsibilities: string;
  }) {
    "use server";
    const user = await getSessionUser();
    if (!user) return { ok: false, message: "No pudimos confirmar tu cuenta. Vuelve a intentar." };

    const result = await acceptInvitation(token, user, form);
    if (!result.ok) return { ok: false, message: result.error.message };
    return { ok: true, orgId: result.data.orgId };
  }

  return (
    <main className="permisos-page">
      <h1 className="permisos-title">Te están esperando</h1>
      <AcceptForm
        email={invitacion.email}
        orgName={invitacion.orgName}
        areas={areas}
        accept={aceptar}
      />
    </main>
  );
}
```

- [ ] **Step 6: Probar el flujo completo a mano**

Run: `pnpm dev:improvement`
1. Entrar como el dueño, ir a `/{orgId}/equipo/permisos` y crear un tipo.
2. Ir a `/{orgId}/equipo/invitar`, invitar a un correo de prueba, copiar el enlace.
3. Abrir el enlace en una ventana privada, llenar el formulario.
Expected: aterriza en `/{orgId}/dashboard` viendo solo lo que su tipo concede. Volver a abrir el
mismo enlace muestra "Este enlace ya no sirve".

- [ ] **Step 7: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server/invitations/mutations.ts "apps/improvement/app/invitacion" apps/improvement/app/globals.css apps/improvement/tests/invitations.test.ts
git commit -m "feat(improvement): el empleado acepta su invitación y se coloca solo"
```

---

### Task 8: Que el alcance filtre de verdad

**Files:**
- Modify: `apps/improvement/server/objectives/mutations.ts`
- Modify: `apps/improvement/server/clients/mutations.ts`
- Create: `apps/improvement/server/employees/teammates.ts`
- Modify: `apps/improvement/app/[org]/objetivos/page.tsx`, `clientes/page.tsx`, `mapa/page.tsx`, `powerups/page.tsx`, `equipo/page.tsx`
- Test: `apps/improvement/tests/permissions.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: `resolveSection`, `requireSection` (Task 3).
- Produces: `listTeammates(orgId: string, areaId: string | null): Promise<{ userId: string; fullName: string | null; email: string; jobTitle: string | null }[]>`.
  `listObjectives` conserva su firma `(userId, orgId, opts)` — el filtrado pasa adentro, para que
  ningún llamador futuro pueda olvidarlo.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `apps/improvement/tests/permissions.test.ts`:

```ts
import { listObjectives } from "../server/objectives/mutations.ts";

describe("listObjectives con alcance", () => {
  it(
    "WHEN el empleado tiene alcance `propio` THE SYSTEM SHALL devolverle solo lo asignado a él, " +
      "aunque su compañero tenga objetivos en la misma área",
    async () => {
      const org = await newOrg("Test Org Alcance Propio");
      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Operativo", grants: { objetivos: "propio" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const yo = crypto.randomUUID();
      const companero = crypto.randomUUID();
      await db.insert(profile).values([
        { id: yo, email: `${yo}@example.com` },
        { id: companero, email: `${companero}@example.com` },
      ]);
      createdProfileIds.push(yo, companero);
      await db.insert(membership).values([
        { userId: yo, orgId: org.id, role: "employee", permissionTypeId: tipo.id, acceptedAt: new Date() },
        { userId: companero, orgId: org.id, role: "employee", permissionTypeId: tipo.id, acceptedAt: new Date() },
      ]);

      await db.insert(objective).values([
        { orgId: org.id, title: "Mío", impactWeight: 10, dueDate: new Date(), assignedEmployeeId: yo },
        { orgId: org.id, title: "Suyo", impactWeight: 10, dueDate: new Date(), assignedEmployeeId: companero },
      ]);

      const { data } = await listObjectives(yo, org.id);
      expect(data.objectives.map((o) => o.title)).toEqual(["Mío"]);
    },
  );

  it(
    "WHEN el empleado tiene alcance `area` pero NO tiene área asignada THE SYSTEM SHALL devolver " +
      "cero, no todo — un miembro a medio configurar nunca ve de más",
    async () => {
      const org = await newOrg("Test Org Alcance Sin Area");
      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "A medias", grants: { objetivos: "area" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const userId = crypto.randomUUID();
      await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
      createdProfileIds.push(userId);
      await db.insert(membership).values({
        userId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        acceptedAt: new Date(),
      });

      await db
        .insert(objective)
        .values({ orgId: org.id, title: "De nadie", impactWeight: 10, dueDate: new Date() });

      const { data } = await listObjectives(userId, org.id);
      expect(data.objectives.length).toBe(0);
    },
  );

  it("WHEN la sección está en `ninguno` THE SYSTEM SHALL devolver la lista vacía, no lanzar", async () => {
    const org = await newOrg("Test Org Alcance Ninguno");
    const userId = crypto.randomUUID();
    await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
    createdProfileIds.push(userId);
    await db
      .insert(membership)
      .values({ userId, orgId: org.id, role: "employee", acceptedAt: new Date() });

    await db.insert(objective).values({ orgId: org.id, title: "Oculto", impactWeight: 10, dueDate: new Date() });

    const { data } = await listObjectives(userId, org.id);
    expect(data.objectives).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: FAIL — `listObjectives` todavía devuelve todo.

- [ ] **Step 3: Filtrar en `listObjectives`**

En `apps/improvement/server/objectives/mutations.ts`, cambiar el import de `assertMembership` por
`resolveSection` y reemplazar el arranque de `listObjectives`:

```ts
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { resolveSection } from "../auth/guard.ts";
```

```ts
export async function listObjectives(
  userId: string,
  orgId: string,
  opts: { cursor?: string | null; limit?: number } = {},
) {
  // El alcance se resuelve ADENTRO y no lo pasa el llamador: así ninguna pantalla futura puede
  // olvidarse de filtrar. resolveSection ya hace la comprobación de tenencia (404 si no es miembro).
  const { membership: member, scope } = await resolveSection(userId, orgId, "objetivos");
  if (scope === "ninguno") {
    return { ok: true as const, data: { objectives: [], nextCursor: null } };
  }

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = decodeCursor(opts.cursor);

  const conditions = [eq(objective.orgId, orgId)];

  // Un miembro con alcance de área pero sin área asignada no ve NADA: el caso seguro de un
  // miembro a medio configurar es que deje de ver, nunca que vea todo.
  if (scope === "area") {
    conditions.push(member.areaId ? eq(objective.areaId, member.areaId) : sql`false`);
  }
  if (scope === "propio") {
    conditions.push(eq(objective.assignedEmployeeId, userId));
  }

  if (cursor) {
    const beforeCursor = or(
      lt(objective.createdAt, cursor.createdAt),
      and(eq(objective.createdAt, cursor.createdAt), lt(objective.id, cursor.id)),
    );
    if (beforeCursor) conditions.push(beforeCursor);
  }
  // ...el resto del cuerpo queda igual
```

`completeObjective` conserva su `assertMembership` — completar es una escritura sobre un objetivo
propio, y su chequeo de `assignedEmployeeId` ya está.

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: PASS, 17 pruebas.

- [ ] **Step 5: Cerrar las secciones en las rutas**

Reemplazar en cada página su guard, dejando todo lo demás igual:

- `app/[org]/objetivos/page.tsx`: `const { membership } = await requireSection(orgId, "objetivos");`
- `app/[org]/clientes/page.tsx`: `const { membership } = await requireSection(orgId, "clientes");`
- `app/[org]/mapa/page.tsx`: `const { membership } = await requireSection(orgId, "mapa");`
- `app/[org]/powerups/page.tsx`: `const { membership } = await requireSection(orgId, "powerups");`
- `app/[org]/equipo/page.tsx`: `const { membership: memberRow, scope } = await requireSection(orgId, "equipo");`

con `import { requireSection } from "@/server/auth/guard";` en cada una. Donde el código ya usaba el
nombre `membership`/`memberRow` para la fila, el destructuring lo conserva y no hay más cambios.

- [ ] **Step 6: Compañeros según alcance**

Crear `apps/improvement/server/employees/teammates.ts`:

```ts
// Los compañeros que una persona puede ver. NUNCA incluye responsibility_level: el Non-negotiable #4
// dice que un empleado jamás lee el de otro, y la forma más segura de cumplirlo es que ese campo no
// exista en el dato que sale de aquí (mismo criterio que listTeamForOwner).
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, profile } from "@jotapuntoce/db/schema";

export interface Teammate {
  userId: string;
  fullName: string | null;
  email: string;
  jobTitle: string | null;
}

export async function listTeammates(orgId: string, areaId: string | null): Promise<Teammate[]> {
  const conditions = [eq(membership.orgId, orgId), eq(profile.isPlatformAdmin, false)];
  if (areaId) conditions.push(eq(membership.areaId, areaId));

  return db
    .select({
      userId: membership.userId,
      fullName: profile.fullName,
      email: profile.email,
      jobTitle: membership.jobTitle,
    })
    .from(membership)
    .innerJoin(profile, eq(profile.id, membership.userId))
    .where(and(...conditions));
}
```

En la rama de empleado de `app/[org]/equipo/page.tsx`, usarlo:

```tsx
const companeros = await listTeammates(orgId, scope === "area" ? memberRow.areaId : null);
```

y listar `companeros` con `fullName ?? email` y el `jobTitle` debajo.

- [ ] **Step 7: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server "apps/improvement/app/[org]" apps/improvement/tests/permissions.test.ts
git commit -m "feat(improvement): los loaders filtran por el alcance que da el guard"
```

---

### Task 9: El dueño le pone nombre a sus secciones

**Files:**
- Create: `apps/improvement/server/permissions/loadSections.ts`
- Modify: `apps/improvement/server/companies/mutations.ts`
- Modify: `apps/improvement/app/[org]/dashboard/DashboardNav.tsx`
- Modify: `apps/improvement/app/[org]/dashboard/page.tsx`
- Modify: `apps/improvement/app/empresas/configuracion/page.tsx`
- Test: `apps/improvement/tests/permissions.test.ts` (agregar un `describe`)

**Interfaces:**
- Consumes: `resolveSection` (Task 3), `SECTIONS` (Task 2), `findOwnerMembership` (Task 3).
- Produces:
  `loadVisibleSections(userId: string, orgId: string): Promise<{ slug: string; label: string; hint: string }[]>`,
  `setSectionLabels(userId, orgId, labels): Promise<Result<true>>`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `apps/improvement/tests/permissions.test.ts`:

```ts
import { loadVisibleSections } from "../server/permissions/loadSections.ts";

describe("loadVisibleSections", () => {
  it(
    "WHEN el dueño renombró una sección y apagó otra THE SYSTEM SHALL devolver el nombre suyo y " +
      "omitir la apagada — nadie ve una puerta que no abre",
    async () => {
      const org = await newOrg("Test Org Secciones");
      await db
        .update(organization)
        .set({ sectionLabels: { clientes: { label: "Obras" }, powerups: { hidden: true } } })
        .where(sql`${organization.id} = ${org.id}`);

      const ownerId = crypto.randomUUID();
      await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
      createdProfileIds.push(ownerId);
      await db
        .insert(membership)
        .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

      const secciones = await loadVisibleSections(ownerId, org.id);
      const slugs = secciones.map((s) => s.slug);

      expect(slugs).toContain("clientes");
      expect(slugs).not.toContain("powerups");
      expect(secciones.find((s) => s.slug === "clientes")?.label).toBe("Obras");
    },
  );

  it(
    "WHEN el empleado tiene `ninguno` en una sección THE SYSTEM SHALL omitirla del menú, aunque el " +
      "dueño no la haya apagado",
    async () => {
      const org = await newOrg("Test Org Secciones Empleado");
      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Solo objetivos", grants: { objetivos: "propio" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const userId = crypto.randomUUID();
      await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
      createdProfileIds.push(userId);
      await db.insert(membership).values({
        userId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        acceptedAt: new Date(),
      });

      const secciones = await loadVisibleSections(userId, org.id);
      expect(secciones.map((s) => s.slug)).toEqual(["objetivos"]);
    },
  );
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: FAIL — no existe `../server/permissions/loadSections.ts`.

- [ ] **Step 3: Escribir el módulo**

Crear `apps/improvement/server/permissions/loadSections.ts`:

```ts
// Las secciones que una persona ve en SU empresa, con el nombre que el dueño les puso.
//
// Dos filtros distintos que se ven parecido pero no lo son: `hidden` es del dueño ("esta empresa no
// usa PowerUps") y aplica a todos; el alcance `ninguno` es de la persona. Los dos terminan en lo
// mismo — la sección no se dibuja — pero por razones distintas.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { SECTIONS } from "./sections.ts";

export interface VisibleSection {
  slug: string;
  label: string;
  hint: string;
}

interface SectionOverride {
  label?: string;
  hidden?: boolean;
}

export async function loadVisibleSections(userId: string, orgId: string): Promise<VisibleSection[]> {
  const [org] = await db
    .select({ sectionLabels: organization.sectionLabels })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  const overrides = (org?.sectionLabels ?? {}) as Record<string, SectionOverride>;
  const visibles: VisibleSection[] = [];

  for (const section of SECTIONS) {
    const override = overrides[section.slug] ?? {};
    if (override.hidden) continue;

    const { scope } = await resolveSection(userId, orgId, section.slug);
    if (scope === "ninguno") continue;

    visibles.push({
      slug: section.slug,
      label: override.label?.trim() || section.label,
      hint: section.hint,
    });
  }

  return visibles;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `pnpm --filter improvement test tests/permissions.test.ts`
Expected: PASS, 19 pruebas.

- [ ] **Step 5: Que el menú use las secciones visibles**

Reemplazar el cuerpo de `apps/improvement/app/[org]/dashboard/DashboardNav.tsx`:

```tsx
// Las secciones del org, desde el dashboard. La lista ya no vive aquí: la arma
// server/permissions/loadSections.ts con el permiso de quien entra y los nombres que el dueño les
// puso. Nadie ve una puerta que no abre.
//
// "Planos" sigue aparte: es herramienta de Jose Carlos y no es una sección con tipo de permiso.
import Link from "next/link";
import type { VisibleSection } from "@/server/permissions/loadSections";

export function DashboardNav({
  orgId,
  sections,
  showPlanos,
}: {
  orgId: string;
  sections: VisibleSection[];
  showPlanos: boolean;
}) {
  const all = showPlanos
    ? [...sections, { slug: "planos", label: "Planos", hint: "Los proyectos como piezas conectadas" }]
    : sections;

  return (
    <nav className="dash-nav" aria-label="Secciones de la empresa">
      {all.map((section) => (
        <Link key={section.slug} href={`/${orgId}/${section.slug}`} className="dash-nav-card">
          <span className="dash-nav-label">{section.label}</span>
          <span className="dash-nav-hint">{section.hint}</span>
        </Link>
      ))}
    </nav>
  );
}
```

En `app/[org]/dashboard/page.tsx`, cargar las secciones y pasarlas:

```tsx
const sections = await loadVisibleSections(membership.userId, orgId);
// ...
<DashboardNav orgId={orgId} sections={sections} showPlanos={showPlanos} />
```

con `import { loadVisibleSections } from "@/server/permissions/loadSections";`.

- [ ] **Step 6: Que el dueño pueda renombrarlas**

Agregar a `apps/improvement/server/companies/mutations.ts`:

```ts
import { SECTIONS } from "../permissions/sections.ts";

/**
 * Cómo llama el dueño a cada sección de SU empresa, y cuáles apaga. Solo las secciones conocidas se
 * guardan: una llave inventada en el formulario no entra a la fila.
 */
export async function setSectionLabels(
  userId: string,
  orgId: string,
  labels: Record<string, { label?: string; hidden?: boolean }>,
): Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño personaliza su empresa." } };
  }

  const limpio: Record<string, { label?: string; hidden?: boolean }> = {};
  for (const section of SECTIONS) {
    const entrada = labels[section.slug];
    if (!entrada) continue;
    const nombre = entrada.label?.trim();
    // Solo se guarda lo que cambia: un nombre igual al default no ensucia la fila.
    if (nombre && nombre !== section.label) limpio[section.slug] = { label: nombre };
    if (entrada.hidden) limpio[section.slug] = { ...(limpio[section.slug] ?? {}), hidden: true };
  }

  await db.update(organization).set({ sectionLabels: limpio }).where(eq(organization.id, orgId));
  return { ok: true };
}
```

con `findOwnerMembership` importado de `../auth/guard.ts` y `organization` del schema.

En `app/empresas/configuracion/page.tsx`, la acción y el bloque, dentro del mismo recorrido de
empresas donde quedó el de Áreas:

```tsx
async function guardarSecciones(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const orgId = formData.get("orgId")?.toString();
  if (!orgId) return;

  const labels: Record<string, { label?: string; hidden?: boolean }> = {};
  for (const section of SECTIONS) {
    labels[section.slug] = {
      label: formData.get(`label-${section.slug}`)?.toString() ?? "",
      hidden: formData.get(`hidden-${section.slug}`) === "on",
    };
  }
  await setSectionLabels(id, orgId, labels);
  revalidatePath("/empresas/configuracion");
}
```

```tsx
<section className="config-section">
  <h3 className="config-subtitle">Cómo se llama todo en {company.name}</h3>
  <p className="config-hint">
    Ponle a cada sección el nombre que usas de verdad, y apaga las que no ocupes.
  </p>
  <form action={guardarSecciones} className="permiso-grid">
    <input type="hidden" name="orgId" value={company.orgId ?? ""} />
    {SECTIONS.map((section) => {
      const override = (company.sectionLabels ?? {})[section.slug] ?? {};
      return (
        <label key={section.slug} className="permiso-field">
          <span>{section.label}</span>
          <input
            name={`label-${section.slug}`}
            defaultValue={override.label ?? section.label}
            className="config-input"
          />
          <label className="config-hint">
            <input type="checkbox" name={`hidden-${section.slug}`} defaultChecked={override.hidden === true} />{" "}
            No la uso
          </label>
        </label>
      );
    })}
    <button type="submit" className="config-btn">Guardar nombres</button>
  </form>
</section>
```

`loadCompanies` debe traer `sectionLabels` en su select para que `company.sectionLabels` exista;
agregarlo ahí.

- [ ] **Step 7: Verificar a mano**

Run: `pnpm dev:improvement`
1. Renombrar "Clientes" a "Obras" y apagar "PowerUps" en `/empresas/configuracion`.
2. Entrar al dashboard de esa empresa.
Expected: el menú dice "Obras" y ya no muestra PowerUps. Entrar a `/{orgId}/powerups` por URL sigue
funcionando para el dueño (apagar es del menú, no del permiso) — quien tiene `ninguno` recibe 404.

- [ ] **Step 8: Gate y commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/improvement/server "apps/improvement/app/[org]/dashboard" apps/improvement/app/empresas/configuracion/page.tsx apps/improvement/tests/permissions.test.ts
git commit -m "feat(improvement): el dueño renombra y apaga las secciones de su empresa digital"
```

---

## Notas de la auto-revisión

Tres cosas que salieron al revisar el plan contra el spec y que quedaron resueltas arriba, dichas
aquí para que nadie las vuelva a descubrir:

1. **`createInvitation` valida que el tipo de permiso sea de la misma empresa.** El spec no lo pedía.
   Sin ese chequeo, el dueño de una empresa podía pasar el id del tipo de otra y conceder permisos
   que no son suyos. Tiene su prueba en la Tarea 6.
2. **El id del usuario nunca viaja en el formulario de aceptación.** El spec decía "signUp y luego la
   transacción"; si el cliente mandara el id, cualquiera podría meter a otra persona a la empresa.
   `acceptInvitation` solo confía en el `sessionUser` que el guard sacó del access token real, y
   además compara el correo contra el de la invitación.
3. **Apagar una sección (`hidden`) no es lo mismo que negarla.** `hidden` solo la saca del menú — el
   dueño que entra por URL la sigue viendo, porque él ve todo por regla. Lo que cierra la puerta de
   verdad es el alcance `ninguno`, y eso lo hace `requireSection` con un 404.
