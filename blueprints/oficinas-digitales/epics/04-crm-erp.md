# Epic 04: CRM extendido y ERP v1 (inventario, ventas, compras)

> Al terminar, Improvement lleva productos con existencia calculada, proveedores, órdenes de venta y de compra que mueven el inventario, el resumen del pipeline y una ficha 360 del cliente, con las pantallas del ERP en `/[org]/erp` y el CRM rediseñado con el estilo Flozzy. Sin CFDI.

| | |
|---|---|
| **Epic id** | `04-crm-erp` |
| **Tasks** | `E4-T1` … `E4-T7` |
| **Depends on** | `03-agentes` (orden de `schema.ts` y la navegación `OFICINAS_SLUGS`) |
| **Unlocks** | `05-agenda` |
| **Parallel with** | nada: los epics siguientes editan `packages/db/src/schema.ts` en cadena |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16.3.3 App Router · React 19.2.8 · TypeScript 6.0.3 · Tailwind CSS v4 sobre los tokens de
`packages/ui/src/tokens.css` (más el tema por org desde el epic 01) · Postgres del **Supabase compartido**
(sin base local, sin Docker) · Drizzle ORM 0.45.2 / drizzle-kit 0.31.10 (`packages/db`) · zod 4.5.4 ·
Supabase Auth + los guards de `apps/improvement/server/auth/guard.ts` · Vercel · un worker Node 24 en un VPS
(`apps/agentes`, epic 03).
Package manager: `pnpm` 11.24.0. Runtime pinned in `.nvmrc` (24.19.0). Dependency versions are in the
lockfile — read it, never guess one. **La única dependencia nueva de todo el cambio es `stripe` 23.0.0
exacto en `apps/improvement` (epic 06, paso 39)**; el paquete `apps/agentes` reusa versiones que el lockfile
ya tiene.

| Task | Command |
|---|---|
| Dev | `pnpm dev:improvement` — http://localhost:3200 |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (todo) | `pnpm test` |
| Test (un archivo) | `pnpm --filter improvement test tests/<archivo>.test.ts` · worker: `pnpm --filter @jotapuntoce/agentes test` |
| E2E (un spec) | `pnpm --filter improvement test:e2e <spec>.spec.ts` |
| DB — generar migración | `pnpm db:generate` · RLS: `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=<nombre>_rls` |
| DB — aplicar | `pnpm db:migrate` — **solo con un "sí" explícito de Jose Carlos**; la herramienta pide confirmación (`permissions.ask`) |
| Local services | NOT APPLICABLE — no hay servicios locales: la base es el Supabase compartido, con las llaves en `apps/improvement/.env.test` y el `.env.local` de la raíz |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

Las pruebas de integración hablan con el Supabase compartido. Sin `apps/improvement/.env.test` y el
`.env.local` de la raíz con valores reales no corren: es esperado; detente y repórtalo, nunca uses una base
falsa. Las pruebas **nunca** llaman a Anthropic, Google ni Stripe de verdad: proveedor, `fetch` y Stripe
falsos. **Nunca `git add -A`**: el árbol trae WIP del usuario (`apps/admin/*`, `apps/summum/*`,
`.claude/launch.json`, `projects/`) que no es de este cambio. Cada Checkpoint nombra sus rutas y agrega
`blueprints/oficinas-digitales/tasks.json` (el estado de la tarea).

## Directory subtree

Only the parts this epic touches:

