# El casco del muelle (Summum) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Summum existe en el sistema como empresa padre ("muelle") de cada Improvement ("barco"), cobra con Stripe Connect (membresía, % de ventas del barco, % por proyecto) y sus dos dueños lo ven y lo gobiernan desde `apps/summum`.

**Architecture:** Mismo esquema `packages/db`: `organization` gana `kind` y `parent_org_id`; cinco tablas nuevas (`membership_plan`, `stripe_account`, `fee_rate`, `fee_rate_change`, `ledger_entry`) con RLS en su migración. Una app Next.js nueva, `apps/summum`, tiene toda la lógica y las llaves de Stripe: guard de muelle y de barco, comisiones con firma de los dos, onboarding Connect, ligas de cobro con `application_fee_amount`, membresías por suscripción y un webhook idempotente que es la única fuente del libro. `apps/improvement` solo agrega la sección "Cobros" (lectura del libro + enlace a Summum).

**Tech Stack:** Next.js 16.3.3 · React 19.2.8 · TypeScript ~6.0.3 · Drizzle ORM 0.45.2 / drizzle-kit 0.31.10 · Supabase Auth (`@supabase/supabase-js` ^2.112.4) · zod ^4.5.4 · Vitest ^4.1.11 · Playwright ^1.62.1 · **stripe 23.0.0** (nuevo; publicado 2026-10-01, `npm view stripe time`).

**Spec:** `docs/superpowers/specs/2026-10-19-casco-del-muelle-summum-design.md` (leer primero la sección "Ajustes al bajar al plan": mandan sobre el resto).

## Global Constraints

- Gate antes de marcar cualquier tarea hecha: `pnpm lint && pnpm typecheck && pnpm test` en verde.
- Imports relativos con extensión explícita (`./rates.ts`); alias `@/` → raíz de cada app; sin barrel files.
- Toda Server Action / ruta API valida su input con `zod`; errores como `{ ok: true, data } | { ok: false, error }`.
- Toda tabla nueva con columna de org lleva su política RLS en la misma migración; las migraciones se generan con `pnpm db:generate` (o `drizzle-kit generate --custom` para RLS), nunca se editan a mano las generadas automáticamente.
- Ningún archivo bajo `packages/db/**` (salvo `seed.ts`) ni `apps/*/server/**` contiene el id, slug o nombre de Summum ni de ningún cliente.
- Dinero siempre en **centavos enteros**; porcentajes en **puntos base** (`2500` = 25 %).
- Guard responde **404, nunca 403**.
- `SUPABASE_SERVICE_ROLE_KEY` nunca se importa en `apps/summum` ni en `apps/improvement`. Las llaves de Stripe solo se leen en `apps/summum/server/**` y `apps/summum/app/api/**`.
- Stripe solo en **modo de prueba** en desarrollo y pruebas.
- Cuentas conectadas con `controller` (no `type: 'express'`), `country: 'MX'`.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` (modificar) | `organization.kind/parentOrgId/membershipPlanId` + 5 tablas nuevas |
| `packages/db/migrations/00NN_*.sql` (generada) | DDL de lo anterior |
| `packages/db/migrations/00NN_muelle_rls.sql` (custom) | RLS de las 5 tablas |
| `packages/db/src/muelle.ts` (nuevo) | CLI `pnpm db:muelle`: crea un muelle, sus dueños, adopta barcos huérfanos |
| `apps/admin/lib/muelle.js` (nuevo) | `findDockOfOwner(tx, userId)` para colgar barcos nuevos |
| `apps/admin/app/company-requests/actions.js`, `apps/admin/app/clientes/actions.js` (modificar) | Barco nuevo nace con `parentOrgId` |
| `apps/summum/**` (nuevo) | App del muelle (ver tareas 3–11) |
| `apps/summum/server/auth/guard.ts` | `requireDockOwnership`, `requireBarcoOwnership` y sus versiones puras |
| `apps/summum/server/fees/rates.ts` | Puro: `pickRate`, `feeCents` |
| `apps/summum/server/fees/changes.ts` | Proponer / decidir cambios de comisión (firma de los dos) |
| `apps/summum/server/stripe/client.ts` | Única instancia de `Stripe` |
| `apps/summum/server/stripe/connect.ts` | Onboarding, ligas de cobro, membresía |
| `apps/summum/server/stripe/webhook.ts` | `handleStripeEvent` (único escritor del libro) |
| `apps/summum/server/money/ledger.ts` | Lecturas del libro + `summarize` puro |
| `apps/summum/server/barcos/list.ts` | Barcos del muelle |
| `apps/improvement/server/permissions/sections.ts` (modificar) | Slug `cobros` |
| `apps/improvement/server/cobros/ledger.ts` (nuevo) | Movimientos del barco |
| `apps/improvement/app/[org]/cobros/page.tsx` (nuevo) | Pantalla "Cobros" |

---

### Task 1: Esquema del muelle, tablas de dinero y RLS

**Files:**
- Modify: `packages/db/src/schema.ts` (imports al inicio; `organization` líneas 29-53; tablas nuevas al final del archivo)
- Create (generadas): `packages/db/migrations/00NN_<nombre>.sql`, `packages/db/migrations/00NN_muelle_rls.sql`
- Test: `apps/improvement/tests/muelle-schema.test.ts`

**Interfaces:**
- Produces: exports de `@jotapuntoce/db/schema`: `organization` (+ `kind: "muelle" | "barco"`, `parentOrgId`, `membershipPlanId`), `membershipPlan`, `stripeAccount`, `feeRate`, `feeRateChange`, `ledgerEntry`. `CHARGE_KINDS = ["membresia","venta_propia","proyecto_summum"] as const`, `FEE_CHARGE_KINDS = ["venta_propia","proyecto_summum"] as const`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/improvement/tests/muelle-schema.test.ts
// Restricciones del muelle en la base, contra el Supabase de desarrollo (mismo patrón que
// tests/permissions.test.ts: asUser simula el rol authenticated para probar RLS de verdad).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { feeRate, feeRateChange, ledgerEntry, membership, organization, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  await db.delete(ledgerEntry).where(sql`${ledgerEntry.barcoOrgId} = any(${orgIds})`);
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org(kind: "muelle" | "barco", parentOrgId: string | null = null) {
  const [row] = await db
    .insert(organization)
    .values({ name: `t-${kind}`, slug: `t-${kind}-${crypto.randomUUID()}`, kind, parentOrgId })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row;
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

describe("organization.kind / parent_org_id", () => {
  it("WHEN una empresa se crea sin kind THE SYSTEM SHALL guardarla como barco", async () => {
    const [row] = await db.insert(organization).values({ name: "x", slug: `x-${crypto.randomUUID()}` }).returning();
    if (!row) throw new Error("sin fila");
    orgIds.push(row.id);
    expect(row.kind).toBe("barco");
  });

  it("WHEN un muelle tiene padre THE SYSTEM SHALL rechazar el insert", async () => {
    const dock = await org("muelle");
    await expect(org("muelle", dock.id)).rejects.toThrow();
  });
});

describe("fee_rate / fee_rate_change", () => {
  it("WHEN se repite la tasa de fábrica del mismo tipo THE SYSTEM SHALL rechazarla (nulls not distinct)", async () => {
    const dock = await org("muelle");
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 500 });
    await expect(
      db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 700 }),
    ).rejects.toThrow();
  });

  it("WHEN quien decide es quien propuso THE SYSTEM SHALL rechazarlo en la base", async () => {
    const dock = await org("muelle");
    const a = await person(dock.id, "owner");
    await expect(
      db.insert(feeRateChange).values({
        muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 500, proposedBy: a,
        decidedBy: a, decidedAt: new Date(), decision: "aprobado",
      }),
    ).rejects.toThrow();
  });
});

describe("RLS — ledger_entry", () => {
  it("WHEN un dueño de barco consulta por PostgREST THE SYSTEM SHALL devolver solo sus filas", async () => {
    const dock = await org("muelle");
    const b1 = await org("barco", dock.id);
    const b2 = await org("barco", dock.id);
    const owner1 = await person(b1.id, "owner");
    await db.insert(ledgerEntry).values([
      { muelleOrgId: dock.id, barcoOrgId: b1.id, chargeKind: "venta_propia", grossCents: 1000, summumFeeCents: 100, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` },
      { muelleOrgId: dock.id, barcoOrgId: b2.id, chargeKind: "venta_propia", grossCents: 2000, summumFeeCents: 200, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` },
    ]);
    const rows = await asUser<{ barco_org_id: string }>(owner1, "select barco_org_id from ledger_entry");
    expect(rows.map((r) => r.barco_org_id)).toEqual([b1.id]);
  });

  it("WHEN un empleado del barco consulta THE SYSTEM SHALL devolver vacío", async () => {
    const dock = await org("muelle");
    const b1 = await org("barco", dock.id);
    const emp = await person(b1.id, "employee");
    await db.insert(ledgerEntry).values({ muelleOrgId: dock.id, barcoOrgId: b1.id, chargeKind: "venta_propia", grossCents: 1000, summumFeeCents: 100, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` });
    expect(await asUser(emp, "select id from ledger_entry")).toEqual([]);
  });

  it("WHEN un dueño del muelle consulta THE SYSTEM SHALL ver las filas de todos sus barcos", async () => {
    const dock = await org("muelle");
    const b1 = await org("barco", dock.id);
    const dockOwner = await person(dock.id, "owner");
    await db.insert(ledgerEntry).values({ muelleOrgId: dock.id, barcoOrgId: b1.id, chargeKind: "membresia", grossCents: 50000, summumFeeCents: 50000, currency: "mxn", stripeObjectId: `in_${crypto.randomUUID()}` });
    expect(await asUser(dockOwner, "select id from ledger_entry")).toHaveLength(1);
  });

  it("WHEN cualquier authenticated consulta fee_rate de un muelle ajeno THE SYSTEM SHALL devolver vacío", async () => {
    const dock = await org("muelle");
    const stranger = await person((await org("barco", dock.id)).id, "owner");
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 500 });
    expect(await asUser(stranger, "select id from fee_rate")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/improvement test tests/muelle-schema.test.ts`
Expected: FAIL — `feeRate` / `ledgerEntry` no exportados por `@jotapuntoce/db/schema`.

- [ ] **Step 3: Write the schema**

En `packages/db/src/schema.ts`, agregar a los imports de `drizzle-orm/pg-core`: `bigint`, `unique`, `type AnyPgColumn`. Reemplazar `organization` por:

```ts
export const organization = pgTable(
  "organization",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    slogan: text("slogan"),
    accentColor: text("accent_color"),
    industry: text("industry"),
    sectionLabels: jsonb("section_labels").notNull().default(sql`'{}'::jsonb`),
    evolutionLevel: integer("evolution_level").notNull().default(0),
    // Summum es el muelle; cada Improvement es un barco. Un barco con parent_org_id nulo existe
    // pero no está colgado de ningún muelle todavía (no cobra). El muelle nunca tiene padre.
    kind: text("kind", { enum: ["muelle", "barco"] }).notNull().default("barco"),
    parentOrgId: uuid("parent_org_id").references((): AnyPgColumn => organization.id, { onDelete: "restrict" }),
    // Nivel de membresía que el barco paga a su muelle. null = sin membresía activa.
    membershipPlanId: uuid("membership_plan_id").references((): AnyPgColumn => membershipPlan.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_organization_parent_org_id").on(t.parentOrgId),
    check("organization_kind_check", sql`${t.kind} in ('muelle','barco')`),
    check("organization_muelle_sin_padre", sql`${t.kind} <> 'muelle' or ${t.parentOrgId} is null`),
  ],
);
```

(Conservar los comentarios existentes de cada columna previa tal cual están hoy.)

Al final del archivo:

```ts
// ── El casco del muelle (spec 2026-10-19). Dinero en centavos enteros, tasas en puntos base. ──
export const CHARGE_KINDS = ["membresia", "venta_propia", "proyecto_summum"] as const;
export const FEE_CHARGE_KINDS = ["venta_propia", "proyecto_summum"] as const;

export const membershipPlan = pgTable(
  "membership_plan",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    monthlyAmountCents: integer("monthly_amount_cents").notNull(),
    currency: text("currency").notNull().default("mxn"),
    stripePriceId: text("stripe_price_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_membership_plan_muelle").on(t.muelleOrgId),
    check("membership_plan_amount_positive", sql`${t.monthlyAmountCents} > 0`),
  ],
);

// La cuenta conectada del barco (cobra a sus clientes) y su cliente en la plataforma (paga su
// membresía). Las tres banderas solo las escribe el webhook account.updated.
export const stripeAccount = pgTable("stripe_account", {
  id: id(),
  orgId: uuid("org_id").notNull().unique().references(() => organization.id, { onDelete: "cascade" }),
  stripeAccountId: text("stripe_account_id").unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  detailsSubmitted: boolean("details_submitted").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// barco_org_id null = tasa de fábrica del muelle; lleno = personalizada de ese barco.
export const feeRate = pgTable(
  "fee_rate",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    barcoOrgId: uuid("barco_org_id").references(() => organization.id, { onDelete: "cascade" }),
    chargeKind: text("charge_kind", { enum: FEE_CHARGE_KINDS }).notNull(),
    percentBps: integer("percent_bps").notNull(),
    fixedCents: integer("fixed_cents").notNull().default(0),
    currency: text("currency").notNull().default("mxn"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_fee_rate_scope").on(t.muelleOrgId, t.barcoOrgId, t.chargeKind).nullsNotDistinct(),
    check("fee_rate_kind_check", sql`${t.chargeKind} in ('venta_propia','proyecto_summum')`),
    check("fee_rate_bps_range", sql`${t.percentBps} between 0 and 10000`),
    check("fee_rate_fixed_nonneg", sql`${t.fixedCents} >= 0`),
  ],
);

// Firma de los dos: un dueño propone, OTRO decide. Nunca se borra; queda como bitácora.
export const feeRateChange = pgTable(
  "fee_rate_change",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    barcoOrgId: uuid("barco_org_id").references(() => organization.id, { onDelete: "cascade" }),
    chargeKind: text("charge_kind", { enum: FEE_CHARGE_KINDS }).notNull(),
    percentBps: integer("percent_bps").notNull(),
    fixedCents: integer("fixed_cents").notNull().default(0),
    proposedBy: uuid("proposed_by").notNull().references(() => profile.id),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().default(sql`now()`),
    decidedBy: uuid("decided_by").references(() => profile.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decision: text("decision", { enum: ["aprobado", "rechazado"] }),
  },
  (t) => [
    index("idx_fee_rate_change_muelle").on(t.muelleOrgId),
    check("fee_rate_change_kind_check", sql`${t.chargeKind} in ('venta_propia','proyecto_summum')`),
    check("fee_rate_change_bps_range", sql`${t.percentBps} between 0 and 10000`),
    check("fee_rate_change_otra_firma", sql`${t.decidedBy} is null or ${t.decidedBy} <> ${t.proposedBy}`),
    check("fee_rate_change_decision_check", sql`${t.decision} is null or ${t.decision} in ('aprobado','rechazado')`),
  ],
);

// Solo se insertan filas, y solo desde el webhook de Stripe. stripe_object_id único = idempotencia.
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: id(),
    muelleOrgId: uuid("muelle_org_id").notNull().references(() => organization.id, { onDelete: "restrict" }),
    barcoOrgId: uuid("barco_org_id").notNull().references(() => organization.id, { onDelete: "restrict" }),
    chargeKind: text("charge_kind", { enum: CHARGE_KINDS }).notNull(),
    grossCents: bigint("gross_cents", { mode: "number" }).notNull(),
    summumFeeCents: bigint("summum_fee_cents", { mode: "number" }).notNull(),
    appliedPercentBps: integer("applied_percent_bps"),
    appliedFixedCents: integer("applied_fixed_cents"),
    currency: text("currency").notNull(),
    stripeObjectId: text("stripe_object_id").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_ledger_entry_muelle_created").on(t.muelleOrgId, t.createdAt),
    index("idx_ledger_entry_barco_created").on(t.barcoOrgId, t.createdAt),
    check("ledger_entry_kind_check", sql`${t.chargeKind} in ('membresia','venta_propia','proyecto_summum')`),
    check("ledger_entry_fee_le_gross", sql`${t.summumFeeCents} between 0 and ${t.grossCents}`),
  ],
);
```

Nota: el `afterEach` del test borra `ledger_entry` antes que las organizaciones porque su FK es `restrict`.

- [ ] **Step 4: Generate the DDL migration**

Run: `pnpm db:generate`
Expected: un archivo nuevo `packages/db/migrations/00NN_*.sql` con `ALTER TABLE "organization" ADD COLUMN "kind"…` y los `CREATE TABLE` de las 5 tablas. Revisarlo (no editarlo).

- [ ] **Step 5: Create the RLS migration**

Run: `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name muelle_rls`
Escribir en el archivo vacío generado:

```sql
-- RLS del casco del muelle (spec 2026-10-19). Solo SELECT: toda escritura pasa por apps/summum con
-- el cliente `db` (rol dueño, bypasea RLS). Ninguna fila se escribe desde el rol authenticated.

alter table membership_plan enable row level security;
alter table stripe_account enable row level security;
alter table fee_rate enable row level security;
alter table fee_rate_change enable row level security;
alter table ledger_entry enable row level security;

-- Dueños del muelle: todo lo de su muelle.
create policy "dock owners read plans" on membership_plan for select using (exists (
  select 1 from membership m where m.org_id = membership_plan.muelle_org_id and m.user_id = auth.uid() and m.role = 'owner'));
create policy "dock owners read fee rates" on fee_rate for select using (exists (
  select 1 from membership m where m.org_id = fee_rate.muelle_org_id and m.user_id = auth.uid() and m.role = 'owner'));
create policy "dock owners read fee changes" on fee_rate_change for select using (exists (
  select 1 from membership m where m.org_id = fee_rate_change.muelle_org_id and m.user_id = auth.uid() and m.role = 'owner'));

-- Libro: dueño del muelle o dueño de ESE barco. Un empleado no ve dinero.
create policy "dock or boat owners read ledger" on ledger_entry for select using (exists (
  select 1 from membership m where m.user_id = auth.uid() and m.role = 'owner'
    and m.org_id in (ledger_entry.muelle_org_id, ledger_entry.barco_org_id)));

-- Cuenta Stripe: dueño del barco o dueño de su muelle.
create policy "dock or boat owners read stripe account" on stripe_account for select using (exists (
  select 1 from organization o join membership m on m.user_id = auth.uid() and m.role = 'owner'
  where o.id = stripe_account.org_id and m.org_id in (o.id, o.parent_org_id)));

grant select on membership_plan, stripe_account, fee_rate, fee_rate_change, ledger_entry to authenticated;
```

- [ ] **Step 6: Apply migrations**

Run: `pnpm db:migrate`
Expected: termina sin error.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @jotapuntoce/improvement test tests/muelle-schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 8: Run the gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: verde (las pruebas existentes siguen pasando: `kind` tiene default).

```bash
git add packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/muelle-schema.test.ts
git commit -m "feat(db): el muelle y sus barcos, comisiones y libro contable con RLS"
```

---

### Task 2: Crear el muelle y colgar barcos

**Files:**
- Create: `packages/db/src/muelle.ts`
- Modify: `package.json` (raíz, `scripts`)
- Create: `apps/admin/lib/muelle.js`
- Modify: `apps/admin/app/company-requests/actions.js:36-39`, `apps/admin/app/clientes/actions.js:201`
- Test: `apps/admin/tests/company-requests.test.js` (agregar casos)

**Interfaces:**
- Consumes: `organization.kind`, `organization.parentOrgId` (Task 1).
- Produces: `findDockOfOwner(tx, userId): Promise<string | null>` en `apps/admin/lib/muelle.js`. Comando `pnpm db:muelle "<nombre>" <correo-dueño> [<correo-dueño>…] [--adoptar-barcos]`.

- [ ] **Step 1: Write the failing test**

Agregar al final de `apps/admin/tests/company-requests.test.js` (reusar sus helpers de alta/borrado existentes; si el archivo crea perfiles con otro nombre de helper, usar ese):

```js
import { organization as orgTable, membership as memTable } from "@jotapuntoce/db/schema";

describe("approveCompanyRequest — muelle", () => {
  it("WHEN quien aprueba es dueño de exactamente un muelle THE SYSTEM SHALL colgar el barco nuevo de él", async () => {
    const adminId = await makeProfile(); // helper existente del archivo
    const [dock] = await db.insert(orgTable).values({ name: "muelle-t", slug: `muelle-t-${Date.now()}`, kind: "muelle" }).returning();
    createdOrgIds.push(dock.id);
    await db.insert(memTable).values({ userId: adminId, orgId: dock.id, role: "owner", acceptedAt: new Date() });
    const request = await makeRequest(); // helper existente del archivo
    const newOrg = await approveCompanyRequest(request.id, adminId);
    createdOrgIds.push(newOrg.id);
    expect(newOrg.kind).toBe("barco");
    expect(newOrg.parentOrgId).toBe(dock.id);
  });

  it("WHEN quien aprueba no es dueño de ningún muelle THE SYSTEM SHALL dejar el barco sin muelle", async () => {
    const adminId = await makeProfile();
    const request = await makeRequest();
    const newOrg = await approveCompanyRequest(request.id, adminId);
    createdOrgIds.push(newOrg.id);
    expect(newOrg.parentOrgId).toBeNull();
  });
});
```

Si el archivo no tiene `makeProfile`/`makeRequest`/`createdOrgIds`, crearlos arriba del bloque con el mismo patrón que `apps/improvement/tests/company-requests.test.ts` (insert de `profile` con `crypto.randomUUID()`, insert de `companyRequest` en `pending`, limpieza en `afterEach`, borrando primero los `organization` hijos y después el muelle).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/admin test tests/company-requests.test.js`
Expected: FAIL — `parentOrgId` es `null` en el primer caso.

- [ ] **Step 3: Implement**

`apps/admin/lib/muelle.js`:

```js
// El muelle al que se cuelga un barco nuevo: el ÚNICO muelle del que quien aprueba es dueño. Con
// cero o más de uno, null — el barco queda sin muelle y se cuelga con `pnpm db:muelle`, nunca a
// ciegas en el muelle equivocado. Por rol y por dato, nunca por id literal (motor genérico).
import { and, eq } from "drizzle-orm";
import { membership, organization } from "@jotapuntoce/db/schema";

/** @param {any} tx @param {string} userId @returns {Promise<string | null>} */
export async function findDockOfOwner(tx, userId) {
  const rows = await tx
    .select({ id: organization.id })
    .from(organization)
    .innerJoin(membership, eq(membership.orgId, organization.id))
    .where(and(eq(organization.kind, "muelle"), eq(membership.userId, userId), eq(membership.role, "owner")))
    .limit(2);
  return rows.length === 1 ? rows[0].id : null;
}
```

En `apps/admin/app/company-requests/actions.js`, importar `import { findDockOfOwner } from "../../lib/muelle.js";` y cambiar el insert:

```js
    const parentOrgId = await findDockOfOwner(tx, adminId);
    const [newOrg] = await tx
      .insert(organization)
      .values({ name: request.companyName, slug, industry: request.industry, kind: "barco", parentOrgId })
      .returning();
