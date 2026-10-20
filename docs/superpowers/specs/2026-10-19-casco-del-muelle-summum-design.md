# El casco del muelle: Summum como empresa padre de cada Improvement

**Fecha:** 2026-10-19
**Estado:** Diseño aprobado por Jose Carlos sección por sección. Falta su revisión de este documento antes del plan de implementación.
**Relacionado:** `Improvement/absorber-apps/07-whop-rea.md` (análisis REA de Whop del que sale este diseño), `organization` / `membership` / `permission_type` / `payment` / `company_request` (`packages/db/src/schema.ts`), `requireOrgMembership()` y `requireSection()` (`apps/improvement/server/auth/guard.ts`), `server/permissions/sections.ts`.

## Ajustes al bajar al plan (2026-10-19)

Al revisar el código para el plan de implementación salieron cinco ajustes; mandan sobre el texto de abajo:

1. **Barco sin muelle permitido.** El `check` queda solo como `kind <> 'muelle' or parent_org_id is null`. Un barco con `parent_org_id` nulo existe pero no está colgado de ningún muelle y no puede cobrar. La fila del muelle la crea un script de línea de comandos (`pnpm db:muelle`) que recibe el nombre por parámetro y adopta los barcos huérfanos. Así ninguna migración escribe el id ni el nombre de Summum (`.claude/rules/motor-generico.md`).
2. **Dinero en centavos enteros.** `ledger_entry.gross_cents` / `summum_fee_cents` (bigint) y `membership_plan.monthly_amount_cents` (integer), por `.claude/rules/base-de-datos.md`.
3. **Dos webhooks.** Los eventos de cuentas conectadas (`account.updated`, `payment_intent.succeeded` de cobros directos) llegan por el endpoint de Connect y los de la plataforma (`invoice.paid`) por el normal: `/api/stripe/connect` con `STRIPE_CONNECT_WEBHOOK_SECRET` y `/api/stripe/webhook` con `STRIPE_WEBHOOK_SECRET`. Mismo manejador.
4. **El dueño del barco hace sus acciones de Stripe en `apps/summum`** (`/barco/[orgId]`, protegido por ser dueño de ese barco): conectar su cuenta y crear ligas de cobro. La sección "Cobros" de `apps/improvement` muestra sus movimientos y enlaza ahí (`NEXT_PUBLIC_SUMMUM_URL`). Las llaves de Stripe nunca entran a `apps/improvement`.
5. **`stripe_account.stripe_customer_id`**: el cliente de Stripe del barco en la cuenta de la plataforma, para cobrarle la membresía.
6. **Cuentas con `controller`, no `type: 'express'`.** La documentación de Stripe marca el tipo Express como obsoleto para integraciones nuevas. Se crea la cuenta con `controller: { stripe_dashboard: { type: 'express' }, fees: { payer: 'application' }, losses: { payments: 'application' } }`, que da la misma experiencia. Plataforma y cuentas conectadas en México son la misma región, que es lo que exigen los cobros directos ([cuentas conectadas](https://docs.stripe.com/connect/accounts), [Express](https://docs.stripe.com/connect/express-accounts), [capacidades](https://docs.stripe.com/connect/account-capabilities)). Antes de producción se confirma con Stripe que la cuenta de plataforma de Summum tiene Connect activo en México.

## Problema

Summum es el muelle y cada Improvement es un barco. Hoy no existe el muelle en el sistema: cada empresa es una `organization` suelta, el único "padre" es la bandera `is_platform_admin` de Jose Carlos y lo que el cliente paga se captura a mano en `payment`. Ricardo, co-dueño de Summum, no tiene dónde ver nada sin entrar al panel interno de Jotapuntoce.

Whop resuelve esto con **compañías hijas** (`connected-companies` / `child_companies`): el padre crea hijas, les pone un sobreprecio (markup) a cada tipo de cobro, con porcentaje + cuota fija, de fábrica o personalizado, y lleva un libro contable por líneas. El casco copia esa forma, ajustada a las decisiones de Summum: **el dinero no se queda en Summum**, cobra con **Stripe Connect** desde ya y **toda modificación al sistema lleva la firma de los dos co-dueños**.

## Alcance

**Entra (el casco):** muelle y barcos en el esquema, los dueños del muelle, cuentas Stripe Express por barco, comisiones por tipo de cobro, niveles de membresía, libro contable alimentado por webhooks, panel `apps/summum` y sección "Cobros" del barco.

**No entra (otras specs):** Academia, match y aliadas (cuándo aplica `proyecto_summum`), contratación con hitos, bolsa de pymes, videollamada, procesador propio, tarjetas, reembolsos, disputas, retiros, reportes de estado de cuenta, crear/suspender/traspasar barcos desde el panel de Summum.

## Decisiones (confirmadas con Jose Carlos)

1. **Alcance:** el casco del muelle, no Summum completo.
2. **Dinero:** cobrar con Stripe Connect ya, no solo registrar.
3. **Cobros que entran:** membresía a cada barco, % de lo que vende el barco y % por proyecto entre aliadas (este último solo como mecanismo).
4. **Enfoque A:** mismo esquema (`packages/db`), Summum como fila padre de `organization`, panel en una app nueva `apps/summum`. Descartados: panel dentro de `apps/admin` (Ricardo vería lo interno de Jotapuntoce) y Summum como sistema separado con su propia base (duplica sesión y sincronización sin necesidad hoy).

## 1. El muelle y sus barcos

- `organization.kind`: `'muelle' | 'barco'`, `check` en base de datos. Migración: toda fila existente pasa a `barco`.
- `organization.parent_org_id`: FK a `organization.id`, nullable. `check`: `kind = 'muelle'` ⇔ `parent_org_id is null`.
- La fila de Summum se crea con el seed como `muelle`, y los barcos existentes se cuelgan de ella en la misma migración de datos del seed. **Ningún archivo bajo `packages/db/**` ni `apps/*/server/**` referencia el id ni el nombre de Summum**: el muelle de un barco se obtiene siempre de `parent_org_id` (`.claude/rules/motor-generico.md`).
- **Dueños del muelle:** Jose Carlos y Ricardo con `membership.role = 'owner'` en la fila del muelle. No se agrega rol nuevo.
- **Ser dueño del muelle no da acceso a lo interno del barco.** `requireOrgMembership(barcoId)` sigue exigiendo membresía en el barco. El panel de Summum solo lee datos de nivel muelle (sección 4).
- **Alta de barcos:** sin cambio de flujo. Al aprobar una `company_request` en `apps/admin`, el `organization` nuevo nace con `kind = 'barco'` y el `parent_org_id` del muelle de quien aprueba.

## 2. Stripe y las comisiones

### `stripe_account`
| Columna | Tipo | Nota |
|---|---|---|
| `org_id` | uuid, FK, **unique** | Un barco, una cuenta |
| `stripe_account_id` | text, unique | `acct_…` Express |
| `charges_enabled` | boolean, default false | Solo lo escribe el webhook |
| `payouts_enabled` | boolean, default false | Solo lo escribe el webhook |
| `details_submitted` | boolean, default false | Solo lo escribe el webhook |
| `created_at`, `updated_at` | timestamptz | |

El enlace de verificación (Account Link de Stripe) lo genera `apps/summum` a petición del dueño del barco. Ningún dato de identidad ni bancario se guarda en nuestra base.

### `fee_rate`
| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `muelle_org_id` | uuid, FK | |
| `barco_org_id` | uuid, FK, **nullable** | null = de fábrica; lleno = personalizada |
| `charge_kind` | text, `check in ('venta_propia','proyecto_summum')` | |
| `percent_bps` | integer, `check between 0 and 10000` | Centésimas de punto: 2500 = 25 % |
| `fixed_cents` | integer, default 0, `check >= 0` | |
| `currency` | text, default `'MXN'` | |

Índice único sobre `(muelle_org_id, coalesce(barco_org_id, …), charge_kind)` para que no existan dos tasas para el mismo caso. **Resolución:** la personalizada del barco gana; si no hay, la de fábrica; **si no hay ninguna, el cobro se rechaza** (nunca sale con 0 % por omisión).

La membresía no usa `fee_rate`: es un precio, no un porcentaje.

### `membership_plan` y nivel del barco
- `membership_plan`: `id`, `muelle_org_id`, `name`, `monthly_amount` (numeric 12,2), `currency`, `stripe_price_id`.
- `organization.membership_plan_id`: FK nullable (solo barcos).

### Los tres tipos de cobro
| `charge_kind` | Quién cobra a quién | Mecanismo Stripe |
|---|---|---|
| `membresia` | Summum → barco | Suscripción con el `stripe_price_id` del nivel; el pago se refleja en la tabla `payment` existente (`source = 'stripe'`, `external_ref` = id de la factura) |
| `venta_propia` | Barco → su cliente | Cobro directo (direct charge) en la cuenta del barco con `application_fee_amount` = comisión resuelta |
| `proyecto_summum` | Aliada (barco) → cliente que trajo Summum | Igual que `venta_propia` con la tasa de proyecto; quién dispara este tipo lo decide la spec de match |

El dinero llega a la cuenta del barco; Summum solo recibe su comisión. Summum no retiene fondos.

### Firma de los dos: `fee_rate_change`
- `id`, `muelle_org_id`, `fee_rate_id` (nullable si crea una tasa nueva), los valores propuestos (`barco_org_id`, `charge_kind`, `percent_bps`, `fixed_cents`), `proposed_by`, `proposed_at`, `approved_by`, `approved_at`, `rejected_at`.
- `check`: `approved_by <> proposed_by`.
- Al aprobar, en la misma transacción se escribe `fee_rate`. Solo un dueño del muelle distinto de quien propuso puede aprobar o rechazar; se valida en el servidor, no solo escondiendo el botón.
- Los cobros pasados no cambian: el libro guarda la tasa aplicada en cada fila.

## 3. El libro contable y los webhooks

### `ledger_entry` (solo se agregan filas)
| Columna | Tipo |
|---|---|
| `id` | uuid |
| `muelle_org_id`, `barco_org_id` | uuid, FK |
| `charge_kind` | text (`membresia` / `venta_propia` / `proyecto_summum`) |
| `gross_amount` | numeric 12,2 |
| `summum_fee_amount` | numeric 12,2 |
| `applied_percent_bps`, `applied_fixed_cents` | integer (tasa con la que se cobró) |
| `currency` | text |
| `stripe_object_id` | text, **unique** (idempotencia) |
| `created_at` | timestamptz |

Nunca se hace `update` ni `delete`; una corrección es otra fila que compensa.

### Webhook: `apps/summum/app/api/stripe/webhook/route.ts`
1. Verifica la firma con `STRIPE_WEBHOOK_SECRET`; si no coincide, **400 y no escribe nada**.
2. Parsea con `zod` solo los campos que usa.
3. Maneja:

| Evento | Efecto |
|---|---|
| `account.updated` | Actualiza `stripe_account` |
| `invoice.paid` | Marca `paid_at` en `payment` + fila `membresia` en el libro |
| `payment_intent.succeeded` | Fila `venta_propia` o `proyecto_summum` según el metadato que puso el servidor al crear el cobro |

4. Evento repetido: el `unique` de `stripe_object_id` lo ignora (insert con `on conflict do nothing`), responde 200.
5. Cuenta desconocida: se registra en log, responde 200 y no escribe nada.

**Margen del muelle:** suma de `summum_fee_amount` ÷ suma de `gross_amount` del periodo.

## 4. Panel y permisos

### `apps/summum` (Next.js 16, TypeScript, misma estructura que `apps/improvement`)
- **Barcos:** lista de barcos del muelle con nivel, estado de la cuenta Stripe y si va al corriente. Sin datos internos del barco.
- **Comisiones:** tasas de fábrica y personalizadas; propuestas pendientes con aprobar/rechazar (oculto para quien propuso y rechazado en el servidor).
- **Dinero:** libro del muelle con filtros por barco y tipo de cobro, más el margen.
- Diseño visual propio de Summum (skill `marca-summum-system`); tablas y tarjetas, sin escena 3D.

### En `apps/improvement`: sección **"Cobros"**
- Nuevo slug `cobros` en `SECTIONS` (`server/permissions/sections.ts`), alcance `empresa`. Por defecto solo el dueño; un empleado solo si su tipo de permiso lo concede.
- Botón para conectar la cuenta Stripe (pide el Account Link a `apps/summum`) y lista de sus movimientos con la comisión desglosada.

### Las dos puertas
- **App:** cada acción de `apps/summum/server/**` empieza con `requireDockOwnership(muelleId)`: sesión + `membership.role = 'owner'` en una `organization` con `kind = 'muelle'`; si no, **404** (nunca 403). En `apps/improvement`, `requireSection(orgId, 'cobros')`.
- **PostgREST:** `stripe_account`, `fee_rate`, `fee_rate_change`, `membership_plan` y `ledger_entry` se crean **con su política RLS en la misma migración**:
  - dueños del muelle: `select` de las filas de su muelle;
  - dueño del barco: `select` de sus filas en `ledger_entry` y `stripe_account`;
  - nadie escribe desde el rol `authenticated` (toda escritura va por servidor).

### Llaves y variables nuevas (se agregan a `.env.example`)
| Variable | Dónde | Nota |
|---|---|---|
| `STRIPE_SECRET_KEY` | servidor de `apps/summum` | Modo de prueba en desarrollo |
| `STRIPE_WEBHOOK_SECRET` | servidor de `apps/summum` | |

`apps/summum` **no usa** `SUPABASE_SERVICE_ROLE_KEY` (reservada a `apps/admin` por regla del repo); usa el cliente `db` como `apps/improvement`. Dependencia nueva: el SDK oficial `stripe`, versión a resolver con `stack-researcher` antes de fijarla.

## 5. Pruebas

Stripe siempre en **modo de prueba** con sus llaves y tarjetas de prueba publicadas.

- **Puras (Vitest):**
  - resolución de tasa (personalizada > de fábrica > rechazo);
  - cálculo de comisión en centavos con montos extremos;
  - firma de los dos (quien propone no aprueba; un no-dueño tampoco).
- **Webhook:** firma inválida → 400 sin escritura; evento duplicado → una sola fila; cuenta desconocida → 200 sin escritura.
- **Dos puertas (Supabase de pruebas):**
  - no-dueño del muelle → 404 en cada ruta de `apps/summum`;
  - dueño de un barco no ve el libro de otro;
  - con anon key + JWT de empleado o de dueño de otro barco, `select` en cada tabla nueva devuelve vacío.
- **Punta a punta (Playwright):** el barco conecta su cuenta → cobro `venta_propia` con tarjeta de prueba → el webhook escribe la fila → el dueño del muelle la ve en "Dinero" con monto y comisión correctos.
- **Gate:** `pnpm lint && pnpm typecheck && pnpm test` en verde.

## Riesgos y pendientes

- **Stripe Connect en México:** confirmar en la documentación oficial que cuentas Express con cobros directos y `application_fee` están disponibles para plataforma y cuentas conectadas en MX (la búsqueda del 2026-10-19 solo trajo la documentación general de Connect). Si no lo están, se escoge otro tipo de cuenta o de cobro antes del plan.
- **Ricardo** necesita cuenta en Supabase Auth y su `membership` de dueño en el muelle (dato, no código).
- **Precios de los niveles de membresía** y **tasas de fábrica** son datos que ponen Jose Carlos y Ricardo con la firma de los dos; el casco no trae valores de fábrica en código.