```
packages/db/
  src/schema.ts                                    # exists, you will edit it (E4-T1, E4-T2)
  migrations/                                      # db:generate + --custom erp_inventario_rls, erp_ordenes_rls
apps/improvement/
  server/erp/inventory.ts                          # NEW (E4-T3)
  server/erp/sales.ts, purchases.ts                # NEW (E4-T4)
  server/erp/projects.ts, tickets.ts               # exist, read-only
  server/crm/pipeline.ts, client360.ts             # NEW (E4-T5)
  server/crm/deals.ts, preferences.ts              # exist, read-only (DEAL_STAGES, listPipeline)
  server/permissions/sections.ts                   # exists, you will edit it (E4-T3: `erp`; E4-T6: OFICINAS_SLUGS)
  app/[org]/erp/page.tsx, erp/ventas/page.tsx,
       erp/compras/page.tsx                        # NEW (E4-T6)
  app/[org]/clientes/pipeline/page.tsx,
       clientes/[clienteId]/page.tsx               # exist, you will redesign them (E4-T7)
  tests/erp-inventario-schema, erp-ordenes-schema, erp-inventory, erp-orders,
        crm-360 (.test.ts)                         # NEW
  tests/crm.test.ts, tests/e2e/erp.spec.ts         # exist, read-only (deben seguir pasando)
  tests/e2e/erp-v1.spec.ts, crm-flozzy.spec.ts     # NEW (E4-T6, E4-T7)
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not listed
here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `product` | `org_id`, `sku` (único por org si no es null), `name`, `unit`, `price_cents`, `cost_cents` ≥ 0, `active` | La existencia **no** es columna: `Σ stock_move.quantity` |
| `supplier` | `org_id`, `name`, `email`, `phone`, `notes` | |
| `stock_move` | `org_id`, `product_id`, `kind` (`entrada`\|`salida`\|`ajuste`), `quantity` con signo, `note`, `created_by`, `sale_order_id`, `purchase_order_id` | Check de signo por `kind` |
| `sale_order` / `sale_order_line` | `number` (único por org), `client_id`, `deal_id`, `status`, `total_cents`, `currency` `mxn` · línea: `product_id` (restrict), `quantity` > 0, `unit_price_cents` | |
| `purchase_order` / `purchase_order_line` | `number`, `supplier_id` (restrict), `status`, `confirmed_at`, `received_at` · línea: `unit_cost_cents` | |
| `client`, `deal` (existentes) | se leen | `DEAL_STAGES` no cambia |

RLS: dueño o sección `erp` = `empresa`, mismo criterio que lealtad.

### Apéndice de esquema (copia de blueprint.md §4)

#### `erp_inventario_rls`

```sql
-- Custom SQL migration file, put your code below! --
-- ERP v1 (inventario y proveedores): mismo criterio que lealtad — dueño o sección `erp` = empresa.
alter table product enable row level security;
create policy "members read products their permission type allows"
  on product for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = product.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table stock_move enable row level security;
create policy "members read stock moves their permission type allows"
  on stock_move for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = stock_move.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table supplier enable row level security;
create policy "members read suppliers their permission type allows"
  on supplier for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = supplier.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

grant select on product, stock_move, supplier to authenticated;
```

#### `erp_ordenes_rls`

```sql
-- Custom SQL migration file, put your code below! --
-- ERP v1 (órdenes de venta y de compra): dueño o sección `erp` = empresa.
alter table sale_order enable row level security;
create policy "members read sale orders their permission type allows"
  on sale_order for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = sale_order.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table sale_order_line enable row level security;
create policy "members read sale order lines their permission type allows"
  on sale_order_line for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = sale_order_line.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table purchase_order enable row level security;
create policy "members read purchase orders their permission type allows"
  on purchase_order for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = purchase_order.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table purchase_order_line enable row level security;
create policy "members read purchase order lines their permission type allows"
  on purchase_order_line for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = purchase_order_line.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