```

En `apps/admin/app/clientes/actions.js:201`, mismo import (`"../../lib/muelle.js"`) y, usando el id del admin que esa función ya recibe (leer la firma de la función que contiene la línea 201 y usar su parámetro de admin):

```js
    const parentOrgId = await findDockOfOwner(tx, adminId);
    const [newOrg] = await tx.insert(organization).values({ name: prospect.name, slug, kind: "barco", parentOrgId }).returning();
```

- [ ] **Step 4: Write the CLI**

`packages/db/src/muelle.ts`:

```ts
// Crea un muelle (empresa padre) y sus dueños, y opcionalmente adopta los barcos huérfanos.
//
// El nombre entra por parámetro, nunca literal: packages/db es motor genérico. Los dueños se buscan
// por correo en `profile` y deben existir (que hayan entrado una vez a Improvement o a Summum).
//
// Uso:
//   pnpm db:muelle "<nombre>" <correo> [<correo>…] [--adoptar-barcos]
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { membership, organization, profile } from "./schema.ts";

process.loadEnvFile(".env.local");

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const adopt = args.includes("--adoptar-barcos");
  const [name, ...emails] = args.filter((a) => !a.startsWith("--"));
  if (!name || emails.length === 0) fail('Uso: pnpm db:muelle "<nombre>" <correo> [<correo>…] [--adoptar-barcos]');

  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) fail("DATABASE_URL_DIRECT no está definida — este script nunca usa el pooler.");
  const sql = postgres(url, { prepare: false });
  const db = drizzle(sql);

  try {
    const owners = await db.select({ id: profile.id, email: profile.email }).from(profile).where(inArray(profile.email, emails));
    const missing = emails.filter((e) => !owners.some((o) => o.email === e));
    if (missing.length) fail(`No existe perfil para: ${missing.join(", ")}`);

    const slug = `${name.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")}-muelle`;
    await db.transaction(async (tx) => {
      const [dock] = await tx.insert(organization).values({ name, slug, kind: "muelle" }).returning();
      if (!dock) throw new Error("insert de muelle no devolvió fila");
      await tx.insert(membership).values(owners.map((o) => ({ userId: o.id, orgId: dock.id, role: "owner", acceptedAt: new Date() })));
      if (adopt) {
        const adopted = await tx
          .update(organization)
          .set({ parentOrgId: dock.id })
          .where(and(eq(organization.kind, "barco"), isNull(organization.parentOrgId)))
          .returning({ id: organization.id });
        console.log(`  ${adopted.length} barcos colgados del muelle.`);
      }
      console.log(`  Muelle "${name}" creado (${dock.id}) con ${owners.length} dueños.`);
    });
  } finally {
    await sql.end();
  }
}

main();
```

En `package.json` raíz, `scripts`, agregar: `"db:muelle": "node --experimental-strip-types packages/db/src/muelle.ts"`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @jotapuntoce/admin test tests/company-requests.test.js`
Expected: PASS.

- [ ] **Step 6: Gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`

```bash
git add packages/db/src/muelle.ts package.json apps/admin/lib/muelle.js apps/admin/app/company-requests/actions.js apps/admin/app/clientes/actions.js apps/admin/tests/company-requests.test.js
git commit -m "feat(muelle): crear el muelle por CLI y colgar cada barco nuevo de él"
```

---

### Task 3: `apps/summum` — esqueleto, login y guards

**Files:**
- Create: `apps/summum/package.json`, `next.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `postcss.config.mjs`, `next-env.d.ts` (lo genera `next dev`; no se commitea si está en `.gitignore` como en improvement), `tests/setup.ts`
- Create: `apps/summum/lib/env.ts`, `apps/summum/app/layout.tsx`, `apps/summum/app/globals.css`, `apps/summum/app/page.tsx`, `apps/summum/app/login/page.tsx`, `apps/summum/app/login/LoginForm.tsx`
- Create: `apps/summum/server/auth/guard.ts`
- Modify: `package.json` raíz (`dev:summum`), `turbo.json` (`globalEnv`), `.env.example`
- Test: `apps/summum/tests/guard.test.ts`

**Interfaces:**
- Produces (guard.ts):
  - `getSessionUserId(): Promise<string | null>` (cookie `sum-access-token`)
  - `assertDockOwner(userId: string, muelleId: string): Promise<{ userId: string; muelleId: string }>` (404 si no)
  - `requireDockOwnership(muelleId: string): Promise<{ userId: string; muelleId: string }>`
  - `assertBarcoOwner(userId: string, barcoId: string): Promise<{ userId: string; barcoId: string; muelleId: string }>` (404 si no es dueño, si no es barco o si no tiene muelle)
  - `requireBarcoOwnership(barcoId: string)` (misma salida)
  - `listMyDocks(userId: string): Promise<{ id: string; name: string }[]>`
- Produces (env.ts): `env`, `requireEnv(key)` con llaves `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUMMUM_URL`.

- [ ] **Step 1: Scaffold config files**

`apps/summum/package.json`:

```json
{
  "name": "@jotapuntoce/summum",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3300",
    "build": "next build",
    "start": "next start --port 3300",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@jotapuntoce/db": "workspace:*",
    "@jotapuntoce/ui": "workspace:*",
    "@supabase/supabase-js": "^2.112.4",
    "drizzle-orm": "0.45.2",
    "next": "16.3.3",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "stripe": "23.0.0",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@playwright/test": "^1.62.1",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^24",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.5",
    "eslint": "^9",
    "eslint-config-next": "16.3.3",
    "tailwindcss": "^4",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
}
```

`apps/summum/next.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `postcss.config.mjs`, `tests/setup.ts`: copias exactas de los de `apps/improvement` (mismo contenido; `vitest.config.ts` sin cambios, `tests/setup.ts` carga `.env.test`).

`apps/summum/lib/env.ts`:

```ts
// Mismo patrón que apps/improvement/lib/env.ts: todo opcional al importar; requireEnv() la exige
// en el momento de usarla. Las llaves de Stripe solo se leen en server/** y app/api/**.
import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STRIPE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().startsWith("sk_").optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().startsWith("whsec_").optional()),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().startsWith("whsec_").optional()),
  NEXT_PUBLIC_SUMMUM_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

export const env = schema.parse(process.env);

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") throw new Error(`${key} no está configurada — ver .env.example`);
  return value as NonNullable<(typeof env)[K]>;
}
```

Run: `pnpm install`
Expected: instala `stripe@23.0.0`; `pnpm-lock.yaml` cambia.

- [ ] **Step 2: Write the failing guard test**

```ts
// apps/summum/tests/guard.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { assertBarcoOwner, assertDockOwner, listMyDocks } from "../server/auth/guard.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org(kind: "muelle" | "barco", parentOrgId: string | null = null) {
  const [row] = await db.insert(organization).values({ name: `t-${kind}`, slug: `t-${crypto.randomUUID()}`, kind, parentOrgId }).returning();
  if (!row) throw new Error("sin fila");
  orgIds.push(row.id);
  return row;
}
async function person(orgId?: string, role: "owner" | "employee" = "owner") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  if (orgId) await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}