grant select on sale_order, sale_order_line, purchase_order, purchase_order_line to authenticated;
```

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/auth/guard.ts` → `findOwnerMembership`, `resolveSection`, `requireSection` | 404 nunca 403 |
| repo | `server/crm/deals.ts` → `DEAL_STAGES`, `listPipeline`, `createDeal`, `moveDeal` | Sin cambio |
| repo | `server/crm/preferences.ts` → `HIPER_QUESTIONS` | Sin cambio |
| `03-agentes` | `OFICINAS_SLUGS` | Ver epic 02/03 |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `server/erp/inventory.ts` → `createProduct`, `updateProduct`, `listProducts`, `recordMove`, `createSupplier`, `listSuppliers` | `stock` calculado en SQL; una `salida` que deja negativo → `VALIDATION_ERROR` "Sin existencia suficiente."; `ajuste` solo dueño | E4-T4, E4-T6 |
| `server/erp/sales.ts` → `createSaleOrder`, `confirmSaleOrder`, `cancelSaleOrder`, `listSaleOrders` · `purchases.ts` → `createPurchaseOrder`, `confirmPurchaseOrder`, `receivePurchaseOrder`, `listPurchaseOrders` | `number` = máximo del org + 1; confirmar/recibir en una transacción | E4-T6 |
| `server/crm/pipeline.ts` → `pipelineSummary` (puro) · `client360.ts` → `loadClient360(userId, orgId, clientId)` | por `DEAL_STAGES`; `winRate` con 2 decimales o `null` | E4-T7 |
| `server/permissions/sections.ts` | `erp` en `SECTION_SLUGS` (`scopes: ["empresa"]`) y en `OFICINAS_SLUGS` | `05`, `06` |

## Conventions that bite in this area

- **La existencia se calcula, no se guarda.** Nunca una columna `stock`; todo movimiento es una fila de
  `stock_move` y las órdenes la crean en la misma transacción que cambian su estado.