describe("assertDockOwner", () => {
  it("WHEN es dueño del muelle THE SYSTEM SHALL devolverlo", async () => {
    const dock = await org("muelle");
    const u = await person(dock.id);
    await expect(assertDockOwner(u, dock.id)).resolves.toEqual({ userId: u, muelleId: dock.id });
  });
  it("WHEN es dueño de un barco y pide el muelle THE SYSTEM SHALL responder 404", async () => {
    const dock = await org("muelle");
    const boat = await org("barco", dock.id);
    const u = await person(boat.id);
    await expect(assertDockOwner(u, dock.id)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
  it("WHEN es dueño pero la empresa no es muelle THE SYSTEM SHALL responder 404", async () => {
    const boat = await org("barco");
    const u = await person(boat.id);
    await expect(assertDockOwner(u, boat.id)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
  it("WHEN es empleado del muelle THE SYSTEM SHALL responder 404", async () => {
    const dock = await org("muelle");
    const u = await person(dock.id, "employee");
    await expect(assertDockOwner(u, dock.id)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});

describe("assertBarcoOwner", () => {
  it("WHEN es dueño de un barco colgado THE SYSTEM SHALL devolver su muelle", async () => {
    const dock = await org("muelle");
    const boat = await org("barco", dock.id);
    const u = await person(boat.id);
    await expect(assertBarcoOwner(u, boat.id)).resolves.toEqual({ userId: u, barcoId: boat.id, muelleId: dock.id });
  });
  it("WHEN el barco no tiene muelle THE SYSTEM SHALL responder 404", async () => {
    const boat = await org("barco");
    const u = await person(boat.id);
    await expect(assertBarcoOwner(u, boat.id)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});

describe("listMyDocks", () => {
  it("WHEN es dueño de un muelle y de un barco THE SYSTEM SHALL listar solo el muelle", async () => {
    const dock = await org("muelle");
    const boat = await org("barco", dock.id);
    const u = await person(dock.id);
    await db.insert(membership).values({ userId: u, orgId: boat.id, role: "owner", acceptedAt: new Date() });
    expect((await listMyDocks(u)).map((d) => d.id)).toEqual([dock.id]);
  });
});
```

(Antes de escribir el regex, confirmar con qué mensaje lanza `notFound()` en Next 16.3.3 leyendo `apps/improvement/tests/objectives.test.ts`, que ya lo atrapa, y usar exactamente el mismo matcher que ese archivo.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/summum test tests/guard.test.ts`
Expected: FAIL — `../server/auth/guard.ts` no existe.

- [ ] **Step 4: Implement the guard**

```ts
// apps/summum/server/auth/guard.ts
// El único guard de apps/summum. Dos puertas: dueño del MUELLE (panel de Summum) y dueño de un
// BARCO colgado de un muelle (sus acciones de Stripe). Ser dueño del muelle no abre el barco. 404,
// nunca 403. Sesión: misma idea que apps/improvement (cookie con el access token de Supabase).
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization } from "@jotapuntoce/db/schema";
import { env } from "../../lib/env.ts";

export const SESSION_COOKIE = "sum-access-token";

export async function getSessionUserId(): Promise<string | null> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function ownedOrg(userId: string, orgId: string) {
  const [row] = await db
    .select({ id: organization.id, kind: organization.kind, parentOrgId: organization.parentOrgId })
    .from(organization)
    .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId), eq(membership.role, "owner")))
    .where(eq(organization.id, orgId))
    .limit(1);
  return row ?? null;
}

export async function assertDockOwner(userId: string, muelleId: string) {
  const row = await ownedOrg(userId, muelleId);
  if (!row || row.kind !== "muelle") notFound();
  return { userId, muelleId };
}

export async function requireDockOwnership(muelleId: string) {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return assertDockOwner(userId, muelleId);
}

export async function assertBarcoOwner(userId: string, barcoId: string) {
  const row = await ownedOrg(userId, barcoId);
  if (!row || row.kind !== "barco" || !row.parentOrgId) notFound();
  return { userId, barcoId, muelleId: row.parentOrgId };
}

export async function requireBarcoOwnership(barcoId: string) {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return assertBarcoOwner(userId, barcoId);
}

export async function listMyDocks(userId: string) {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId), eq(membership.role, "owner")))
    .where(eq(organization.kind, "muelle"));
}
```

- [ ] **Step 5: Login, layout and home**

`apps/summum/app/login/LoginForm.tsx`: copia de `apps/improvement/app/login/LoginForm.tsx` cambiando solo el nombre de la cookie a `sum-access-token` y el destino tras iniciar sesión a `/` (leer el archivo completo de improvement y replicar su manejo de error y de `next`). `apps/summum/app/login/page.tsx`: copia de la de improvement.

`apps/summum/app/layout.tsx`:

```tsx
import "./globals.css";

export const metadata = { title: "Summum" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

`apps/summum/app/globals.css`: `@import "tailwindcss";` y `@import "@jotapuntoce/ui/tokens.css";` (usar la misma forma de import de tokens que `apps/improvement/app/globals.css`; la paleta propia de Summum llega en la Task 9).

`apps/summum/app/page.tsx`:

```tsx
// Entrada: si es dueño de un muelle, a su panel; si no, al login. Nada que mostrar aquí.
import { redirect } from "next/navigation";
import { getSessionUserId, listMyDocks } from "@/server/auth/guard";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const [dock] = await listMyDocks(userId);
  redirect(dock ? `/muelle/${dock.id}/barcos` : "/login");
}
```

Raíz: `package.json` → `"dev:summum": "turbo run dev --filter=@jotapuntoce/summum"`. `turbo.json` → agregar a `globalEnv`: `"STRIPE_SECRET_KEY"`, `"STRIPE_WEBHOOK_SECRET"`, `"STRIPE_CONNECT_WEBHOOK_SECRET"`, `"NEXT_PUBLIC_SUMMUM_URL"`. `.env.example` → agregar al final:

```
# Stripe (modo de prueba en desarrollo) — dashboard.stripe.com/test/apikeys. Server-only, solo apps/summum.
STRIPE_SECRET_KEY=
# `stripe listen --forward-to localhost:3300/api/stripe/webhook` imprime este secreto. Solo apps/summum.
STRIPE_WEBHOOK_SECRET=
# `stripe listen --forward-connect-to localhost:3300/api/stripe/connect`. Solo apps/summum.
STRIPE_CONNECT_WEBHOOK_SECRET=
# URL pública de apps/summum; apps/improvement la usa para enlazar "Cobros". http://localhost:3300 en dev.
NEXT_PUBLIC_SUMMUM_URL=http://localhost:3300
```

Agregar `NEXT_PUBLIC_SUMMUM_URL` también a `apps/improvement/lib/env.ts` (mismo patrón que `NEXT_PUBLIC_APP_URL`).

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @jotapuntoce/summum test tests/guard.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`

```bash
git add apps/summum package.json pnpm-lock.yaml turbo.json .env.example apps/improvement/lib/env.ts
git commit -m "feat(summum): app del muelle con login y guards de muelle y de barco

stripe 23.0.0: SDK oficial para Connect, suscripciones y verificación de webhooks; Node no lo cubre."
```

---

### Task 4: Comisiones — elegir tasa y calcular (puro)

**Files:**
- Create: `apps/summum/server/fees/rates.ts`
- Test: `apps/summum/tests/rates.test.ts`

**Interfaces:**
- Produces:
  - `type FeeChargeKind = "venta_propia" | "proyecto_summum"`
  - `interface RateRow { barcoOrgId: string | null; chargeKind: FeeChargeKind; percentBps: number; fixedCents: number }`
  - `pickRate(rates: RateRow[], barcoOrgId: string, kind: FeeChargeKind): RateRow | null`
  - `feeCents(grossCents: number, rate: Pick<RateRow, "percentBps" | "fixedCents">): number`

- [ ] **Step 1: Write the failing test**

```ts
// apps/summum/tests/rates.test.ts
import { describe, expect, it } from "vitest";
import { feeCents, pickRate, type RateRow } from "../server/fees/rates.ts";

const B = "barco-1";
const fabrica: RateRow = { barcoOrgId: null, chargeKind: "venta_propia", percentBps: 500, fixedCents: 0 };
const propia: RateRow = { barcoOrgId: B, chargeKind: "venta_propia", percentBps: 300, fixedCents: 200 };
const otroBarco: RateRow = { barcoOrgId: "barco-2", chargeKind: "venta_propia", percentBps: 900, fixedCents: 0 };

describe("pickRate", () => {
  it("WHEN hay personalizada del barco THE SYSTEM SHALL preferirla a la de fábrica", () => {
    expect(pickRate([fabrica, propia, otroBarco], B, "venta_propia")).toBe(propia);
  });
  it("WHEN no hay personalizada THE SYSTEM SHALL usar la de fábrica", () => {
    expect(pickRate([fabrica, otroBarco], B, "venta_propia")).toBe(fabrica);
  });
  it("WHEN no hay tasa para ese tipo THE SYSTEM SHALL devolver null, nunca 0 %", () => {
    expect(pickRate([fabrica, propia], B, "proyecto_summum")).toBeNull();
  });
});

describe("feeCents", () => {
  it("WHEN 25 % de 100.00 MXN THE SYSTEM SHALL dar 2500 centavos", () => {
    expect(feeCents(10_000, { percentBps: 2500, fixedCents: 0 })).toBe(2500);
  });
  it("WHEN porcentaje + fija THE SYSTEM SHALL sumarlas", () => {
    expect(feeCents(10_000, { percentBps: 300, fixedCents: 200 })).toBe(500);
  });
  it("WHEN el resultado tiene fracción de centavo THE SYSTEM SHALL redondear al centavo", () => {
    expect(feeCents(333, { percentBps: 2500, fixedCents: 0 })).toBe(83); // 83.25
    expect(feeCents(1, { percentBps: 5000, fixedCents: 0 })).toBe(1); // 0.5 → 1
  });
  it("WHEN la comisión excede el monto THE SYSTEM SHALL topar al monto", () => {
    expect(feeCents(100, { percentBps: 500, fixedCents: 1000 })).toBe(100);
  });
  it("WHEN el monto es enorme THE SYSTEM SHALL seguir exacto", () => {
    expect(feeCents(9_000_000_000_00, { percentBps: 2000, fixedCents: 0 })).toBe(1_800_000_000_00);
  });
  it("WHEN el monto no es entero positivo THE SYSTEM SHALL lanzar", () => {
    expect(() => feeCents(10.5, { percentBps: 100, fixedCents: 0 })).toThrow();
    expect(() => feeCents(0, { percentBps: 100, fixedCents: 0 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/summum test tests/rates.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implement**

```ts
// apps/summum/server/fees/rates.ts
// Puro: qué tasa aplica y cuánto es la comisión de Summum. La personalizada del barco gana; si no
// hay, la de fábrica; si no hay ninguna, null — el cobro se rechaza, nunca sale con 0 % por omisión.
export type FeeChargeKind = "venta_propia" | "proyecto_summum";

export interface RateRow {
  barcoOrgId: string | null;
  chargeKind: FeeChargeKind;
  percentBps: number;
  fixedCents: number;
}

export function pickRate(rates: RateRow[], barcoOrgId: string, kind: FeeChargeKind): RateRow | null {
  const ofKind = rates.filter((r) => r.chargeKind === kind);
  return ofKind.find((r) => r.barcoOrgId === barcoOrgId) ?? ofKind.find((r) => r.barcoOrgId === null) ?? null;
}

export function feeCents(grossCents: number, rate: Pick<RateRow, "percentBps" | "fixedCents">): number {
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) throw new Error("El monto debe ser centavos enteros positivos.");
  const pct = Math.round((grossCents * rate.percentBps) / 10_000);
  return Math.min(grossCents, pct + rate.fixedCents);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jotapuntoce/summum test tests/rates.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/summum/server/fees/rates.ts apps/summum/tests/rates.test.ts
git commit -m "feat(summum): elegir la tasa del barco y calcular la comisión en centavos"
```

---

### Task 5: Firma de los dos para cambiar comisiones

**Files:**
- Create: `apps/summum/server/fees/changes.ts`
- Test: `apps/summum/tests/fee-changes.test.ts`

**Interfaces:**
- Consumes: `assertDockOwner` (Task 3), `feeRate`, `feeRateChange` (Task 1).
- Produces:
  - `type Result<T> = { ok: true; data: T } | { ok: false; error: string }` (exportado desde `apps/summum/server/result.ts`, creado en esta tarea)
  - `proposeFeeChange(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>>`
  - `decideFeeChange(userId: string, changeId: string, decision: "aprobado" | "rechazado"): Promise<Result<{ id: string }>>`
  - `listRates(muelleId: string): Promise<RateRow[]>`
  - `listPendingChanges(muelleId: string)`: filas de `fee_rate_change` con `decision is null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/summum/tests/fee-changes.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { feeRate, membership, organization, profile } from "@jotapuntoce/db/schema";
import { decideFeeChange, listRates, proposeFeeChange } from "../server/fees/changes.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function dockWithOwners(n: number) {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  if (!dock) throw new Error("sin fila");
  orgIds.push(dock.id);
  const owners: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId: dock.id, role: "owner", acceptedAt: new Date() });
    owners.push(id);
  }
  return { dock, owners };
}

describe("proposeFeeChange", () => {
  it("WHEN el input no es válido THE SYSTEM SHALL rechazarlo sin insertar", async () => {
    const { dock, owners } = await dockWithOwners(1);
    const r = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 20_000 });
    expect(r.ok).toBe(false);
  });
  it("WHEN se propone THE SYSTEM SHALL NO cambiar fee_rate todavía", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const r = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    expect(r.ok).toBe(true);
    expect(await listRates(dock.id)).toEqual([]);
  });
});

describe("decideFeeChange", () => {
  it("WHEN quien decide es quien propuso THE SYSTEM SHALL rechazarlo", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    const r = await decideFeeChange(owners[0]!, p.data.id, "aprobado");
    expect(r).toEqual({ ok: false, error: "Necesita la firma del otro dueño." });
  });
  it("WHEN el otro dueño aprueba THE SYSTEM SHALL escribir la tasa", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 100, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    expect((await decideFeeChange(owners[1]!, p.data.id, "aprobado")).ok).toBe(true);
    expect(await listRates(dock.id)).toEqual([{ barcoOrgId: null, chargeKind: "venta_propia", percentBps: 500, fixedCents: 100 }]);
  });
  it("WHEN se aprueba un cambio sobre una tasa existente THE SYSTEM SHALL actualizarla, no duplicarla", async () => {
    const { dock, owners } = await dockWithOwners(2);
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 300 });
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 700, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    await decideFeeChange(owners[1]!, p.data.id, "aprobado");
    const rows = await db.select().from(feeRate).where(and(eq(feeRate.muelleOrgId, dock.id), isNull(feeRate.barcoOrgId)));
    expect(rows.map((r) => r.percentBps)).toEqual([700]);
  });
  it("WHEN se rechaza THE SYSTEM SHALL no tocar fee_rate", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    expect((await decideFeeChange(owners[1]!, p.data.id, "rechazado")).ok).toBe(true);
    expect(await listRates(dock.id)).toEqual([]);
  });
  it("WHEN ya estaba decidido THE SYSTEM SHALL rechazar decidir otra vez", async () => {
    const { dock, owners } = await dockWithOwners(3);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    await decideFeeChange(owners[1]!, p.data.id, "aprobado");
    expect((await decideFeeChange(owners[2]!, p.data.id, "rechazado")).ok).toBe(false);
  });
  it("WHEN decide alguien que no es dueño del muelle THE SYSTEM SHALL responder 404", async () => {
    const { dock, owners } = await dockWithOwners(1);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    const stranger = crypto.randomUUID();
    await db.insert(profile).values({ id: stranger, email: `${stranger}@example.com` });
    profileIds.push(stranger);
    await expect(decideFeeChange(stranger, p.data.id, "aprobado")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/summum test tests/fee-changes.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implement**

`apps/summum/server/result.ts`:

```ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

`apps/summum/server/fees/changes.ts`:

```ts
// Firma de los dos (decisión de Jose Carlos y Ricardo): un dueño propone, OTRO decide. La base
// también lo exige (check fee_rate_change_otra_firma); aquí se valida antes para dar un error claro.
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { FEE_CHARGE_KINDS, feeRate, feeRateChange, organization } from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";
import type { Result } from "../result.ts";
import type { RateRow } from "./rates.ts";

const proposalSchema = z.object({
  barcoOrgId: z.string().uuid().nullable().default(null),
  chargeKind: z.enum(FEE_CHARGE_KINDS),
  percentBps: z.number().int().min(0).max(10_000),
  fixedCents: z.number().int().min(0).default(0),
});

export async function proposeFeeChange(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertDockOwner(userId, muelleId);
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Tasa inválida: porcentaje entre 0 y 100 %, cuota fija en centavos." };
  if (parsed.data.barcoOrgId) {
    const [boat] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(and(eq(organization.id, parsed.data.barcoOrgId), eq(organization.parentOrgId, muelleId)))
      .limit(1);
    if (!boat) return { ok: false, error: "Ese barco no es de este muelle." };
  }
  const [row] = await db
    .insert(feeRateChange)
    .values({ muelleOrgId: muelleId, ...parsed.data, proposedBy: userId })
    .returning({ id: feeRateChange.id });
  if (!row) throw new Error("insert de fee_rate_change no devolvió fila");
  return { ok: true, data: row };
}

export async function decideFeeChange(
  userId: string,
  changeId: string,
  decision: "aprobado" | "rechazado",
): Promise<Result<{ id: string }>> {
  const [change] = await db.select().from(feeRateChange).where(eq(feeRateChange.id, changeId)).limit(1);
  if (!change) notFound();
  await assertDockOwner(userId, change.muelleOrgId);
  if (change.proposedBy === userId) return { ok: false, error: "Necesita la firma del otro dueño." };
  if (change.decision) return { ok: false, error: "Ese cambio ya se decidió." };

  await db.transaction(async (tx) => {
    await tx
      .update(feeRateChange)
      .set({ decidedBy: userId, decidedAt: new Date(), decision })
      .where(and(eq(feeRateChange.id, changeId), isNull(feeRateChange.decision)));
    if (decision !== "aprobado") return;

    const scope = and(
      eq(feeRate.muelleOrgId, change.muelleOrgId),
      change.barcoOrgId ? eq(feeRate.barcoOrgId, change.barcoOrgId) : isNull(feeRate.barcoOrgId),
      eq(feeRate.chargeKind, change.chargeKind),
    );
    const [existing] = await tx.select({ id: feeRate.id }).from(feeRate).where(scope).limit(1);
    if (existing) {
      await tx
        .update(feeRate)
        .set({ percentBps: change.percentBps, fixedCents: change.fixedCents, updatedAt: new Date() })
        .where(eq(feeRate.id, existing.id));
    } else {
      await tx.insert(feeRate).values({
        muelleOrgId: change.muelleOrgId,
        barcoOrgId: change.barcoOrgId,
        chargeKind: change.chargeKind,
        percentBps: change.percentBps,
        fixedCents: change.fixedCents,
      });
    }
  });
  return { ok: true, data: { id: changeId } };
}

export async function listRates(muelleId: string): Promise<RateRow[]> {
  return db
    .select({ barcoOrgId: feeRate.barcoOrgId, chargeKind: feeRate.chargeKind, percentBps: feeRate.percentBps, fixedCents: feeRate.fixedCents })
    .from(feeRate)
    .where(eq(feeRate.muelleOrgId, muelleId));
}

export async function listPendingChanges(muelleId: string) {
  return db
    .select()
    .from(feeRateChange)
    .where(and(eq(feeRateChange.muelleOrgId, muelleId), isNull(feeRateChange.decision)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jotapuntoce/summum test tests/fee-changes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/summum/server/result.ts apps/summum/server/fees/changes.ts apps/summum/tests/fee-changes.test.ts
git commit -m "feat(summum): cambiar una comisión exige la firma del otro dueño"
```

---

### Task 6: Stripe Connect — cuenta del barco, ligas de cobro y membresía

**Files:**
- Create: `apps/summum/server/stripe/client.ts`, `apps/summum/server/stripe/connect.ts`
- Test: `apps/summum/tests/connect.test.ts`

**Interfaces:**
- Consumes: `assertBarcoOwner`, `assertDockOwner` (Task 3); `listRates` (Task 5); `pickRate`, `feeCents` (Task 4); `Result` (Task 5).
- Produces:
  - `getStripe(): Stripe` (client.ts)
  - `type StripeDeps = { stripe: Pick<Stripe, "accounts" | "accountLinks" | "checkout" | "customers" | "subscriptions">; baseUrl: string }`
  - `startOnboarding(userId: string, barcoId: string, deps: StripeDeps): Promise<Result<{ url: string }>>`
  - `createSaleLink(userId: string, barcoId: string, input: unknown, deps: StripeDeps): Promise<Result<{ url: string }>>`; input `{ amountCents: number; description: string }`, siempre `venta_propia`.
  - `activateMembership(userId: string, muelleId: string, barcoId: string, planId: string, deps: StripeDeps): Promise<Result<{ subscriptionId: string }>>`
  - `SALE_METADATA = z.object({ barco_org_id, muelle_org_id, charge_kind, percent_bps, fixed_cents })`: zod de los metadatos que viajan en el PaymentIntent (lo usa el webhook en la Task 7)

- [ ] **Step 1: Write the failing test** (Stripe falso inyectado: ninguna llamada de red)

```ts
// apps/summum/tests/connect.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { feeRate, membership, membershipPlan, organization, profile, stripeAccount } from "@jotapuntoce/db/schema";
import { activateMembership, createSaleLink, startOnboarding, type StripeDeps } from "../server/stripe/connect.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

function fakeStripe() {
  return {
    accounts: { create: vi.fn(async () => ({ id: `acct_${crypto.randomUUID()}` })) },
    accountLinks: { create: vi.fn(async () => ({ url: "https://connect.stripe.test/onboard" })) },
    checkout: { sessions: { create: vi.fn(async () => ({ url: "https://checkout.stripe.test/s" })) } },
    customers: { create: vi.fn(async () => ({ id: `cus_${crypto.randomUUID()}` })) },
    subscriptions: { create: vi.fn(async () => ({ id: `sub_${crypto.randomUUID()}` })) },
  };
}
const deps = (s: ReturnType<typeof fakeStripe>): StripeDeps => ({ stripe: s as unknown as StripeDeps["stripe"], baseUrl: "http://localhost:3300" });

async function setup() {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const [boat] = await db.insert(organization).values({ name: "b", slug: `b-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
  orgIds.push(dock!.id, boat!.id);
  const mk = async (orgId: string) => {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId, role: "owner", acceptedAt: new Date() });
    return id;
  };
  return { dock: dock!, boat: boat!, dockOwner: await mk(dock!.id), boatOwner: await mk(boat!.id) };
}

describe("startOnboarding", () => {
  it("WHEN el barco no tiene cuenta THE SYSTEM SHALL crearla con controller y devolver el enlace", async () => {
    const { boat, boatOwner } = await setup();
    const s = fakeStripe();
    const r = await startOnboarding(boatOwner, boat.id, deps(s));
    expect(r).toEqual({ ok: true, data: { url: "https://connect.stripe.test/onboard" } });
    expect(s.accounts.create).toHaveBeenCalledWith(expect.objectContaining({
      country: "MX",
      controller: { stripe_dashboard: { type: "express" }, fees: { payer: "application" }, losses: { payments: "application" } },
    }));
    const [row] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, boat.id));
    expect(row?.stripeAccountId).toMatch(/^acct_/);
  });
  it("WHEN ya tiene cuenta THE SYSTEM SHALL reusarla", async () => {
    const { boat, boatOwner } = await setup();
    const s = fakeStripe();
    await startOnboarding(boatOwner, boat.id, deps(s));
    await startOnboarding(boatOwner, boat.id, deps(s));
    expect(s.accounts.create).toHaveBeenCalledTimes(1);
  });
});

describe("createSaleLink", () => {
  it("WHEN la cuenta aún no puede cobrar THE SYSTEM SHALL rechazarlo", async () => {
    const { boat, boatOwner } = await setup();
    await db.insert(stripeAccount).values({ orgId: boat.id, stripeAccountId: `acct_${crypto.randomUUID()}` });
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: 10_000, description: "Servicio" }, deps(fakeStripe()));
    expect(r.ok).toBe(false);
  });
  it("WHEN no hay tasa para venta_propia THE SYSTEM SHALL rechazarlo, nunca cobrar con 0 %", async () => {
    const { boat, boatOwner } = await setup();
    await db.insert(stripeAccount).values({ orgId: boat.id, stripeAccountId: `acct_${crypto.randomUUID()}`, chargesEnabled: true });
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: 10_000, description: "Servicio" }, deps(fakeStripe()));
    expect(r).toEqual({ ok: false, error: "Summum aún no tiene comisión para este tipo de cobro." });
  });
  it("WHEN todo está listo THE SYSTEM SHALL cobrar en la cuenta del barco con application_fee y metadatos", async () => {
    const { dock, boat, boatOwner } = await setup();
    const acct = `acct_${crypto.randomUUID()}`;
    await db.insert(stripeAccount).values({ orgId: boat.id, stripeAccountId: acct, chargesEnabled: true });
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 1000, fixedCents: 0 });
    const s = fakeStripe();
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: 10_000, description: "Servicio" }, deps(s));
    expect(r).toEqual({ ok: true, data: { url: "https://checkout.stripe.test/s" } });
    const [params, opts] = s.checkout.sessions.create.mock.calls[0] as unknown as [Record<string, any>, Record<string, any>];
    expect(opts).toEqual({ stripeAccount: acct });
    expect(params.payment_intent_data.application_fee_amount).toBe(1000);
    expect(params.payment_intent_data.metadata).toEqual({
      barco_org_id: boat.id, muelle_org_id: dock.id, charge_kind: "venta_propia", percent_bps: "1000", fixed_cents: "0",
    });
  });
  it("WHEN el monto no es entero positivo THE SYSTEM SHALL rechazarlo", async () => {
    const { boat, boatOwner } = await setup();
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: -5, description: "x" }, deps(fakeStripe()));
    expect(r.ok).toBe(false);
  });
});

describe("activateMembership", () => {
  it("WHEN el dueño del muelle activa un nivel THE SYSTEM SHALL suscribir al barco y guardar su nivel", async () => {
    const { dock, boat, dockOwner } = await setup();
    const [plan] = await db.insert(membershipPlan).values({ muelleOrgId: dock.id, name: "Base", monthlyAmountCents: 50_000, stripePriceId: "price_test" }).returning();
    const s = fakeStripe();
    const r = await activateMembership(dockOwner, dock.id, boat.id, plan!.id, deps(s));
    expect(r.ok).toBe(true);
    expect(s.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ price: "price_test" }], collection_method: "send_invoice", days_until_due: 7,
    }));
    const [org] = await db.select().from(organization).where(eq(organization.id, boat.id));
    expect(org?.membershipPlanId).toBe(plan!.id);
  });
  it("WHEN el barco es de otro muelle THE SYSTEM SHALL rechazarlo", async () => {
    const a = await setup();
    const b = await setup();
    const [plan] = await db.insert(membershipPlan).values({ muelleOrgId: a.dock.id, name: "Base", monthlyAmountCents: 50_000, stripePriceId: "price_test" }).returning();
    const r = await activateMembership(a.dockOwner, a.dock.id, b.boat.id, plan!.id, deps(fakeStripe()));
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/summum test tests/connect.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implement**

`apps/summum/server/stripe/client.ts`:

```ts
// La única instancia de Stripe. Sin apiVersion explícita: usa la que fija el SDK 23.0.0.
import Stripe from "stripe";
import { requireEnv } from "../../lib/env.ts";

let instance: Stripe | null = null;

export function getStripe(): Stripe {
  instance ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return instance;
}
```

`apps/summum/server/stripe/connect.ts`:

```ts
// Las acciones de Stripe del casco. Todas reciben Stripe por parámetro (StripeDeps) para poder
// probarlas sin red; las rutas pasan getStripe(). El dinero de las ventas cae en la cuenta del
// barco: Summum solo toma su application_fee (spec: Summum no retiene dinero).
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { membership, membershipPlan, organization, profile, stripeAccount } from "@jotapuntoce/db/schema";
import { assertBarcoOwner, assertDockOwner } from "../auth/guard.ts";
import { listRates } from "../fees/changes.ts";
import { feeCents, pickRate } from "../fees/rates.ts";
import type { Result } from "../result.ts";

export type StripeDeps = {
  stripe: Pick<Stripe, "accounts" | "accountLinks" | "checkout" | "customers" | "subscriptions">;
  baseUrl: string;
};

export const SALE_METADATA = z.object({
  barco_org_id: z.string().uuid(),
  muelle_org_id: z.string().uuid(),
  charge_kind: z.enum(["venta_propia", "proyecto_summum"]),
  percent_bps: z.coerce.number().int(),
  fixed_cents: z.coerce.number().int(),
});

async function accountRow(orgId: string) {
  const [row] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, orgId)).limit(1);
  return row ?? null;
}

export async function startOnboarding(userId: string, barcoId: string, deps: StripeDeps): Promise<Result<{ url: string }>> {
  await assertBarcoOwner(userId, barcoId);
  let row = await accountRow(barcoId);
  if (!row?.stripeAccountId) {
    const account = await deps.stripe.accounts.create({
      country: "MX",
      controller: { stripe_dashboard: { type: "express" }, fees: { payer: "application" }, losses: { payments: "application" } },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { barco_org_id: barcoId },
    });
    [row] = await db
      .insert(stripeAccount)
      .values({ orgId: barcoId, stripeAccountId: account.id })
      .onConflictDoUpdate({ target: stripeAccount.orgId, set: { stripeAccountId: account.id, updatedAt: new Date() } })
      .returning();
  }
  const link = await deps.stripe.accountLinks.create({
    account: row!.stripeAccountId!,
    type: "account_onboarding",
    refresh_url: `${deps.baseUrl}/barco/${barcoId}`,
    return_url: `${deps.baseUrl}/barco/${barcoId}`,
  });
  return { ok: true, data: { url: link.url } };
}

const saleSchema = z.object({
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
});

export async function createSaleLink(userId: string, barcoId: string, input: unknown, deps: StripeDeps): Promise<Result<{ url: string }>> {
  const { muelleId } = await assertBarcoOwner(userId, barcoId);
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Monto en centavos enteros positivos y una descripción." };
  const row = await accountRow(barcoId);
  if (!row?.stripeAccountId || !row.chargesEnabled) return { ok: false, error: "Tu cuenta de cobro aún no está verificada." };

  const rate = pickRate(await listRates(muelleId), barcoId, "venta_propia");
  if (!rate) return { ok: false, error: "Summum aún no tiene comisión para este tipo de cobro." };

  const fee = feeCents(parsed.data.amountCents, rate);
  const session = await deps.stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "mxn", unit_amount: parsed.data.amountCents, product_data: { name: parsed.data.description } } }],
      payment_intent_data: {
        application_fee_amount: fee,
        metadata: {
          barco_org_id: barcoId,
          muelle_org_id: muelleId,
          charge_kind: "venta_propia",
          percent_bps: String(rate.percentBps),
          fixed_cents: String(rate.fixedCents),
        },
      },
      success_url: `${deps.baseUrl}/barco/${barcoId}?cobro=ok`,
      cancel_url: `${deps.baseUrl}/barco/${barcoId}`,
    },
    { stripeAccount: row.stripeAccountId },
  );
  if (!session.url) return { ok: false, error: "Stripe no devolvió la liga de cobro." };
  return { ok: true, data: { url: session.url } };
}

export async function activateMembership(
  userId: string,
  muelleId: string,
  barcoId: string,
  planId: string,
  deps: StripeDeps,
): Promise<Result<{ subscriptionId: string }>> {
  await assertDockOwner(userId, muelleId);
  const [boat] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(eq(organization.id, barcoId), eq(organization.parentOrgId, muelleId)))
    .limit(1);
  if (!boat) return { ok: false, error: "Ese barco no es de este muelle." };
  const [plan] = await db
    .select()
    .from(membershipPlan)
    .where(and(eq(membershipPlan.id, planId), eq(membershipPlan.muelleOrgId, muelleId)))
    .limit(1);
  if (!plan) return { ok: false, error: "Ese nivel no existe en este muelle." };

  let row = await accountRow(barcoId);
  if (!row?.stripeCustomerId) {
    const [owner] = await db
      .select({ email: profile.email })
      .from(membership)
      .innerJoin(profile, eq(profile.id, membership.userId))
      .where(and(eq(membership.orgId, barcoId), eq(membership.role, "owner")))
      .limit(1);
    const customer = await deps.stripe.customers.create({ email: owner?.email, metadata: { barco_org_id: barcoId } });
    [row] = await db
      .insert(stripeAccount)
      .values({ orgId: barcoId, stripeCustomerId: customer.id })
      .onConflictDoUpdate({ target: stripeAccount.orgId, set: { stripeCustomerId: customer.id, updatedAt: new Date() } })
      .returning();
  }
  const sub = await deps.stripe.subscriptions.create({
    customer: row!.stripeCustomerId!,
    items: [{ price: plan.stripePriceId }],
    collection_method: "send_invoice",
    days_until_due: 7,
    metadata: { barco_org_id: barcoId, muelle_org_id: muelleId },
  });
  await db.update(organization).set({ membershipPlanId: plan.id, updatedAt: new Date() }).where(eq(organization.id, barcoId));
  return { ok: true, data: { subscriptionId: sub.id } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jotapuntoce/summum test tests/connect.test.ts`
Expected: PASS (8 tests). Si `tsc` marca el tipo de `controller` o de `capabilities`, revisar los tipos en `node_modules/stripe/types/AccountsResource.d.ts` (versión 23.0.0) y ajustar solo los nombres de campo; no cambiar la semántica.

- [ ] **Step 5: Commit**

```bash
git add apps/summum/server/stripe apps/summum/tests/connect.test.ts
git commit -m "feat(summum): cuenta Connect del barco, ligas de cobro con comisión y membresía por suscripción"
```

---

### Task 7: Webhook — el único escritor del libro

**Files:**
- Create: `apps/summum/server/stripe/webhook.ts`
- Create: `apps/summum/app/api/stripe/webhook/route.ts`, `apps/summum/app/api/stripe/connect/route.ts`
- Test: `apps/summum/tests/webhook.test.ts`

**Interfaces:**
- Consumes: `SALE_METADATA` (Task 6), `getStripe` (Task 6), tablas de la Task 1.
- Produces:
  - `handleStripeEvent(event: Stripe.Event): Promise<{ wrote: boolean }>`
  - `verifyEvent(rawBody: string, signature: string | null, secret: string): Stripe.Event | null` (null si la firma no cuadra)
  - `POST` en ambas rutas: 400 sin firma válida; 200 en cualquier otro caso.

- [ ] **Step 1: Write the failing test**

```ts
// apps/summum/tests/webhook.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, organization, payment, stripeAccount } from "@jotapuntoce/db/schema";
import { handleStripeEvent, verifyEvent } from "../server/stripe/webhook.ts";

const orgIds: string[] = [];
afterEach(async () => {
  await db.delete(ledgerEntry).where(sql`${ledgerEntry.barcoOrgId} = any(${orgIds})`);
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

async function boatWithAccount(flags: Partial<{ chargesEnabled: boolean }> = {}) {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const [boat] = await db.insert(organization).values({ name: "b", slug: `b-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
  orgIds.push(dock!.id, boat!.id);
  const acct = `acct_${crypto.randomUUID()}`;
  const cus = `cus_${crypto.randomUUID()}`;
  await db.insert(stripeAccount).values({ orgId: boat!.id, stripeAccountId: acct, stripeCustomerId: cus, ...flags });
  return { dock: dock!, boat: boat!, acct, cus };
}

const ev = (type: string, object: object, account?: string) =>
  ({ id: `evt_${crypto.randomUUID()}`, type, account, data: { object } }) as unknown as Stripe.Event;

describe("verifyEvent", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", object: "event", type: "account.updated", data: { object: {} } });
  it("WHEN la firma es válida THE SYSTEM SHALL devolver el evento", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    expect(verifyEvent(body, header, secret)?.id).toBe("evt_1");
  });
  it("WHEN la firma no cuadra o falta THE SYSTEM SHALL devolver null", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_otro" });
    expect(verifyEvent(body, header, secret)).toBeNull();
    expect(verifyEvent(body, null, secret)).toBeNull();
  });
});

describe("account.updated", () => {
  it("WHEN Stripe habilita la cuenta THE SYSTEM SHALL copiar las tres banderas", async () => {
    const { boat, acct } = await boatWithAccount();
    await handleStripeEvent(ev("account.updated", { id: acct, charges_enabled: true, payouts_enabled: true, details_submitted: true }, acct));
    const [row] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, boat.id));
    expect([row?.chargesEnabled, row?.payoutsEnabled, row?.detailsSubmitted]).toEqual([true, true, true]);
  });
});

describe("payment_intent.succeeded", () => {
  const pi = (id: string, acct: string, boatId: string, dockId: string) => ({
    id, amount_received: 10_000, application_fee_amount: 1000, currency: "mxn",
    metadata: { barco_org_id: boatId, muelle_org_id: dockId, charge_kind: "venta_propia", percent_bps: "1000", fixed_cents: "0" },
  });
  it("WHEN llega un cobro del barco THE SYSTEM SHALL escribir una fila con su comisión", async () => {
    const { dock, boat, acct } = await boatWithAccount();
    const id = `pi_${crypto.randomUUID()}`;
    expect(await handleStripeEvent(ev("payment_intent.succeeded", pi(id, acct, boat.id, dock.id), acct))).toEqual({ wrote: true });
    const [row] = await db.select().from(ledgerEntry).where(eq(ledgerEntry.stripeObjectId, id));
    expect(row).toMatchObject({ barcoOrgId: boat.id, muelleOrgId: dock.id, grossCents: 10_000, summumFeeCents: 1000, appliedPercentBps: 1000 });
  });
  it("WHEN el mismo evento llega dos veces THE SYSTEM SHALL dejar una sola fila", async () => {
    const { dock, boat, acct } = await boatWithAccount();
    const id = `pi_${crypto.randomUUID()}`;
    await handleStripeEvent(ev("payment_intent.succeeded", pi(id, acct, boat.id, dock.id), acct));
    expect(await handleStripeEvent(ev("payment_intent.succeeded", pi(id, acct, boat.id, dock.id), acct))).toEqual({ wrote: false });
    expect(await db.select().from(ledgerEntry).where(eq(ledgerEntry.stripeObjectId, id))).toHaveLength(1);
  });
  it("WHEN la cuenta del evento no es la del barco de los metadatos THE SYSTEM SHALL no escribir nada", async () => {
    const { dock, boat } = await boatWithAccount();
    const id = `pi_${crypto.randomUUID()}`;
    expect(await handleStripeEvent(ev("payment_intent.succeeded", pi(id, "acct_desconocida", boat.id, dock.id), "acct_desconocida"))).toEqual({ wrote: false });
    expect(await db.select().from(ledgerEntry).where(eq(ledgerEntry.stripeObjectId, id))).toHaveLength(0);
  });
});

describe("invoice.paid", () => {
  it("WHEN se paga la membresía THE SYSTEM SHALL escribir el libro y el pago, una sola vez", async () => {
    const { dock, boat, cus } = await boatWithAccount();
    const id = `in_${crypto.randomUUID()}`;
    const invoice = { id, customer: cus, amount_paid: 50_000, currency: "mxn" };
    await handleStripeEvent(ev("invoice.paid", invoice));
    await handleStripeEvent(ev("invoice.paid", invoice));
    const rows = await db.select().from(ledgerEntry).where(eq(ledgerEntry.stripeObjectId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chargeKind: "membresia", grossCents: 50_000, summumFeeCents: 50_000, muelleOrgId: dock.id });
    const pays = await db.select().from(payment).where(eq(payment.externalRef, id));
    expect(pays).toHaveLength(1);
    expect(pays[0]?.paidAt).not.toBeNull();
    expect(pays[0]?.source).toBe("stripe");
    await db.delete(payment).where(eq(payment.externalRef, id));
    void boat;
  });
  it("WHEN el cliente no es de ningún barco THE SYSTEM SHALL no escribir nada", async () => {
    expect(await handleStripeEvent(ev("invoice.paid", { id: `in_${crypto.randomUUID()}`, customer: "cus_x", amount_paid: 1, currency: "mxn" }))).toEqual({ wrote: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/summum test tests/webhook.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implement the handler**

```ts
// apps/summum/server/stripe/webhook.ts
// El ÚNICO lugar que escribe ledger_entry (spec §3). Idempotente por stripe_object_id único: Stripe
// reintenta, y un segundo aviso del mismo cobro no duplica dinero. Lo desconocido se registra y no
// escribe nada — nunca se inventa un barco.
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, organization, payment, stripeAccount } from "@jotapuntoce/db/schema";
import { SALE_METADATA } from "./connect.ts";

export function verifyEvent(rawBody: string, signature: string | null, secret: string): Stripe.Event | null {
  if (!signature) return null;
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return null;
  }
}

const accountSchema = z.object({ id: z.string(), charges_enabled: z.boolean(), payouts_enabled: z.boolean(), details_submitted: z.boolean() });
const intentSchema = z.object({
  id: z.string(),
  amount_received: z.number().int().positive(),
  application_fee_amount: z.number().int().nonnegative().nullable(),
  currency: z.string(),
  metadata: SALE_METADATA,
});
const invoiceSchema = z.object({ id: z.string(), customer: z.string(), amount_paid: z.number().int().positive(), currency: z.string() });

function skip(reason: string, event: Stripe.Event) {
  console.warn(`[stripe] ${event.type} ${event.id} ignorado: ${reason}`);
  return { wrote: false };
}

export async function handleStripeEvent(event: Stripe.Event): Promise<{ wrote: boolean }> {
  const object = (event.data as { object: unknown }).object;

  if (event.type === "account.updated") {
    const a = accountSchema.safeParse(object);
    if (!a.success) return skip("forma inesperada", event);
    const rows = await db
      .update(stripeAccount)
      .set({ chargesEnabled: a.data.charges_enabled, payoutsEnabled: a.data.payouts_enabled, detailsSubmitted: a.data.details_submitted, updatedAt: new Date() })
      .where(eq(stripeAccount.stripeAccountId, a.data.id))
      .returning({ id: stripeAccount.id });
    return rows.length ? { wrote: true } : skip("cuenta desconocida", event);
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = intentSchema.safeParse(object);
    if (!pi.success) return skip("sin metadatos de Summum", event);
    const m = pi.data.metadata;
    // El aviso llega por Connect con event.account = la cuenta donde se cobró: tiene que ser la del
    // barco que dicen los metadatos y ese barco tiene que colgar de ese muelle.
    const [owner] = await db
      .select({ id: organization.id })
      .from(stripeAccount)
      .innerJoin(organization, eq(organization.id, stripeAccount.orgId))
      .where(and(eq(stripeAccount.orgId, m.barco_org_id), eq(stripeAccount.stripeAccountId, event.account ?? ""), eq(organization.parentOrgId, m.muelle_org_id)))
      .limit(1);
    if (!owner) return skip("la cuenta no corresponde al barco", event);
    const inserted = await db
      .insert(ledgerEntry)
      .values({
        muelleOrgId: m.muelle_org_id,
        barcoOrgId: m.barco_org_id,
        chargeKind: m.charge_kind,
        grossCents: pi.data.amount_received,
        summumFeeCents: pi.data.application_fee_amount ?? 0,
        appliedPercentBps: m.percent_bps,
        appliedFixedCents: m.fixed_cents,
        currency: pi.data.currency,
        stripeObjectId: pi.data.id,
      })
      .onConflictDoNothing({ target: ledgerEntry.stripeObjectId })
      .returning({ id: ledgerEntry.id });
    return { wrote: inserted.length > 0 };
  }

  if (event.type === "invoice.paid") {
    const inv = invoiceSchema.safeParse(object);
    if (!inv.success) return skip("forma inesperada", event);
    const [boat] = await db
      .select({ id: organization.id, muelleId: organization.parentOrgId })
      .from(stripeAccount)
      .innerJoin(organization, eq(organization.id, stripeAccount.orgId))
      .where(eq(stripeAccount.stripeCustomerId, inv.data.customer))
      .limit(1);
    if (!boat?.muelleId) return skip("cliente desconocido", event);
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(ledgerEntry)
        .values({
          muelleOrgId: boat.muelleId!,
          barcoOrgId: boat.id,
          chargeKind: "membresia",
          grossCents: inv.data.amount_paid,
          summumFeeCents: inv.data.amount_paid,
          currency: inv.data.currency,
          stripeObjectId: inv.data.id,
        })
        .onConflictDoNothing({ target: ledgerEntry.stripeObjectId })
        .returning({ id: ledgerEntry.id });
      if (!inserted.length) return { wrote: false };
      await tx.insert(payment).values({
        orgId: boat.id,
        concept: "Membresía Summum",
        amount: (inv.data.amount_paid / 100).toFixed(2),
        currency: inv.data.currency.toUpperCase(),
        dueDate: new Date(),
        paidAt: new Date(),
        source: "stripe",
        externalRef: inv.data.id,
      });
      return { wrote: true };
    });
  }

  return skip("tipo no manejado", event);
}
```

- [ ] **Step 4: Implement the two routes**

`apps/summum/app/api/stripe/webhook/route.ts`:

```ts
// Eventos de la plataforma (invoice.paid de membresías). Firma con STRIPE_WEBHOOK_SECRET.
import { requireEnv } from "@/lib/env";
import { handleStripeEvent, verifyEvent } from "@/server/stripe/webhook";

export async function POST(req: Request) {
  const event = verifyEvent(await req.text(), req.headers.get("stripe-signature"), requireEnv("STRIPE_WEBHOOK_SECRET"));
  if (!event) return new Response("firma inválida", { status: 400 });
  await handleStripeEvent(event);
  return new Response("ok");
}
```

`apps/summum/app/api/stripe/connect/route.ts`: idéntico, con `requireEnv("STRIPE_CONNECT_WEBHOOK_SECRET")` y el comentario "Eventos de cuentas conectadas (account.updated, payment_intent.succeeded de cobros directos)".

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @jotapuntoce/summum test tests/webhook.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`

```bash
git add apps/summum/server/stripe/webhook.ts apps/summum/app/api apps/summum/tests/webhook.test.ts
git commit -m "feat(summum): webhooks de Stripe con firma verificada como única fuente del libro"
```

---

### Task 8: Lecturas del panel — barcos, libro y margen

**Files:**
- Create: `apps/summum/server/money/ledger.ts`, `apps/summum/server/barcos/list.ts`
- Test: `apps/summum/tests/ledger.test.ts`

**Interfaces:**
- Consumes: `assertDockOwner`, `assertBarcoOwner` (Task 3).
- Produces:
  - `summarize(rows: { grossCents: number; summumFeeCents: number }[]): { grossCents: number; feeCents: number; marginBps: number }` (puro; `marginBps` = 0 si no hay movimiento)
  - `listDockLedger(userId: string, muelleId: string, filters?: { barcoOrgId?: string; chargeKind?: "membresia" | "venta_propia" | "proyecto_summum" })` → filas de `ledger_entry` + `barcoName`, más recientes primero, máximo 200
  - `listBarcoLedgerForOwner(userId: string, barcoId: string)` (para `/barco/[orgId]`)
  - `listDockBarcos(userId: string, muelleId: string): Promise<{ id: string; name: string; planName: string | null; chargesEnabled: boolean; payoutsEnabled: boolean }[]>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/summum/tests/ledger.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, membership, organization, profile } from "@jotapuntoce/db/schema";
import { listDockLedger, summarize } from "../server/money/ledger.ts";
import { listDockBarcos } from "../server/barcos/list.ts";

describe("summarize", () => {
  it("WHEN no hay movimientos THE SYSTEM SHALL dar margen 0, no NaN", () => {
    expect(summarize([])).toEqual({ grossCents: 0, feeCents: 0, marginBps: 0 });
  });
  it("WHEN hay movimientos THE SYSTEM SHALL dar comisión ÷ bruto en puntos base", () => {
    expect(summarize([{ grossCents: 10_000, summumFeeCents: 1000 }, { grossCents: 30_000, summumFeeCents: 2000 }]))
      .toEqual({ grossCents: 40_000, feeCents: 3000, marginBps: 750 });
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  await db.delete(ledgerEntry).where(sql`${ledgerEntry.barcoOrgId} = any(${orgIds})`);
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

describe("listDockLedger / listDockBarcos", () => {
  it("WHEN el dueño del muelle filtra por barco THE SYSTEM SHALL devolver solo ese barco, sin barcos de otro muelle", async () => {
    const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    const [other] = await db.insert(organization).values({ name: "m2", slug: `m2-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    const [b1] = await db.insert(organization).values({ name: "b1", slug: `b1-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
    const [b2] = await db.insert(organization).values({ name: "b2", slug: `b2-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
    const [b3] = await db.insert(organization).values({ name: "b3", slug: `b3-${crypto.randomUUID()}`, parentOrgId: other!.id }).returning();
    orgIds.push(dock!.id, other!.id, b1!.id, b2!.id, b3!.id);
    const u = crypto.randomUUID();
    await db.insert(profile).values({ id: u, email: `${u}@example.com` });
    profileIds.push(u);
    await db.insert(membership).values({ userId: u, orgId: dock!.id, role: "owner", acceptedAt: new Date() });
    const row = (barco: string, muelle: string) => ({ muelleOrgId: muelle, barcoOrgId: barco, chargeKind: "venta_propia" as const, grossCents: 100, summumFeeCents: 10, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` });
    await db.insert(ledgerEntry).values([row(b1!.id, dock!.id), row(b2!.id, dock!.id), row(b3!.id, other!.id)]);

    expect((await listDockLedger(u, dock!.id)).map((r) => r.barcoOrgId).sort()).toEqual([b1!.id, b2!.id].sort());
    expect((await listDockLedger(u, dock!.id, { barcoOrgId: b1!.id })).map((r) => r.barcoOrgId)).toEqual([b1!.id]);
    expect((await listDockBarcos(u, dock!.id)).map((b) => b.name).sort()).toEqual(["b1", "b2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/summum test tests/ledger.test.ts`
Expected: FAIL — módulos no existen.

- [ ] **Step 3: Implement**

`apps/summum/server/money/ledger.ts`:

```ts
import { and, desc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, organization } from "@jotapuntoce/db/schema";
import { assertBarcoOwner, assertDockOwner } from "../auth/guard.ts";

type ChargeKind = "membresia" | "venta_propia" | "proyecto_summum";

/** Margen del muelle: lo que gana Summum ÷ lo que se movió (tarjeta "Profit margin" de Whop). */
export function summarize(rows: { grossCents: number; summumFeeCents: number }[]) {
  const grossCents = rows.reduce((s, r) => s + r.grossCents, 0);
  const feeCents = rows.reduce((s, r) => s + r.summumFeeCents, 0);
  return { grossCents, feeCents, marginBps: grossCents === 0 ? 0 : Math.round((feeCents * 10_000) / grossCents) };
}

const columns = {
  id: ledgerEntry.id,
  barcoOrgId: ledgerEntry.barcoOrgId,
  barcoName: organization.name,
  chargeKind: ledgerEntry.chargeKind,
  grossCents: ledgerEntry.grossCents,
  summumFeeCents: ledgerEntry.summumFeeCents,
  currency: ledgerEntry.currency,
  createdAt: ledgerEntry.createdAt,
};

export async function listDockLedger(userId: string, muelleId: string, filters: { barcoOrgId?: string; chargeKind?: ChargeKind } = {}) {
  await assertDockOwner(userId, muelleId);
  return db
    .select(columns)
    .from(ledgerEntry)
    .innerJoin(organization, eq(organization.id, ledgerEntry.barcoOrgId))
    .where(and(
      eq(ledgerEntry.muelleOrgId, muelleId),
      filters.barcoOrgId ? eq(ledgerEntry.barcoOrgId, filters.barcoOrgId) : undefined,
      filters.chargeKind ? eq(ledgerEntry.chargeKind, filters.chargeKind) : undefined,
    ))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(200); // ponytail: sin paginación; agregar cursor cuando un muelle pase de 200 movimientos a la vista
}

export async function listBarcoLedgerForOwner(userId: string, barcoId: string) {
  await assertBarcoOwner(userId, barcoId);
  return db
    .select(columns)
    .from(ledgerEntry)
    .innerJoin(organization, eq(organization.id, ledgerEntry.barcoOrgId))
    .where(eq(ledgerEntry.barcoOrgId, barcoId))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(200);
}
```

`apps/summum/server/barcos/list.ts`:

```ts
// Los barcos de un muelle, solo con datos de nivel muelle: nada de lo interno del barco.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membershipPlan, organization, stripeAccount } from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";

export async function listDockBarcos(userId: string, muelleId: string) {
  await assertDockOwner(userId, muelleId);
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      planName: membershipPlan.name,
      chargesEnabled: stripeAccount.chargesEnabled,
      payoutsEnabled: stripeAccount.payoutsEnabled,
    })
    .from(organization)
    .leftJoin(membershipPlan, eq(membershipPlan.id, organization.membershipPlanId))
    .leftJoin(stripeAccount, eq(stripeAccount.orgId, organization.id))
    .where(eq(organization.parentOrgId, muelleId))
    .orderBy(organization.name);
  return rows.map((r) => ({ ...r, chargesEnabled: r.chargesEnabled ?? false, payoutsEnabled: r.payoutsEnabled ?? false }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jotapuntoce/summum test tests/ledger.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/summum/server/money apps/summum/server/barcos apps/summum/tests/ledger.test.ts
git commit -m "feat(summum): lecturas del libro, margen del muelle y lista de barcos"
```

---

### Task 9: Pantallas de `apps/summum`

**Files:**
- Modify: `packages/ui/src/tokens.css` (bloque de marca Summum), `apps/summum/app/globals.css`
- Create: `apps/summum/app/muelle/[muelleId]/layout.tsx`, `apps/summum/app/muelle/[muelleId]/barcos/page.tsx`, `apps/summum/app/muelle/[muelleId]/comisiones/page.tsx`, `apps/summum/app/muelle/[muelleId]/dinero/page.tsx`, `apps/summum/app/barco/[orgId]/page.tsx`, `apps/summum/components/Money.tsx`

**Interfaces:**
- Consumes: todo lo de las tareas 3–8.
- Produces: rutas `/muelle/[muelleId]/{barcos,comisiones,dinero}` y `/barco/[orgId]`.

- [ ] **Step 1: Paleta de Summum**

Invocar la skill `marca-summum-system` y tomar de ella los colores de fondo, texto, acento y borde. Agregarlos en `packages/ui/src/tokens.css` como un bloque `[data-brand="summum"] { --bg: …; --bg-card: …; --text-primary: …; --text-secondary: …; --accent-1: …; --accent-2: …; --border: …; }` (los mismos nombres de token que ya existen, para que los componentes no cambien). En `apps/summum/app/layout.tsx` poner `<body data-brand="summum">`. Ningún hex fuera de `tokens.css`.

- [ ] **Step 2: Componente de dinero**

```tsx
// apps/summum/components/Money.tsx
const fmt = (currency: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() });

export function Money({ cents, currency = "mxn" }: { cents: number; currency?: string }) {
  return <span style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{fmt(currency).format(cents / 100)}</span>;
}
```

- [ ] **Step 3: Layout del muelle**

```tsx
// apps/summum/app/muelle/[muelleId]/layout.tsx — solo navegación; cada página llama a su guard.
export default async function MuelleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ muelleId: string }> }) {
  const { muelleId } = await params;
  const link = (path: string, label: string) => (
    <a href={`/muelle/${muelleId}/${path}`} style={{ color: "var(--text-primary)", textDecoration: "none" }}>{label}</a>
  );
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "24px" }}>
      <nav style={{ display: "flex", gap: "20px", marginBottom: "24px", fontWeight: 600 }}>
        {link("barcos", "Barcos")}
        {link("comisiones", "Comisiones")}
        {link("dinero", "Dinero")}
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Barcos**

```tsx
// apps/summum/app/muelle/[muelleId]/barcos/page.tsx
import { requireDockOwnership } from "@/server/auth/guard";
import { listDockBarcos } from "@/server/barcos/list";

const estado = (b: { chargesEnabled: boolean; payoutsEnabled: boolean }) =>
  b.payoutsEnabled ? "Cobra y recibe depósitos" : b.chargesEnabled ? "Cobra" : "Sin verificar";

export default async function BarcosPage({ params }: { params: Promise<{ muelleId: string }> }) {
  const { muelleId } = await params;
  const { userId } = await requireDockOwnership(muelleId);
  const barcos = await listDockBarcos(userId, muelleId);
  return (
    <main>
      <h1>Barcos</h1>
      <table>
        <thead><tr><th>Empresa</th><th>Membresía</th><th>Cuenta de cobro</th></tr></thead>
        <tbody>
          {barcos.map((b) => (
            <tr key={b.id}><td>{b.name}</td><td>{b.planName ?? "Sin nivel"}</td><td>{estado(b)}</td></tr>
          ))}
        </tbody>
      </table>
      {barcos.length === 0 && <p>Todavía no hay barcos colgados de este muelle.</p>}
    </main>
  );
}
```

- [ ] **Step 5: Comisiones** (formulario nativo + Server Actions; el botón de aprobar no se dibuja para quien propuso; el servidor lo rechaza igual)

```tsx
// apps/summum/app/muelle/[muelleId]/comisiones/page.tsx
import { revalidatePath } from "next/cache";
import { requireDockOwnership } from "@/server/auth/guard";
import { decideFeeChange, listPendingChanges, listRates, proposeFeeChange } from "@/server/fees/changes";
import { listDockBarcos } from "@/server/barcos/list";

const KIND_LABEL = { venta_propia: "Venta del barco", proyecto_summum: "Proyecto Summum" } as const;
const pct = (bps: number) => `${(bps / 100).toFixed(2)} %`;

export default async function ComisionesPage({ params }: { params: Promise<{ muelleId: string }> }) {
  const { muelleId } = await params;
  const { userId } = await requireDockOwnership(muelleId);
  const [rates, pending, barcos] = await Promise.all([listRates(muelleId), listPendingChanges(muelleId), listDockBarcos(userId, muelleId)]);
  const boatName = (id: string | null) => (id ? barcos.find((b) => b.id === id)?.name ?? "—" : "Todos (de fábrica)");

  async function propose(formData: FormData) {
    "use server";
    const { userId: me } = await requireDockOwnership(muelleId);
    const barco = formData.get("barcoOrgId")?.toString() || null;
    await proposeFeeChange(me, muelleId, {
      barcoOrgId: barco,
      chargeKind: formData.get("chargeKind")?.toString(),
      percentBps: Math.round(Number(formData.get("percent")) * 100),
      fixedCents: Math.round(Number(formData.get("fixed") || 0) * 100),
    });
    revalidatePath(`/muelle/${muelleId}/comisiones`);
  }

  return (
    <main>
      <h1>Comisiones</h1>
      <ul>
        {rates.map((r) => (
          <li key={`${r.barcoOrgId}-${r.chargeKind}`}>{KIND_LABEL[r.chargeKind]} · {boatName(r.barcoOrgId)} · {pct(r.percentBps)} + ${(r.fixedCents / 100).toFixed(2)}</li>
        ))}
        {rates.length === 0 && <li>Sin comisiones todavía: ningún barco puede cobrar hasta que haya una.</li>}
      </ul>

      <h2>Proponer cambio</h2>
      <form action={propose}>
        <select name="chargeKind">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="barcoOrgId"><option value="">Todos (de fábrica)</option>{barcos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <label>% <input name="percent" type="number" step="0.01" min="0" max="100" required /></label>
        <label>Cuota fija $ <input name="fixed" type="number" step="0.01" min="0" defaultValue="0" /></label>
        <button type="submit">Proponer</button>
      </form>

      <h2>Esperando la otra firma</h2>
      <ul>
        {pending.map((c) => {
          async function decide(formData: FormData) {
            "use server";
            const { userId: me } = await requireDockOwnership(muelleId);
            const d = formData.get("decision") === "aprobado" ? "aprobado" : "rechazado";
            await decideFeeChange(me, c.id, d);
            revalidatePath(`/muelle/${muelleId}/comisiones`);
          }
          return (
            <li key={c.id}>
              {KIND_LABEL[c.chargeKind]} · {boatName(c.barcoOrgId)} · {pct(c.percentBps)} + ${(c.fixedCents / 100).toFixed(2)}
              {c.proposedBy === userId ? (
                <em> — propuesta tuya, falta la firma del otro dueño</em>
              ) : (
                <form action={decide} style={{ display: "inline" }}>
                  <button name="decision" value="aprobado">Aprobar</button>
                  <button name="decision" value="rechazado">Rechazar</button>
                </form>
              )}
            </li>
          );
        })}
        {pending.length === 0 && <li>Nada pendiente.</li>}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Dinero**

```tsx
// apps/summum/app/muelle/[muelleId]/dinero/page.tsx
import { requireDockOwnership } from "@/server/auth/guard";
import { listDockLedger, summarize } from "@/server/money/ledger";
import { listDockBarcos } from "@/server/barcos/list";
import { Money } from "@/components/Money";

const KINDS = ["membresia", "venta_propia", "proyecto_summum"] as const;
const KIND_LABEL = { membresia: "Membresía", venta_propia: "Venta del barco", proyecto_summum: "Proyecto Summum" } as const;

export default async function DineroPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ barco?: string; tipo?: string }> }) {
  const { muelleId } = await params;
  const { barco, tipo } = await searchParams;
  const { userId } = await requireDockOwnership(muelleId);
  const chargeKind = KINDS.find((k) => k === tipo);
  const [rows, barcos] = await Promise.all([listDockLedger(userId, muelleId, { barcoOrgId: barco, chargeKind }), listDockBarcos(userId, muelleId)]);
  const s = summarize(rows);
  return (
    <main>
      <h1>Dinero</h1>
      <p>Movido: <Money cents={s.grossCents} /> · Para Summum: <Money cents={s.feeCents} /> · Margen: {(s.marginBps / 100).toFixed(2)} %</p>
      <form>
        <select name="barco" defaultValue={barco ?? ""}><option value="">Todos los barcos</option>{barcos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select name="tipo" defaultValue={chargeKind ?? ""}><option value="">Todos los cobros</option>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <button type="submit">Filtrar</button>
      </form>
      <table>
        <thead><tr><th>Fecha</th><th>Barco</th><th>Tipo</th><th>Monto</th><th>Summum</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.createdAt.toLocaleDateString("es-MX")}</td><td>{r.barcoName}</td><td>{KIND_LABEL[r.chargeKind]}</td>
              <td><Money cents={r.grossCents} currency={r.currency} /></td><td><Money cents={r.summumFeeCents} currency={r.currency} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 7: Página del barco** (conectar cuenta, crear liga de cobro, ver sus movimientos)

```tsx
// apps/summum/app/barco/[orgId]/page.tsx — la parte de Summum que usa el DUEÑO DEL BARCO.
import { redirect } from "next/navigation";
import { requireEnv } from "@/lib/env";
import { requireBarcoOwnership } from "@/server/auth/guard";
import { listBarcoLedgerForOwner } from "@/server/money/ledger";
import { createSaleLink, getAccountStatus, startOnboarding } from "@/server/stripe/connect";
import { getStripe } from "@/server/stripe/client";
import { Money } from "@/components/Money";

export default async function BarcoPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { userId } = await requireBarcoOwnership(orgId);
  const account = await getAccountStatus(userId, orgId);
  const rows = await listBarcoLedgerForOwner(userId, orgId);
  const deps = () => ({ stripe: getStripe(), baseUrl: requireEnv("NEXT_PUBLIC_SUMMUM_URL") });

  async function connect() {
    "use server";
    const { userId: me } = await requireBarcoOwnership(orgId);
    const r = await startOnboarding(me, orgId, deps());
    if (r.ok) redirect(r.data.url);
  }
  async function sale(formData: FormData) {
    "use server";
    const { userId: me } = await requireBarcoOwnership(orgId);
    const r = await createSaleLink(me, orgId, {
      amountCents: Math.round(Number(formData.get("amount")) * 100),
      description: formData.get("description")?.toString() ?? "",
    }, deps());
    if (r.ok) redirect(r.data.url);
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "24px" }}>
      <h1>Cobros</h1>
      {!account?.chargesEnabled ? (
        <form action={connect}><button type="submit">Conectar mi cuenta de cobro</button></form>
      ) : (
        <form action={sale}>
          <input name="description" placeholder="Concepto" required />
          <input name="amount" type="number" step="0.01" min="1" placeholder="Monto MXN" required />
          <button type="submit">Crear liga de cobro</button>
        </form>
      )}
      <table>
        <thead><tr><th>Fecha</th><th>Monto</th><th>Comisión Summum</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{r.createdAt.toLocaleDateString("es-MX")}</td><td><Money cents={r.grossCents} currency={r.currency} /></td><td><Money cents={r.summumFeeCents} currency={r.currency} /></td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

Agregar al final de `apps/summum/server/stripe/connect.ts` (las rutas nunca importan `packages/db`; CLAUDE.md, Boundaries):

```ts
/** Estado de la cuenta de cobro del barco, para su página. null = aún no la conecta. */
export async function getAccountStatus(userId: string, barcoId: string) {
  await assertBarcoOwner(userId, barcoId);
  const row = await accountRow(barcoId);
  return row ? { chargesEnabled: row.chargesEnabled, payoutsEnabled: row.payoutsEnabled } : null;
}
```

- [ ] **Step 8: Verify in the browser**

Iniciar el servidor (agregar en `.claude/launch.json` una configuración `summum` con `pnpm dev:summum`, puerto 3300) y abrirlo con las herramientas de preview. Con un usuario de pruebas que sea dueño de un muelle de pruebas (crearlo con `pnpm db:muelle`), revisar que cargan las tres pantallas sin errores en consola y tomar captura. Con un usuario que no es dueño, revisar que `/muelle/<id>/barcos` responde 404.

- [ ] **Step 9: Gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`

```bash
git add packages/ui/src/tokens.css apps/summum/app apps/summum/components apps/summum/server/stripe/connect.ts .claude/launch.json
git commit -m "feat(summum): pantallas Barcos, Comisiones, Dinero y la página de cobros del barco"
```

---

### Task 10: Sección "Cobros" en Improvement

**Files:**
- Modify: `apps/improvement/server/permissions/sections.ts:12,26-32`
- Create: `apps/improvement/server/cobros/ledger.ts`, `apps/improvement/app/[org]/cobros/page.tsx`
- Test: `apps/improvement/tests/cobros.test.ts`

**Interfaces:**
- Consumes: `requireSection`, `resolveSection` (existentes), `ledgerEntry` (Task 1), `NEXT_PUBLIC_SUMMUM_URL` en `apps/improvement/lib/env.ts` (Task 3).
- Produces: slug `cobros`; `listOrgLedger(userId: string, orgId: string)` → movimientos del barco si la persona tiene alcance `empresa` en `cobros`, `[]` si no.

- [ ] **Step 1: Write the failing test**

```ts
// apps/improvement/tests/cobros.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { scopeFor } from "../server/permissions/sections.ts";
import { listOrgLedger } from "../server/cobros/ledger.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  await db.delete(ledgerEntry).where(sql`${ledgerEntry.barcoOrgId} = any(${orgIds})`);
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

describe("sección cobros", () => {
  it("WHEN un empleado no tiene la sección en su tipo THE SYSTEM SHALL darle ninguno", () => {
    expect(scopeFor("employee", { objetivos: "area" }, "cobros")).toBe("ninguno");
    expect(scopeFor("owner", null, "cobros")).toBe("empresa");
  });

  it("WHEN el dueño lista THE SYSTEM SHALL ver los movimientos de su barco y el empleado sin permiso nada", async () => {
    const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    const [boat] = await db.insert(organization).values({ name: "b", slug: `b-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
    orgIds.push(dock!.id, boat!.id);
    const mk = async (role: "owner" | "employee", permissionTypeId: string | null = null) => {
      const id = crypto.randomUUID();
      await db.insert(profile).values({ id, email: `${id}@example.com` });
      profileIds.push(id);
      await db.insert(membership).values({ userId: id, orgId: boat!.id, role, acceptedAt: new Date(), permissionTypeId });
      return id;
    };
    const [tipo] = await db.insert(permissionType).values({ orgId: boat!.id, name: "Ventas", grants: { clientes: "empresa" } }).returning();
    const owner = await mk("owner");
    const emp = await mk("employee", tipo!.id);
    await db.insert(ledgerEntry).values({ muelleOrgId: dock!.id, barcoOrgId: boat!.id, chargeKind: "venta_propia", grossCents: 100, summumFeeCents: 10, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` });

    expect(await listOrgLedger(owner, boat!.id)).toHaveLength(1);
    expect(await listOrgLedger(emp, boat!.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jotapuntoce/improvement test tests/cobros.test.ts`
Expected: FAIL — `"cobros"` no es un `SectionSlug` / módulo no existe.

- [ ] **Step 3: Implement**

En `sections.ts`: `SECTION_SLUGS = ["mapa", "objetivos", "equipo", "clientes", "powerups", "cobros"] as const;` y agregar a `SECTIONS`:

```ts
  { slug: "cobros", label: "Cobros", hint: "Lo que cobras y la comisión de Summum", scopes: ["empresa"] },
```

`apps/improvement/server/cobros/ledger.ts`:

```ts
// Los movimientos de dinero de ESTE barco. Solo con alcance `empresa` en la sección cobros (el
// dueño siempre; un empleado solo si su tipo lo concede). Lectura pura: el libro lo escribe
// únicamente el webhook de apps/summum.
import { desc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";

export async function listOrgLedger(userId: string, orgId: string) {
  const { scope } = await resolveSection(userId, orgId, "cobros");
  if (scope !== "empresa") return [];
  return db
    .select({
      id: ledgerEntry.id,
      chargeKind: ledgerEntry.chargeKind,
      grossCents: ledgerEntry.grossCents,
      summumFeeCents: ledgerEntry.summumFeeCents,
      currency: ledgerEntry.currency,
      createdAt: ledgerEntry.createdAt,
    })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.barcoOrgId, orgId))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(200);
}
```

`apps/improvement/app/[org]/cobros/page.tsx`:

```tsx
// Cobros del barco: lo que se cobró y la comisión de Summum. Conectar la cuenta y crear ligas de
// cobro se hace en Summum (las llaves de Stripe no entran a Improvement); aquí solo el enlace.
import { requireSection } from "@/server/auth/guard";
import { listOrgLedger } from "@/server/cobros/ledger";
import { env } from "@/lib/env";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export default async function CobrosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const { membership: me } = await requireSection(orgId, "cobros");
  const rows = await listOrgLedger(me.userId, orgId);
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "32px 24px", maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Cobros</h1>
      {env.NEXT_PUBLIC_SUMMUM_URL && (
        <a href={`${env.NEXT_PUBLIC_SUMMUM_URL}/barco/${orgId}`} style={{ color: "var(--accent-2)" }}>
          Conectar tu cuenta o crear una liga de cobro en Summum →
        </a>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        {rows.map((r) => (
          <li key={r.id} style={{ padding: "16px", borderRadius: "var(--radius-md, 16px)", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            {r.createdAt.toLocaleDateString("es-MX")} · {money(r.grossCents, r.currency)} · Summum: {money(r.summumFeeCents, r.currency)}
          </li>
        ))}
        {rows.length === 0 && <p style={{ color: "var(--text-secondary)" }}>Sin cobros todavía.</p>}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @jotapuntoce/improvement test tests/cobros.test.ts tests/permissions.test.ts`
Expected: PASS. Si `permissions.test.ts` tiene un caso que cuenta las secciones (5), actualizar el número esperado a 6: ese es el único cambio permitido en ese archivo.

- [ ] **Step 5: Gate and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`

```bash
git add apps/improvement/server/permissions/sections.ts apps/improvement/server/cobros apps/improvement/app/[org]/cobros apps/improvement/tests/cobros.test.ts apps/improvement/tests/permissions.test.ts
git commit -m "feat(improvement): sección Cobros con los movimientos del barco y enlace a Summum"
```

---

### Task 11: Prueba de punta a punta con Stripe en modo de prueba

**Files:**
- Create: `apps/summum/playwright.config.ts`, `apps/summum/tests/e2e/cobro.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior; `createTestAuthUser`, `deleteTestAuthUser` de `@jotapuntoce/db/test-fixtures` (con la misma carga de `.env.local` de la raíz que hace `apps/improvement/tests/e2e/global-setup.ts`).

**Prerrequisitos manuales** (documentarlos en el encabezado del spec de Playwright):
1. Llaves de **prueba** de Stripe en `.env.local` (`sk_test_…`).
2. En dos terminales: `stripe listen --forward-to localhost:3300/api/stripe/webhook` y `stripe listen --forward-connect-to localhost:3300/api/stripe/connect`; copiar cada `whsec_…` a su variable.
3. Una cuenta conectada de **prueba** ya verificada (Stripe la deja verificar con datos de prueba). Su `acct_…` va en la variable `E2E_STRIPE_ACCOUNT_ID` del entorno de la prueba (no es secreta).

- [ ] **Step 1: Write the e2e**

`apps/summum/playwright.config.ts`: copia del de `apps/improvement` con `baseURL: "http://localhost:3300"` y `webServer.command: "pnpm dev"`, puerto 3300.

```ts
// apps/summum/tests/e2e/cobro.spec.ts
// Punta a punta en MODO DE PRUEBA de Stripe (prerrequisitos en el encabezado del plan, Task 11).
import { expect, test } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { feeRate, ledgerEntry, membership, organization, profile, stripeAccount } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser } from "@jotapuntoce/db/test-fixtures";

const password = `Pw-${crypto.randomUUID()}`;
let dockId = "", boatId = "", ownerId = "";
const email = `e2e-${Date.now()}@example.com`;

test.beforeAll(async () => {
  const acct = process.env.E2E_STRIPE_ACCOUNT_ID;
  if (!acct) throw new Error("E2E_STRIPE_ACCOUNT_ID no definida — ver prerrequisitos");
  ownerId = await createTestAuthUser(email, password);
  await db.insert(profile).values({ id: ownerId, email });
  const [dock] = await db.insert(organization).values({ name: "e2e-muelle", slug: `e2e-m-${Date.now()}`, kind: "muelle" }).returning();
  const [boat] = await db.insert(organization).values({ name: "e2e-barco", slug: `e2e-b-${Date.now()}`, parentOrgId: dock!.id }).returning();
  dockId = dock!.id; boatId = boat!.id;
  await db.insert(membership).values([
    { userId: ownerId, orgId: dockId, role: "owner", acceptedAt: new Date() },
    { userId: ownerId, orgId: boatId, role: "owner", acceptedAt: new Date() },
  ]);
  await db.insert(stripeAccount).values({ orgId: boatId, stripeAccountId: acct, chargesEnabled: true, payoutsEnabled: true });
  await db.insert(feeRate).values({ muelleOrgId: dockId, chargeKind: "venta_propia", percentBps: 1000 });
});

test.afterAll(async () => {
  await db.delete(ledgerEntry).where(eq(ledgerEntry.barcoOrgId, boatId));
  await db.delete(organization).where(sql`${organization.id} in (${boatId}, ${dockId})`);
  await db.delete(profile).where(eq(profile.id, ownerId));
  await deleteTestAuthUser(ownerId);
});

test("WHEN el barco cobra 100 MXN con tarjeta de prueba THE SYSTEM SHALL mostrar 10 MXN para Summum en Dinero", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/correo|email/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /entrar|iniciar/i }).click();

  await page.goto(`/barco/${boatId}`);
  await page.getByPlaceholder("Concepto").fill("Servicio e2e");
  await page.getByPlaceholder("Monto MXN").fill("100");
  await page.getByRole("button", { name: "Crear liga de cobro" }).click();

  await page.waitForURL(/checkout\.stripe\.com/);
  await page.getByLabel(/email/i).fill(email);
  await page.getByPlaceholder("1234 1234 1234 1234").fill("4242424242424242");
  await page.getByPlaceholder("MM / YY").fill("12 / 34");
  await page.getByPlaceholder("CVC").fill("123");
  await page.getByLabel(/nombre|name/i).first().fill("Prueba E2E");
  await page.getByRole("button", { name: /pagar|pay/i }).click();
  await page.waitForURL(new RegExp(`/barco/${boatId}\\?cobro=ok`));

  await expect.poll(async () => (await db.select().from(ledgerEntry).where(eq(ledgerEntry.barcoOrgId, boatId))).length, { timeout: 30_000 }).toBe(1);

  await page.goto(`/muelle/${dockId}/dinero`);
  await expect(page.getByText(/Para Summum:\s*\$10\.00/)).toBeVisible();
});
```

(Los selectores del login deben coincidir con los `label`/botones reales de `LoginForm.tsx` copiado en la Task 3; ajustar el texto del regex a esos rótulos. Los del Checkout hospedado de Stripe pueden cambiar: si uno no aparece, inspeccionar la página con Playwright `--debug` y usar el rótulo visible.)

- [ ] **Step 2: Run e2e**

Run: `pnpm --filter @jotapuntoce/summum test:e2e`
Expected: PASS (1 test). Si falla en el Checkout de Stripe por un selector, corregir solo el selector.

- [ ] **Step 3: Commit**

```bash
git add apps/summum/playwright.config.ts apps/summum/tests/e2e
git commit -m "test(summum): cobro de punta a punta en modo de prueba de Stripe"
```

---

## Cobertura de la spec (autorrevisión)

| Requisito de la spec | Tarea |
|---|---|
| `kind`, `parent_org_id`, muelle sin padre, barco puede quedar sin muelle | 1 |
| Muelle creado sin literal; barcos huérfanos adoptados | 2 |
| Barco nuevo nace colgado del muelle de quien aprueba | 2 |
| Dueños del muelle = `membership.role = 'owner'`; muelle no abre el barco | 3 |
| `stripe_account` (+ customer), banderas solo por webhook | 1, 6, 7 |
| `fee_rate` de fábrica / personalizada, resolución y rechazo sin tasa | 1, 4, 6 |
| `membership_plan` y nivel del barco; suscripción | 1, 6 |
| Tres tipos de cobro (`proyecto_summum` solo mecanismo) | 1, 6, 7 |
| Firma de los dos | 1 (check), 5, 9 |
| `ledger_entry` append-only, idempotente, solo desde webhook | 1, 7 |
| Dos webhooks con firma verificada; desconocido → 200 sin escribir | 7 |
| Margen del muelle | 8, 9 |
| `apps/summum`: Barcos, Comisiones, Dinero + página del barco | 9 |
| Sección Cobros en Improvement | 10 |
| RLS en la misma migración; PostgREST no fuga | 1 |
| Sin service-role en summum/improvement; llaves de Stripe solo en summum | 3, 6, 7, 9 |
| `.env.example` y `turbo.json` | 3 |
| Pruebas puras, de webhook, de puertas y e2e | 3–8, 10, 11 |