- **Dinero en centavos `bigint` (`mode: "number"`)**, moneda `mxn`. Sin CFDI ni timbrado en v1.
- **Sin borrar productos con movimientos:** las líneas usan `restrict`; se desactiva con `active = false`.
- **El CRM existente no se reescribe:** `deals.ts` y `preferences.ts` se leen; el rediseño es de pantallas.
- **Dos puertas, import con `.ts`, resultados tipados, `--custom` solo para RLS, `grep` de uuid**, y
  `":(literal)…"` para rutas con corchetes en `git add`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/oficinas-digitales.md`,
`.claude/rules/summum-improvement.md`, `.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`.

---

## Tasks

### `E4-T1` — Esquema ERP: productos, movimientos de inventario y proveedores

**Depends on:** `E3-T2` · **Priority:** p0 · **Step:** 24

1. `packages/db/src/schema.ts`:
   - `STOCK_MOVE_KINDS = ["entrada", "salida", "ajuste"] as const`.
   - `product`: `id`, `org_id` (cascade), `sku` text null, `name` text not null, `unit` text not null default
     `"pieza"`, `price_cents` y `cost_cents` (`bigint(…, { mode: "number" })`, not null, default 0), `active`
     boolean not null default true, `created_at`, `updated_at`. Checks `product_price_nonneg`,
     `product_cost_nonneg`; `uniqueIndex("uq_product_org_sku").on(orgId, sku).where(sql\`sku is not null\`)`.
   - `supplier`: `id`, `org_id` (cascade), `name` text not null, `email` text null, `phone` text null, `notes`
     text null, `created_at`, `updated_at`.
   - `stock_move`: `id`, `org_id` (cascade), `product_id` (→ product, cascade), `kind` (`STOCK_MOVE_KINDS`),
     `quantity` integer not null (con signo: entrada > 0, salida < 0), `note` text null, `created_by` (→ profile,
     set null), `created_at`. Checks `stock_move_kind_check` y `stock_move_sign_check`
     (`(kind = 'entrada' and quantity > 0) or (kind = 'salida' and quantity < 0) or (kind = 'ajuste' and quantity <> 0)`).
     Índice `idx_stock_move_product` (`product_id`).
2. `pnpm db:generate`.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=erp_inventario_rls` y pega, completo,
   el SQL de §4 *Migración `erp_inventario_rls`*.
4. `apps/improvement/tests/erp-inventario-schema.test.ts` con el patrón `asUser()`.
5. **Aprobación obligatoria.** Muestra los dos SQL a Jose Carlos y espera un "sí" explícito. Sin "sí", detente.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts`
- `packages/db/migrations/**`
- `apps/improvement/tests/erp-inventario-schema.test.ts`

**Acceptance**
1. **WHEN** se inserta un `stock_move` `entrada` con `quantity` -3 o `salida` con `quantity` 2 **THE SYSTEM SHALL** rechazar cada insert en la base.
2. **WHEN** se insertan dos `product` del mismo org con el mismo `sku` **THE SYSTEM SHALL** rechazar el segundo, y **WHEN** los dos tienen `sku` nulo **THE SYSTEM SHALL** aceptar ambos.
3. **WHEN** un empleado con `erp` = `empresa` consulta `product` como `authenticated` **THE SYSTEM SHALL** ver los productos de su org, y **WHEN** consulta un empleado sin ese permiso **THE SYSTEM SHALL** devolver 0 filas.
4. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**
```bash
grep -q 'create policy "members read stock moves their permission type allows"' packages/db/migrations/*.sql
pnpm --filter improvement test tests/erp-inventario-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/erp-inventario-schema.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E4-T1 (step 24): esquema product, stock_move y supplier con RLS"
git tag step-24-od-inventario-esquema
git ls-files --error-unmatch apps/improvement/tests/erp-inventario-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E4-T2` — Esquema ERP: órdenes de venta y de compra

**Depends on:** `E4-T1` · **Priority:** p0 · **Step:** 25

1. `packages/db/src/schema.ts`:
   - `SALE_ORDER_STATUSES = ["borrador", "confirmada", "entregada", "cancelada"] as const`,
     `PURCHASE_ORDER_STATUSES = ["borrador", "confirmada", "recibida", "cancelada"] as const`.
   - `sale_order`: `id`, `org_id` (cascade), `number` integer not null, `client_id` (→ client, set null),
     `deal_id` (→ deal, set null), `status` (default `"borrador"`), `total_cents` bigint not null default 0,
     `currency` text not null default `"mxn"`, `created_by` (→ profile, set null), `confirmed_at` null,
     `created_at`, `updated_at`. Check de estado y `sale_order_total_nonneg`; `uniqueIndex("uq_sale_order_org_number")`.
   - `sale_order_line`: `id`, `org_id` (cascade), `sale_order_id` (cascade), `product_id` (→ product,
     **restrict**), `quantity` integer > 0, `unit_price_cents` bigint ≥ 0.
   - `purchase_order` y `purchase_order_line`: mismo patrón; la orden lleva `supplier_id` (→ supplier,
     restrict, not null), `confirmed_at` y `received_at` (ambos null) y su único `uq_purchase_order_org_number`;
     la línea lleva `unit_cost_cents` en lugar de `unit_price_cents`.
   - `stock_move` gana `sale_order_id` (→ sale_order, set null) y `purchase_order_id` (→ purchase_order, set null).
2. `pnpm db:generate`.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=erp_ordenes_rls` y pega, completo, el
   SQL de §4 *Migración `erp_ordenes_rls`*.
4. `apps/improvement/tests/erp-ordenes-schema.test.ts` con el patrón `asUser()`.
5. **Aprobación obligatoria.** Muestra los dos SQL a Jose Carlos y espera un "sí" explícito. Sin "sí", detente.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts`
- `packages/db/migrations/**`
- `apps/improvement/tests/erp-ordenes-schema.test.ts`

**Acceptance**
1. **WHEN** se inserta una `sale_order_line` con `quantity` 0 **THE SYSTEM SHALL** rechazarla en la base.
2. **WHEN** se borra un `product` que tiene una línea de venta **THE SYSTEM SHALL** rechazar el borrado.
3. **WHEN** se insertan dos `sale_order` del mismo org con el mismo `number` **THE SYSTEM SHALL** rechazar la segunda.
4. **WHEN** un empleado sin permiso de `erp` consulta `purchase_order` como `authenticated` **THE SYSTEM SHALL** devolver 0 filas, y **WHEN** consulta el dueño **THE SYSTEM SHALL** ver las de su org.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**
```bash
grep -q 'create policy "members read purchase order lines their permission type allows"' packages/db/migrations/*.sql
pnpm --filter improvement test tests/erp-ordenes-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/erp-ordenes-schema.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E4-T2 (step 25): esquema de órdenes de venta y de compra con RLS"
git tag step-25-od-ordenes-esquema
git ls-files --error-unmatch apps/improvement/tests/erp-ordenes-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E4-T3` — Motor de inventario con existencia calculada

**Depends on:** `E4-T2` · **Priority:** p0 · **Step:** 26

`apps/improvement/server/erp/inventory.ts` (extiende `server/erp/`; `projects.ts` y `tickets.ts` no cambian).
Cada función empieza con `resolveSection(userId, orgId, "erp")` y exige `empresa` (el dueño siempre); si no,
`NOT_FOUND`. Entradas con `zod`.

0. `server/permissions/sections.ts`: `"erp"` al final de `SECTION_SLUGS` con su `Section` (`label: "ERP"`,
   `hint: "Inventario, ventas y compras."`, `scopes: ["empresa"]`) — `resolveSection(…, "erp")` lo necesita
   para tipar. La pantalla y el enlace en `OFICINAS_SLUGS` llegan en el paso 29.
1. `createProduct`, `updateProduct`, `listProducts` (con `stock` = suma de `quantity` de sus `stock_move`,
   calculada en SQL, nunca guardada).
2. `recordMove(userId, orgId, { productId, kind, quantity, note })`: `ajuste` solo el dueño; una `salida` que
   deja la existencia en negativo → `{ ok: false, error: { code: "VALIDATION_ERROR", message: "Sin existencia suficiente." } }`
   sin escribir (verificado dentro de una transacción con `select … for update` del producto).
3. `createSupplier`, `listSuppliers`.
4. `apps/improvement/tests/erp-inventory.test.ts`.

**Files**
- `apps/improvement/server/erp/inventory.ts`
- `apps/improvement/server/permissions/sections.ts`
- `apps/improvement/tests/erp-inventory.test.ts`

**Acceptance**
1. **WHEN** se registran una `entrada` de 10 y una `salida` de -4 **THE SYSTEM SHALL** listar el producto con `stock` 6.
2. **WHEN** una `salida` dejaría la existencia en negativo **THE SYSTEM SHALL** devolver `Sin existencia suficiente.` sin escribir el movimiento.
3. **WHEN** un empleado con `erp` = `empresa` registra un `ajuste` **THE SYSTEM SHALL** devolver `NOT_FOUND`, y **WHEN** lo registra el dueño **THE SYSTEM SHALL** aceptarlo.
4. **WHEN** un empleado sin permiso de `erp` lista productos **THE SYSTEM SHALL** devolver `NOT_FOUND`.

**Verify**
```bash
pnpm --filter improvement test tests/erp-inventory.test.ts
pnpm --filter improvement test tests/erp-projects.test.ts tests/postventa.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/erp || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/erp/inventory.ts apps/improvement/server/permissions/sections.ts apps/improvement/tests/erp-inventory.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E4-T3 (step 26): motor de inventario con existencia calculada"
git tag step-26-od-inventario
git ls-files --error-unmatch apps/improvement/server/erp/inventory.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E4-T4` — Motor de ventas y compras ligado al inventario

**Depends on:** `E4-T3` · **Priority:** p0 · **Step:** 27

Mismo guard que el paso 26 (`erp` = `empresa` o dueño).
1. `server/erp/sales.ts`: `createSaleOrder(userId, orgId, { clientId?, dealId?, lines })` en `borrador` con
   `number` = máximo del org + 1 (en la transacción) y `total_cents` = Σ `quantity × unit_price_cents`
   (precio por defecto el del producto); `clientId`/`dealId` deben ser del mismo org. `confirmSaleOrder` →
   `confirmada` y una `salida` por línea con `sale_order_id`, todo en una transacción que falla completa si
   algún producto no alcanza (`Sin existencia suficiente.`). `cancelSaleOrder` solo en `borrador`.
   `listSaleOrders`.
2. `server/erp/purchases.ts`: `createPurchaseOrder(userId, orgId, { supplierId, lines })`, `confirmPurchaseOrder`,
   `receivePurchaseOrder` → `recibida` con una `entrada` por línea (`purchase_order_id`), `listPurchaseOrders`.
   Sin CFDI: ningún folio fiscal ni timbrado.
3. `apps/improvement/tests/erp-orders.test.ts`.

**Files**
- `apps/improvement/server/erp/sales.ts`
- `apps/improvement/server/erp/purchases.ts`
- `apps/improvement/tests/erp-orders.test.ts`

**Acceptance**
1. **WHEN** se crea una orden de venta con 2 líneas (3 × 1500 y 1 × 2000 centavos) **THE SYSTEM SHALL** guardar `total_cents` 6500 en `borrador`.
2. **WHEN** se confirma una orden de venta con existencia suficiente **THE SYSTEM SHALL** pasarla a `confirmada` y bajar la existencia de cada producto en su cantidad.
3. **WHEN** una línea no alcanza existencia al confirmar **THE SYSTEM SHALL** devolver `Sin existencia suficiente.` y no escribir ningún movimiento de esa orden.
4. **WHEN** se recibe una orden de compra de 5 piezas **THE SYSTEM SHALL** subir la existencia del producto en 5 y dejar la orden en `recibida`.
5. **WHEN** se crea una orden de venta con un `clientId` de otro org **THE SYSTEM SHALL** devolver `VALIDATION_ERROR` sin escribir.

**Verify**
```bash
pnpm --filter improvement test tests/erp-orders.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/erp || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/erp/sales.ts apps/improvement/server/erp/purchases.ts apps/improvement/tests/erp-orders.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E4-T4 (step 27): órdenes de venta y compra que mueven inventario"
git tag step-27-od-ordenes
git ls-files --error-unmatch apps/improvement/server/erp/sales.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E4-T5` — CRM: resumen del pipeline y ficha 360

**Depends on:** `E4-T4` · **Priority:** p1 · **Step:** 28

Extiende `server/crm/`; `deals.ts`, `preferences.ts`, `attention.ts`, `loyalty.ts` y `wallet.ts` no cambian.
1. `server/crm/pipeline.ts`: `pipelineSummary(deals: { stage, amountCents }[])` (puro) → por cada etapa de
   `DEAL_STAGES`, en su orden, `{ stage, count, amountCents }`, más `winRate` = ganados ÷ (ganados + perdidos)
   redondeado a 2 decimales (`null` si no hay cerrados). Sin probabilidades por etapa.
2. `server/crm/client360.ts`: `loadClient360(userId, orgId, clientId)` — `resolveSection(…, "clientes")`
   (mismo alcance que la ficha de hoy); devuelve el cliente, sus `deal`, sus `sale_order` (si el usuario
   también tiene `erp` ≠ `ninguno`; si no, lista vacía), sus `ticket` y sus preferencias.
3. `apps/improvement/tests/crm-360.test.ts`.

**Files**
- `apps/improvement/server/crm/pipeline.ts`
- `apps/improvement/server/crm/client360.ts`
- `apps/improvement/tests/crm-360.test.ts`

**Acceptance**
1. **WHEN** `pipelineSummary` recibe 2 tratos `ganado` y 1 `perdido` **THE SYSTEM SHALL** devolver `winRate` 0.67 y una fila por cada etapa de `DEAL_STAGES` en su orden.
2. **WHEN** `pipelineSummary` recibe solo tratos abiertos **THE SYSTEM SHALL** devolver `winRate` `null`.
3. **WHEN** un empleado con `clientes` pero sin `erp` carga la ficha 360 **THE SYSTEM SHALL** devolver tratos y tickets del cliente y una lista de órdenes vacía.
4. **WHEN** se pide la ficha de un cliente de otro org **THE SYSTEM SHALL** devolver `NOT_FOUND`.

**Verify**
```bash
pnpm --filter improvement test tests/crm-360.test.ts
pnpm --filter improvement test tests/crm.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/crm/pipeline.ts apps/improvement/server/crm/client360.ts apps/improvement/tests/crm-360.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E4-T5 (step 28): resumen del pipeline y ficha 360 del cliente"
git tag step-28-od-crm-360
git ls-files --error-unmatch apps/improvement/server/crm/client360.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E4-T6` — Pantallas del ERP: inventario, ventas y compras

**Depends on:** `E4-T4`, `E3-T7` · **Priority:** p1 · **Step:** 29

1. `server/permissions/sections.ts`: `"erp"` ya está en `SECTION_SLUGS` desde el paso 26; aquí se agrega a
   `OFICINAS_SLUGS` para que aparezca en la navegación.
2. `app/[org]/erp/page.tsx` — inventario: `requireSection(org, "erp")`; tabla de productos con existencia,
   alta de producto, registrar entrada/salida, proveedores; enlaces a Ventas y Compras.
3. `app/[org]/erp/ventas/page.tsx`: órdenes de venta (número, cliente, total en MXN con Geist Mono, estado),
   nueva orden con líneas, confirmar, cancelar.
4. `app/[org]/erp/compras/page.tsx`: órdenes de compra, nueva, confirmar, recibir.
   Dinero formateado con `Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })`. Errores en
   `role="alert"`.
5. `tests/e2e/erp-v1.spec.ts` (`serial`).

**Files**
- `apps/improvement/app/[org]/erp/page.tsx`
- `apps/improvement/app/[org]/erp/ventas/page.tsx`
- `apps/improvement/app/[org]/erp/compras/page.tsx`
- `apps/improvement/server/permissions/sections.ts`
- `apps/improvement/tests/e2e/erp-v1.spec.ts`

**Acceptance**
1. **WHEN** el dueño da de alta un producto, registra una entrada de 10 y confirma una venta de 3 **THE SYSTEM SHALL** mostrar existencia 7 en `/[org]/erp`.
2. **WHEN** el dueño recibe una compra de 5 piezas **THE SYSTEM SHALL** mostrar la existencia aumentada en 5.
3. **WHEN** un empleado sin permiso de `erp` abre `/[org]/erp` **THE SYSTEM SHALL** responder 404.
4. **WHEN** AxeBuilder analiza `/[org]/erp`, `/[org]/erp/ventas` y `/[org]/erp/compras` **THE SYSTEM SHALL** reportar 0 violaciones en cada una.

**Verify**
```bash
pnpm --filter improvement test:e2e erp-v1.spec.ts
pnpm --filter improvement test tests/permissions.test.ts tests/erp-sections.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- ":(literal)apps/improvement/app/[org]/erp/page.tsx" ":(literal)apps/improvement/app/[org]/erp/ventas/page.tsx" ":(literal)apps/improvement/app/[org]/erp/compras/page.tsx" apps/improvement/server/permissions/sections.ts apps/improvement/tests/e2e/erp-v1.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E4-T6 (step 29): pantallas del ERP v1"
git tag step-29-od-pantallas-erp
git ls-files --error-unmatch ":(literal)apps/improvement/app/[org]/erp/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E4-T7` — Pantallas del CRM con diseño Flozzy

**Depends on:** `E4-T5`, `E4-T6` · **Priority:** p1 · **Step:** 30

Se rediseñan dos pantallas existentes sin cambiar sus rutas ni sus acciones (las de `deals.ts` siguen
igual) y sin hex nuevo (solo tokens de `packages/ui/src/tokens.css`).
1. `app/[org]/clientes/pipeline/page.tsx`: tablero por columnas (una por etapa de `DEAL_STAGES`) con encabezado
   de totales de `pipelineSummary` (conteo y monto por etapa, tasa de cierre), tarjetas compactas (título,
   cliente, monto, responsable) y el mismo control de mover etapa de hoy. En móvil, columnas apiladas.
2. `app/[org]/clientes/[clienteId]/page.tsx`: ficha 360 con `loadClient360` — encabezado del cliente y pestañas
   (`role="tablist"`): Tratos, Órdenes, Tickets, Preferencias.
3. `tests/e2e/crm-flozzy.spec.ts`; `tests/e2e/erp.spec.ts` (existente) debe seguir pasando sin cambios.

**Files**
- `apps/improvement/app/[org]/clientes/pipeline/page.tsx`
- `apps/improvement/app/[org]/clientes/[clienteId]/page.tsx`
- `apps/improvement/tests/e2e/crm-flozzy.spec.ts`

**Acceptance**
1. **WHEN** el dueño abre `/[org]/clientes/pipeline` con un trato `ganado` y uno `perdido` **THE SYSTEM SHALL** mostrar una columna por etapa y la tasa de cierre `50%` en el encabezado.
2. **WHEN** el dueño abre la ficha de un cliente con una orden de venta **THE SYSTEM SHALL** mostrar la orden en la pestaña Órdenes.
3. **WHEN** `pnpm --filter improvement test:e2e erp.spec.ts` corre **THE SYSTEM SHALL** pasar sin cambios en ese archivo.
4. **WHEN** AxeBuilder analiza el pipeline y la ficha 360 **THE SYSTEM SHALL** reportar 0 violaciones en cada una.

**Verify**
```bash
pnpm --filter improvement test:e2e crm-flozzy.spec.ts erp.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- ":(literal)apps/improvement/app/[org]/clientes/pipeline/page.tsx" ":(literal)apps/improvement/app/[org]/clientes/[clienteId]/page.tsx" apps/improvement/tests/e2e/crm-flozzy.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E4-T7 (step 30): pipeline y ficha 360 con diseño Flozzy"
git tag step-30-od-crm-flozzy
git ls-files --error-unmatch apps/improvement/tests/e2e/crm-flozzy.spec.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e erp-v1.spec.ts crm-flozzy.spec.ts erp.spec.ts` corre completo **THE SYSTEM SHALL** salir con código 0, con `/[org]/erp`, `/[org]/erp/ventas`, `/[org]/erp/compras`, `/[org]/clientes/pipeline` y la ficha del cliente auditadas por axe sin violaciones.
2. **WHEN** un empleado sin la sección `erp` abre `/[org]/erp` **THE SYSTEM SHALL** responder 404.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e erp-v1.spec.ts crm-flozzy.spec.ts erp.spec.ts
```

## Pitfalls

- **Guardar la existencia en `product`** — se calcula siempre de `stock_move`.
- **Confirmar una venta a medias** — si una línea no alcanza, la transacción completa se revierte.
- **Editar `deals.ts` para el tablero** — el rediseño consume `listPipeline`/`moveDeal` tal cual.
- **Hex nuevo en las pantallas Flozzy** — solo tokens de `tokens.css` (o las CSS vars del tema por org).
- **Agregar CFDI "ya que estamos"** — es non-goal de v1.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-od-*'` los lista (7 de este epic; 46 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Las migraciones de E4-T1 y E4-T2 se aplicaron solo después de un "sí" explícito de Jose Carlos.
