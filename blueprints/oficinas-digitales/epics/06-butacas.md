# Epic 06: Butacas — mapas de lugares, apartado atómico, cobro directo y taquilla

> Al terminar, un org crea mapas de su recinto como datos (teatro, restaurante, antro, bodas, eventos, lotes), publica funciones, vende en taquilla con el mapa en vivo y deja que el público compre en `/butacas/<sessionId>` con un apartado atómico y un cargo directo en su propia cuenta conectada de Stripe. Sin comisión de Jotapuntoce, sin reembolsos automáticos, sin kioscos.

| | |
|---|---|
| **Epic id** | `06-butacas` |
| **Tasks** | `E6-T1` … `E6-T8` |
| **Depends on** | `05-agenda` (orden de `schema.ts`); `03-agentes` (la tarea `butacas` del runtime) |
| **Unlocks** | nada — último epic; §20.1 corre después del Checkpoint de E6-T8 (`step-46-od-butacas-publico`) |
| **Parallel with** | nada |

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
apps/improvement/package.json                      # exists, you will edit it (E6-T1: stripe 23.0.0 exacto)
pnpm-lock.yaml                                     # E6-T1: el importer de improvement gana stripe (ya resuelto para summum)
packages/db/
  src/schema.ts                                    # exists, you will edit it (E6-T2)
  migrations/                                      # db:generate + --custom butacas_rls
apps/improvement/
  server/stripe/client.ts                          # NEW (E6-T1) — getStripe(), perezoso
  server/seats/layouts.ts, venues.ts               # NEW (E6-T3)
  server/seats/hold.ts                             # NEW (E6-T4)
  server/seats/checkout.ts                         # NEW (E6-T5)
  server/seats/webhook.ts                          # NEW (E6-T6)
  server/seats/boxOffice.ts                        # NEW (E6-T7)
  server/seats/publicState.ts                      # NEW (E6-T8)
  server/agents/runtime.ts                         # exists, you will edit it (E6-T6: `butacas`)
  server/permissions/sections.ts                   # exists, you will edit it (E6-T3: `butacas`; E6-T7: OFICINAS_SLUGS)
  app/api/butacas/[sessionId]/apartar/route.ts     # NEW (E6-T5)
  app/api/stripe/butacas/route.ts                  # NEW (E6-T6) — endpoint Connect propio
  app/api/butacas/[sessionId]/estado/route.ts      # NEW (E6-T8)
  app/[org]/butacas/page.tsx, SeatMapLive.tsx      # NEW (E6-T7)
  app/butacas/[sessionId]/page.tsx, SeatPicker.tsx # NEW (E6-T8) — pública
  tests/stripe-client, butacas-schema, seats-venues, seats-hold, seats-checkout,
        seats-webhook (.test.ts)                   # NEW
  tests/e2e/butacas.spec.ts                        # NEW (E6-T7), grows in E6-T8
apps/summum/server/stripe/**                       # exists, read-only — NUNCA se importa ni se toca
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not listed
here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `venue_map` | `org_id`, `name`, `kind` (`teatro`\|`restaurante`\|`antro`\|`bodas`\|`eventos`\|`lotes`), `layout` jsonb (parámetros del generador) | |
| `venue_seat` | `org_id`, `map_id`, `label` (único por mapa), `section`, `x`, `y`, `kind` (`butaca`\|`mesa`\|`lugar`\|`lote`), `capacity` ≥ 1 | **Nunca** `seat` (es el Accountability Chart) |
| `venue_session` | `org_id`, `map_id` (restrict), `title`, `starts_at`, `status` (`borrador`\|`a_la_venta`\|`cerrada`), `price_cents` ≥ 0 | |
| `seat_booking` | `org_id`, `session_id`, `seat_id`, `status` (`held`\|`sold`\|`released`), `hold_token`, `hold_expires_at`, `price_cents`, `buyer_name`, `buyer_email`, `channel` (`web`\|`taquilla`), `stripe_checkout_session_id` | **Único (`session_id`, `seat_id`)**; `held` exige token y vencimiento; en `supabase_realtime` |
| `stripe_account` (existente, de Summum) | se lee `stripe_account_id`, `charges_enabled` por `org_id` | Solo lectura; lo escribe el webhook de Summum |

### Apéndice de esquema (copia de blueprint.md §4)

#### `butacas_rls`

```sql
-- Custom SQL migration file, put your code below! --
-- Butacas: dueño o sección `butacas` = empresa (taquilla). La página pública no pasa por aquí: lee con
-- el servidor y columnas explícitas.
alter table venue_map enable row level security;
create policy "members read venue maps their permission type allows"
  on venue_map for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = venue_map.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'butacas' = 'empresa')));

alter table venue_seat enable row level security;
create policy "members read venue seats their permission type allows"
  on venue_seat for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = venue_seat.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'butacas' = 'empresa')));

alter table venue_session enable row level security;
create policy "members read venue sessions their permission type allows"
  on venue_session for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = venue_session.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'butacas' = 'empresa')));

alter table seat_booking enable row level security;
create policy "members read seat bookings their permission type allows"
  on seat_booking for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = seat_booking.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'butacas' = 'empresa')));

grant select on venue_map, venue_seat, venue_session, seat_booking to authenticated;

-- La taquilla escucha cambios de seat_booking por Realtime, autorizados por la política de arriba.
alter publication supabase_realtime add table seat_booking;
```

## Flujo del cobro (copia de blueprint.md §5)

1. `POST /api/butacas/<sessionId>/apartar` → `holdSeats` (31 min, todo o nada) → `checkout.sessions.create`
   con `expires_at` = el mismo instante del apartado (Stripe exige entre 30 min y 24 h desde la creación:
   31 min deja margen) y la opción por petición `{ stripeAccount: <stripe_account_id del org> }` (cargo
   directo; sin `application_fee_amount`).
2. `checkout.session.completed` llega a `POST /api/stripe/butacas` (endpoint de Connect con
   `STRIPE_SEATS_WEBHOOK_SECRET`) → `sold` solo si el `hold_token` sigue `held` y
   `hold_expires_at > to_timestamp(event.created)`; si no, log `seat_paid_after_expiry` (reembolso manual).
3. `checkout.session.expired` → `releaseHold`. La tarea `butacas` del worker (cada minuto) libera los
   apartados vencidos hace más de 10 min.
4. Sin `charges_enabled` → `TAQUILLA_ONLY` y la página pública muestra "Esta función se vende solo en taquilla."

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `stripe_account` (`packages/db/src/schema.ts`) | Una fila por org; `charges_enabled` lo escribe Summum |
| repo | `server/auth/guard.ts` → `findOwnerMembership`, `resolveSection`, `requireSection`, `getSessionAccessToken` | 404 nunca 403 |
| `01-base` | `requireEnv("STRIPE_SECRET_KEY")`, `requireEnv("STRIPE_SEATS_WEBHOOK_SECRET")` | Exigidas solo al usarse |
| `03-agentes` | `runTarea("butacas")` en `{ procesadas: 0 }` | Este epic la conecta |

**Produced** — the end of the build; nothing later depends on these, but §20.1 does:

| Export | Signature | Used by |
|---|---|---|
| `server/stripe/client.ts` → `getStripe`, `StripeLike` | `getStripe(): Stripe` perezoso; `StripeLike = Pick<Stripe, "checkout" \| "webhooks">` | checkout, webhook |
| `server/seats/hold.ts` → `HOLD_MINUTES`, `holdSeats`, `releaseHold`, `releaseExpired` | `holdSeats({ sessionId, seatIds, channel, now }) → Result<{ holdToken, expiresAt }>`; `SEATS_TAKEN` | checkout, taquilla, runtime |
| `server/seats/publicState.ts` → `loadPublicSeatState` | columnas explícitas; `status` `libre`\|`ocupado` | página y ruta públicas |

## Conventions that bite in this area

- **`seat` no se toca.** Todo lugar de un recinto es `venue_seat`; `seat_booking.seat_id` apunta a `venue_seat`.
- **El apartado es una sola sentencia** `insert … on conflict (session_id, seat_id) do update … where released or vencido returning`;
  menos filas que lugares pedidos → `rollback`. Nunca "leer y luego escribir".
- **Cargo directo**: la opción `stripeAccount` va en el **segundo** argumento de `create` (opciones de la
  petición), no en los parámetros. E6-T1 comprueba que los tipos instalados la declaran.
- **El webhook lee el cuerpo crudo** (`request.text()`) antes de `constructEvent`; nunca `request.json()`.
- **Sin reembolsos automáticos ni comisión**: no hay `refunds.create` ni `application_fee_amount` en `server/seats`.
- **La página pública hace polling cada 5 s** a la ruta de estado (`ponytail:`), no Realtime: el visitante
  no tiene JWT y `seat_booking` no tiene política para `anon`.
- **Dos puertas, import con `.ts`, resultados tipados, `--custom` solo para RLS, `grep` de uuid**, y
  `":(literal)…"` para rutas con corchetes en `git add`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/oficinas-digitales.md`,
`.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`.

---

## Tasks

### `E6-T1` — Stripe en Improvement y la opción stripeAccount verificada

**Depends on:** `E5-T8` · **Priority:** p0 · **Step:** 39

Primer paso de E6 a propósito: la opción por petición `stripeAccount` (cargo directo en la cuenta conectada)
se da por buena **solo** si los tipos del SDK instalado la declaran. Si el `grep` de abajo sale distinto de 0,
detente y reporta: el resto del epic depende de ese nombre.

1. `pnpm --filter improvement add stripe@23.0.0 --save-exact` — la misma versión exacta que `apps/summum` (ya
   está en `pnpm-lock.yaml`; la más nueva publicada es 23.1.0 y no se toma). Regla 8 de `CLAUDE.md`: el
   mensaje del commit dice por qué (cobro directo de butacas; verificar firmas de webhook a mano no es
   opción).
2. `apps/improvement/server/stripe/client.ts`: `getStripe()` — una instancia perezosa de
   `new Stripe(requireEnv("STRIPE_SECRET_KEY"))` sin `apiVersion` explícita (usa la que fija el SDK 23.0.0, igual
   que `apps/summum/server/stripe/client.ts`, que **no** se importa ni se toca). `type StripeLike = Pick<Stripe, "checkout" | "webhooks">`
   para inyectar uno falso en pruebas.
3. `apps/improvement/tests/stripe-client.test.ts`: sin `STRIPE_SECRET_KEY`, `getStripe()` lanza con el nombre
   de la variable; con `vi.stubEnv` de una llave `sk_test_` inventada (patrón de env de §9: `vi.stubEnv` + `vi.resetModules()` + `await import(…)` del módulo bajo prueba), devuelve un objeto con
   `checkout.sessions.create` y `webhooks.constructEvent` como funciones (sin red).

**Files**
- `apps/improvement/package.json`
- `pnpm-lock.yaml`
- `apps/improvement/server/stripe/client.ts`
- `apps/improvement/tests/stripe-client.test.ts`

**Acceptance**
1. **WHEN** se lee `apps/improvement/package.json` **THE SYSTEM SHALL** declarar `"stripe": "23.0.0"` exacto.
2. **WHEN** se buscan los tipos del SDK instalado **THE SYSTEM SHALL** encontrar la opción `stripeAccount` en un archivo `.d.ts` de `apps/improvement/node_modules/stripe/`.
3. **WHEN** `getStripe()` corre sin `STRIPE_SECRET_KEY` **THE SYSTEM SHALL** lanzar un error cuyo mensaje contiene `STRIPE_SECRET_KEY no está configurada`.
4. **WHEN** `pnpm install --frozen-lockfile` corre después de este paso **THE SYSTEM SHALL** salir 0.

**Verify**
```bash
grep -q '"stripe": "23.0.0"' apps/improvement/package.json
grep -rq --include='*.d.ts' 'stripeAccount' apps/improvement/node_modules/stripe/
pnpm install --frozen-lockfile
pnpm --filter improvement test tests/stripe-client.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/package.json pnpm-lock.yaml apps/improvement/server/stripe/client.ts apps/improvement/tests/stripe-client.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E6-T1 (step 39): dep stripe 23.0.0 exacto en improvement (cobro directo de butacas; misma versión que summum)"
git tag step-39-od-stripe
git ls-files --error-unmatch apps/improvement/server/stripe/client.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E6-T2` — Esquema de mapas, funciones y apartados con RLS

**Depends on:** `E5-T1` · **Priority:** p0 · **Step:** 40

`seat` (Accountability Chart) **no se toca ni se reusa**: los lugares de un recinto son `venue_seat`.
1. `packages/db/src/schema.ts`:
   - `VENUE_KINDS = ["teatro", "restaurante", "antro", "bodas", "eventos", "lotes"] as const`,
     `VENUE_SEAT_KINDS = ["butaca", "mesa", "lugar", "lote"] as const`,
     `VENUE_SESSION_STATUSES = ["borrador", "a_la_venta", "cerrada"] as const`,
     `SEAT_BOOKING_STATUSES = ["held", "sold", "released"] as const`, `SEAT_BOOKING_CHANNELS = ["web", "taquilla"] as const`.
   - `venue_map`: `id`, `org_id` (cascade), `name`, `kind`, `layout` jsonb not null (los parámetros del
     generador), `created_at`, `updated_at`.
   - `venue_seat`: `id`, `org_id` (cascade), `map_id` (cascade), `label` text not null, `section` text null,
     `x`, `y` integer not null, `kind`, `capacity` integer not null default 1 (≥ 1); `uniqueIndex("uq_venue_seat_map_label")`.
   - `venue_session`: `id`, `org_id` (cascade), `map_id` (→ venue_map, **restrict**), `title`, `starts_at`,
     `status` (default `"borrador"`), `price_cents` bigint not null (≥ 0), `created_at`, `updated_at`.
   - `seat_booking`: `id`, `org_id` (cascade), `session_id` (→ venue_session, cascade), `seat_id` (→ venue_seat,
     cascade), `status`, `hold_token` uuid null, `hold_expires_at` timestamptz null, `price_cents` bigint not
     null (≥ 0), `buyer_name` text null, `buyer_email` text null, `channel`, `stripe_checkout_session_id` text
     null, `created_at`, `updated_at`. `unique("uq_seat_booking_session_seat").on(sessionId, seatId)` (una fila
     por lugar y función; se re-aparta con upsert), check `seat_booking_hold_check`
     (`status <> 'held' or (hold_token is not null and hold_expires_at is not null)`), índice (`hold_token`).
2. `pnpm db:generate`.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=butacas_rls` y pega, completo, el SQL
   de §4 *Migración `butacas_rls`* (incluye la publicación de `seat_booking`).
4. `apps/improvement/tests/butacas-schema.test.ts` con el patrón `asUser()`.
5. **Aprobación obligatoria.** Muestra los dos SQL a Jose Carlos y espera un "sí" explícito. Sin "sí", detente.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts`
- `packages/db/migrations/**`
- `apps/improvement/tests/butacas-schema.test.ts`

**Acceptance**
1. **WHEN** se insertan dos `seat_booking` para la misma función y el mismo lugar **THE SYSTEM SHALL** rechazar la segunda.
2. **WHEN** se inserta un `seat_booking` `held` sin `hold_expires_at` **THE SYSTEM SHALL** rechazarlo.
3. **WHEN** un empleado con `butacas` = `empresa` consulta `seat_booking` como `authenticated` **THE SYSTEM SHALL** ver los de su org, y **WHEN** consulta un empleado sin ese permiso **THE SYSTEM SHALL** devolver 0 filas.
4. **WHEN** se consulta `pg_publication_tables` **THE SYSTEM SHALL** listar `seat_booking` en `supabase_realtime`.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**
```bash
grep -q 'alter publication supabase_realtime add table seat_booking;' packages/db/migrations/*.sql
pnpm --filter improvement test tests/butacas-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/butacas-schema.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E6-T2 (step 40): esquema venue_map, venue_seat, venue_session y seat_booking con RLS"
git tag step-40-od-butacas-esquema
git ls-files --error-unmatch apps/improvement/tests/butacas-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E6-T3` — Mapas como datos: plantillas por tipo de lugar

**Depends on:** `E6-T2` · **Priority:** p0 · **Step:** 41

1. `server/permissions/sections.ts`: `"butacas"` al final de `SECTION_SLUGS` (`label: "Butacas"`,
   `hint: "Mapas de lugares, funciones y taquilla."`, `scopes: ["empresa"]`) — `resolveSection(…, "butacas")`
   lo necesita para tipar; el enlace en `OFICINAS_SLUGS` llega en el paso 45.
2. `server/seats/layouts.ts` (puro): `generateLayout(kind, params)` → `{ label, section, x, y, kind, capacity }[]`.
   `teatro` (`rows` 1-30, `seatsPerRow` 1-40): filas `A`, `B`… y etiqueta `A1`…; `restaurante`, `antro`,
   `bodas`, `eventos` (`tables` 1-60, `seatsPerTable` con default 4 para `restaurante`/`antro` y 10 para
   `bodas`/`eventos`): mesas `M1`… en cuadrícula de `ceil(sqrt(tables))` columnas, `kind = 'mesa'`, `capacity`
   = `seatsPerTable`; `lotes` (`blocks` 1-20, `lotsPerBlock` 1-50): `M<manzana>-L<lote>`, `kind = 'lote'`.
   Parámetros con `zod`; más de 2000 lugares → `VALIDATION_ERROR`. Ninguna plantilla de un cliente: el mapa es
   una fila de datos.
3. `server/seats/venues.ts`: guard `resolveSection(userId, orgId, "butacas")` = `empresa` (el dueño siempre);
   `createVenueMap(userId, orgId, { name, kind, params })` (mapa + lugares en una transacción),
   `createVenueSession(userId, orgId, { mapId, title, startsAt, priceCents })`, `publishSession` (→ `a_la_venta`),
   `closeSession`, `listSessions`.
4. `apps/improvement/tests/seats-venues.test.ts`.

**Files**
- `apps/improvement/server/seats/layouts.ts`
- `apps/improvement/server/seats/venues.ts`
- `apps/improvement/server/permissions/sections.ts`
- `apps/improvement/tests/seats-venues.test.ts`

**Acceptance**
1. **WHEN** `generateLayout("teatro", { rows: 3, seatsPerRow: 4 })` corre **THE SYSTEM SHALL** devolver 12 butacas de `A1` a `C4`.
2. **WHEN** `generateLayout("lotes", { blocks: 2, lotsPerBlock: 3 })` corre **THE SYSTEM SHALL** devolver `M1-L1` a `M2-L3` con `kind` `lote`.
3. **WHEN** los parámetros darían más de 2000 lugares **THE SYSTEM SHALL** devolver `VALIDATION_ERROR` sin escribir.
4. **WHEN** el dueño crea un mapa de `bodas` con 5 mesas **THE SYSTEM SHALL** guardar 5 `venue_seat` con `capacity` 10, y **WHEN** un empleado sin `butacas` lo intenta **THE SYSTEM SHALL** devolver `NOT_FOUND`.

**Verify**
```bash
pnpm --filter improvement test tests/seats-venues.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/seats || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/seats/layouts.ts apps/improvement/server/seats/venues.ts apps/improvement/server/permissions/sections.ts apps/improvement/tests/seats-venues.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E6-T3 (step 41): mapas de recinto generados como datos"
git tag step-41-od-mapas
git ls-files --error-unmatch apps/improvement/server/seats/layouts.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E6-T4` — Apartado atómico con prueba de concurrencia

**Depends on:** `E6-T3` · **Priority:** p0 · **Step:** 42

`server/seats/hold.ts` — funciones del flujo público (sin usuario), documentado en su comentario:
1. `HOLD_MINUTES = 31`. `holdSeats({ sessionId, seatIds, channel, now })`: 1-10 `seatIds` del mapa de la
   función; la función debe estar `a_la_venta`. En **una** transacción, para todos los lugares a la vez:
   ```sql
   insert into seat_booking (org_id, session_id, seat_id, status, hold_token, hold_expires_at, price_cents, channel)
   values … -- un renglón por lugar, mismo hold_token y hold_expires_at = now + 31 min
   on conflict (session_id, seat_id) do update
     set status = 'held', hold_token = excluded.hold_token, hold_expires_at = excluded.hold_expires_at,
         price_cents = excluded.price_cents, channel = excluded.channel, buyer_name = null, buyer_email = null,
         stripe_checkout_session_id = null, updated_at = now()
     where seat_booking.status = 'released'
        or (seat_booking.status = 'held' and seat_booking.hold_expires_at < now())
   returning seat_id;
   ```
   Si regresan menos filas que lugares pedidos → `rollback` y
   `{ ok: false, error: { code: "SEATS_TAKEN", message: "Alguno de esos lugares ya no está disponible." } }`
   — nunca un apartado parcial. Si no, `{ ok: true, data: { holdToken, expiresAt } }`.
2. `releaseHold(holdToken)` → `released` si sigue `held` con ese token. `releaseExpired(now)` → `released` los
   `held` con `hold_expires_at < now - 10 min` (gracia para webhooks tardíos); devuelve cuántos.
3. `apps/improvement/tests/seats-hold.test.ts`: concurrencia real con `Promise.all` contra la base.

**Files**
- `apps/improvement/server/seats/hold.ts`
- `apps/improvement/tests/seats-hold.test.ts`

**Acceptance**
1. **WHEN** dos apartados del mismo lugar corren al mismo tiempo **THE SYSTEM SHALL** dejar exactamente uno con `ok` en `true` y el otro con `SEATS_TAKEN`.
2. **WHEN** dos apartados de `[A1, A2]` y `[A2, A3]` corren al mismo tiempo **THE SYSTEM SHALL** dejar apartados todos los lugares de uno y ninguno del otro.
3. **WHEN** un lugar tiene un apartado vencido **THE SYSTEM SHALL** permitir apartarlo de nuevo con un `hold_token` nuevo.
4. **WHEN** se piden 11 lugares o la función está en `borrador` **THE SYSTEM SHALL** devolver `VALIDATION_ERROR` sin escribir.
5. **WHEN** `releaseExpired` corre **THE SYSTEM SHALL** liberar solo los apartados vencidos hace más de 10 minutos.

**Verify**
```bash
pnpm --filter improvement test tests/seats-hold.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/seats/hold.ts apps/improvement/tests/seats-hold.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E6-T4 (step 42): apartado atómico de lugares con prueba de concurrencia"
git tag step-42-od-apartado
git ls-files --error-unmatch apps/improvement/server/seats/hold.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E6-T5` — Checkout directo en la cuenta conectada

**Depends on:** `E6-T4`, `E6-T1` · **Priority:** p0 · **Step:** 43

1. `server/seats/checkout.ts`: `startSeatCheckout({ sessionId, seatIds, buyer: { name, email }, now }, deps?: { stripe?: StripeLike })`:
   - lee la función, su org y la fila de `stripe_account` del org (la misma tabla que usa Summum, solo
     lectura); sin fila o `charges_enabled = false` →
     `{ ok: false, error: { code: "TAQUILLA_ONLY", message: "Esta función se vende solo en taquilla." } }` sin apartar;
   - `holdSeats({ …, channel: "web" })`;
   - `stripe.checkout.sessions.create({ mode: "payment", line_items: [un renglón por lugar con price_data { currency: "mxn", unit_amount: price_cents, product_data: { name: "<función> — <lugar>" } }], customer_email, expires_at: Math.floor(expiresAt.getTime() / 1000), metadata: { hold_token, venue_session_id }, success_url, cancel_url }, { stripeAccount: stripe_account.stripe_account_id })`
     — **cargo directo** en la cuenta conectada, sin `application_fee_amount` (Jotapuntoce no cobra comisión);
     `expires_at` es **el mismo instante** que `hold_expires_at`; `success_url`/`cancel_url` sobre
     `${NEXT_PUBLIC_APP_URL}/butacas/<sessionId>?pago=ok|cancelado`;
   - guarda `stripe_checkout_session_id` en los `seat_booking` del apartado; si Stripe falla, `releaseHold` y
     `{ ok: false, error: { code: "PAYMENT_UNAVAILABLE" } }`.
2. `app/api/butacas/[sessionId]/apartar/route.ts`: `POST` con cuerpo `zod` (`seatIds` 1-10, `name` 1-80,
   `email`); 200 `{ ok: true, data: { url } }`; 409 con `SEATS_TAKEN` o `TAQUILLA_ONLY`; 400 con
   `VALIDATION_ERROR`; 503 con `PAYMENT_UNAVAILABLE`.
3. `tests/seats-checkout.test.ts` con un `StripeLike` falso que registra argumentos.

**Files**
- `apps/improvement/server/seats/checkout.ts`
- `apps/improvement/app/api/butacas/[sessionId]/apartar/route.ts`
- `apps/improvement/tests/seats-checkout.test.ts`

**Acceptance**
1. **WHEN** el org tiene `charges_enabled` en `true` **THE SYSTEM SHALL** crear la sesión de Checkout con la opción `stripeAccount` igual al `stripe_account_id` del org y sin `application_fee_amount`.
2. **WHEN** se crea la sesión de Checkout **THE SYSTEM SHALL** mandar `expires_at` igual, en segundos, al `hold_expires_at` del apartado.
3. **WHEN** el org no tiene `charges_enabled` **THE SYSTEM SHALL** responder 409 con `TAQUILLA_ONLY` sin apartar ningún lugar.
4. **WHEN** Stripe lanza un error **THE SYSTEM SHALL** liberar el apartado y responder 503.
5. **WHEN** la ruta recibe 11 lugares **THE SYSTEM SHALL** responder 400 sin apartar.

**Verify**
```bash
pnpm --filter improvement test tests/seats-checkout.test.ts
status=0; grep -rn 'application_fee' apps/improvement/server/seats || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/seats/checkout.ts ":(literal)apps/improvement/app/api/butacas/[sessionId]/apartar/route.ts" apps/improvement/tests/seats-checkout.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E6-T5 (step 43): checkout directo en la cuenta conectada con vencimiento igual al apartado"
git tag step-43-od-checkout
git ls-files --error-unmatch apps/improvement/server/seats/checkout.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E6-T6` — Webhook de butacas y barrido de apartados vencidos

**Depends on:** `E6-T5`, `E5-T6` · **Priority:** p0 · **Step:** 44

1. `app/api/stripe/butacas/route.ts`: `POST`; `const raw = await request.text()` (cuerpo crudo, nunca
   `json()`), `stripe-signature` del header,
   `getStripe().webhooks.constructEvent(raw, signature, requireEnv("STRIPE_SEATS_WEBHOOK_SECRET"))`; firma
   inválida → 400. Si no, `handleSeatEvent(event)` y 200 `{ received: true }`. Es un endpoint **nuevo** con su
   propio secreto, registrado en Stripe como endpoint de **Connect** (`§20.1`); los webhooks de Summum no se tocan.
2. `server/seats/webhook.ts`: `handleSeatEvent(event)`:
   - `checkout.session.completed`: `hold_token` y `venue_session_id` de `metadata`; el `event.account` debe
     ser el `stripe_account_id` del org de la función (si no, log `seat_webhook_account_mismatch` e ignora);
     en una transacción
     `update seat_booking set status = 'sold', buyer_name = …, buyer_email = … where hold_token = $1 and status = 'held' and hold_expires_at > to_timestamp($created) returning seat_id`
     con `$created = event.created` (el instante del pago, no el de la entrega del webhook). Si el número de
     filas no es el de lugares del apartado → `rollback` y log `seat_paid_after_expiry` con el id de la sesión
     de Checkout (reembolso manual; no hay reembolsos automáticos).
   - `checkout.session.expired` → `releaseHold(hold_token)`.
   - Cualquier otro tipo → se ignora.
3. `server/agents/runtime.ts`: `butacas` → `releaseExpired(now)` y devuelve `{ procesadas }`.
4. `tests/seats-webhook.test.ts`: payloads firmados con `stripe.webhooks.generateTestHeaderString({ payload, secret })`
   y un secreto de prueba en `vi.stubEnv` (patrón de env de §9: `vi.stubEnv` + `vi.resetModules()` + `await import(…)` del módulo bajo prueba).

**Files**
- `apps/improvement/app/api/stripe/butacas/route.ts`
- `apps/improvement/server/seats/webhook.ts`
- `apps/improvement/server/agents/runtime.ts`
- `apps/improvement/tests/seats-webhook.test.ts`

**Acceptance**
1. **WHEN** llega un `checkout.session.completed` con firma válida de un apartado vigente **THE SYSTEM SHALL** marcar sus lugares `sold` con el nombre y correo del comprador.
2. **WHEN** la firma no es válida **THE SYSTEM SHALL** responder 400 sin escribir.
3. **WHEN** el lugar ya lo apartó otro comprador con otro `hold_token` **THE SYSTEM SHALL** dejar el apartado nuevo intacto y registrar `seat_paid_after_expiry`.
4. **WHEN** llega un `checkout.session.expired` **THE SYSTEM SHALL** liberar los lugares de ese apartado.
5. **WHEN** `runTarea("butacas")` corre con un apartado vencido hace 11 minutos **THE SYSTEM SHALL** liberarlo y devolver `procesadas` 1.

**Verify**
```bash
pnpm --filter improvement test tests/seats-webhook.test.ts
pnpm --filter improvement test tests/agents-runtime.test.ts tests/calendar-sync.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/app/api/stripe/butacas/route.ts apps/improvement/server/seats/webhook.ts apps/improvement/server/agents/runtime.ts apps/improvement/tests/seats-webhook.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E6-T6 (step 44): webhook Connect de butacas y barrido de apartados vencidos"
git tag step-44-od-webhook
git ls-files --error-unmatch apps/improvement/app/api/stripe/butacas/route.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E6-T7` — Taquilla con Realtime

**Depends on:** `E6-T6`, `E5-T7` · **Priority:** p1 · **Step:** 45

1. `server/permissions/sections.ts`: `"butacas"` a `OFICINAS_SLUGS`.
2. `server/seats/boxOffice.ts`: `sellAtBox(userId, orgId, { sessionId, seatIds, buyerName? })` —
   `resolveSection(…, "butacas")` = `empresa`; `holdSeats({ …, channel: "taquilla" })` y, con el mismo
   `hold_token`, `sold` en la misma llamada; `loadSeatMap(userId, orgId, sessionId)` → lugares con su estado
   (`libre`, `apartado`, `vendido`).
3. `app/[org]/butacas/page.tsx`: `requireSection(org, "butacas")`; crear mapa (tipo + parámetros), crear y
   publicar función, elegir función y vender en taquilla los lugares marcados. Estado con texto además de
   color (Disponible / Apartado / Vendido).
4. `app/[org]/butacas/SeatMapLive.tsx` (`"use client"`): dibuja el mapa y se suscribe a `postgres_changes` de
   `seat_booking` con `filter: \`session_id=eq.${sessionId}\`` bajo el JWT del usuario (`realtime.setAuth`),
   `router.refresh()` en cada evento. RLS decide qué llega.
5. `tests/e2e/butacas.spec.ts` (`serial`).

**Files**
- `apps/improvement/server/seats/boxOffice.ts`
- `apps/improvement/app/[org]/butacas/page.tsx`
- `apps/improvement/app/[org]/butacas/SeatMapLive.tsx`
- `apps/improvement/server/permissions/sections.ts`
- `apps/improvement/tests/e2e/butacas.spec.ts`

**Acceptance**
1. **WHEN** el dueño crea un mapa `teatro` de 2×3, publica una función y vende `A1` en taquilla **THE SYSTEM SHALL** mostrar `A1` como Vendido.
2. **WHEN** el dueño vende un lugar **THE SYSTEM SHALL** mostrarlo como Vendido en la página abierta de un empleado con `butacas` = `empresa` sin recargar en menos de 10 segundos.
3. **WHEN** un empleado sin permiso de `butacas` abre `/[org]/butacas` **THE SYSTEM SHALL** responder 404.
4. **WHEN** AxeBuilder analiza `/[org]/butacas` **THE SYSTEM SHALL** reportar 0 violaciones.

**Verify**
```bash
pnpm --filter improvement test:e2e butacas.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/seats/boxOffice.ts ":(literal)apps/improvement/app/[org]/butacas/page.tsx" ":(literal)apps/improvement/app/[org]/butacas/SeatMapLive.tsx" apps/improvement/server/permissions/sections.ts apps/improvement/tests/e2e/butacas.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E6-T7 (step 45): taquilla con mapa en vivo por Realtime"
git tag step-45-od-taquilla
git ls-files --error-unmatch ":(literal)apps/improvement/app/[org]/butacas/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E6-T8` — Página pública de butacas

**Depends on:** `E6-T7` · **Priority:** p1 · **Step:** 46

1. `server/seats/publicState.ts`: `loadPublicSeatState(sessionId, now)` — sin sesión, `select` de columnas
   explícitas: `{ title, startsAt, priceCents, ventaEnLinea, seats: [{ id, label, x, y, kind, status }] }`
   con `status` `libre` u `ocupado` (vendido, o apartado sin vencer). Nunca nombre, correo, `hold_token` ni
   `org_id`. `null` si la función no está `a_la_venta`.
2. `app/api/butacas/[sessionId]/estado/route.ts`: `GET` → 200 con el estado, 404 si `null`;
   `Cache-Control: no-store`.
3. `app/butacas/[sessionId]/page.tsx` (pública, fuera de `[org]`): render inicial con `loadPublicSeatState`;
   `notFound()` si `null`.
4. `app/butacas/[sessionId]/SeatPicker.tsx` (`"use client"`): consulta la ruta de estado cada 5 s
   (`// ponytail: polling cada 5 s; sube a Realtime Broadcast si la carga lo pide`), elige hasta 10 lugares
   libres, pide nombre y correo, `POST` a `/api/butacas/<sessionId>/apartar` y redirige a la `url`; con
   `TAQUILLA_ONLY` muestra "Esta función se vende solo en taquilla." en `role="status"`.
5. `tests/e2e/butacas.spec.ts`: dos pruebas más. El gate de §20.1 **no** es parte de este paso: corre después
   del Checkpoint, cuando ya existe la etiqueta `step-46-od-butacas-publico` (§20.1 cuenta 46).

**Files**
- `apps/improvement/server/seats/publicState.ts`
- `apps/improvement/app/api/butacas/[sessionId]/estado/route.ts`
- `apps/improvement/app/butacas/[sessionId]/page.tsx`
- `apps/improvement/app/butacas/[sessionId]/SeatPicker.tsx`
- `apps/improvement/tests/e2e/butacas.spec.ts`

**Acceptance**
1. **WHEN** un visitante sin sesión abre `/butacas/<sessionId>` después de que la taquilla vendió `A1` **THE SYSTEM SHALL** mostrar `A1` como ocupado.
2. **WHEN** el visitante intenta comprar en una función de un org sin `charges_enabled` **THE SYSTEM SHALL** mostrar `Esta función se vende solo en taquilla.`
3. **WHEN** se pide `GET /api/butacas/<sessionId>/estado` **THE SYSTEM SHALL** responder sin el nombre ni el correo de ningún comprador.
4. **WHEN** AxeBuilder analiza `/butacas/<sessionId>` **THE SYSTEM SHALL** reportar 0 violaciones.

**Verify**
```bash
pnpm --filter improvement test:e2e butacas.spec.ts
test "$(git tag -l 'step-*-od-*' | wc -l)" -eq 45
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/seats/publicState.ts ":(literal)apps/improvement/app/api/butacas/[sessionId]/estado/route.ts" ":(literal)apps/improvement/app/butacas/[sessionId]/page.tsx" ":(literal)apps/improvement/app/butacas/[sessionId]/SeatPicker.tsx" apps/improvement/tests/e2e/butacas.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E6-T8 (step 46): página pública de butacas con estado por polling"
git tag step-46-od-butacas-publico
git ls-files --error-unmatch ":(literal)apps/improvement/app/butacas/[sessionId]/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e butacas.spec.ts` corre completo **THE SYSTEM SHALL** salir con código 0, con `/[org]/butacas` y `/butacas/<sessionId>` auditadas por axe sin violaciones.
2. **WHEN** el gate de §20.1 corre después del Checkpoint de E6-T8 (ya existe `step-46-od-butacas-publico`) **THE SYSTEM SHALL** salir 0 en cada línea.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e butacas.spec.ts
pnpm build
```

## Pitfalls

- **Llamar a la tabla `seat`** — ya existe y es el Accountability Chart.
- **Apartar con `select` + `insert`** — dos compradores ganan el mismo lugar; usa la sentencia única con `on conflict`.
- **`stripeAccount` en los parámetros** — va en el segundo argumento (opciones por petición).
- **`expires_at` en milisegundos** — Stripe lo pide en segundos: `Math.floor(expiresAt.getTime() / 1000)`.
- **Parsear el webhook con `request.json()`** — rompe la firma; `request.text()` primero.
- **Importar `apps/summum/server/stripe/**`** — las apps no se importan entre sí; Improvement tiene su propio `getStripe()`.
- **Agregar `refunds.create` "para el caso tardío"** — los reembolsos son manuales en v1 (log `seat_paid_after_expiry`).
- **Llamar a Stripe de verdad en una prueba** — siempre un `StripeLike` falso; las firmas se generan con `stripe.webhooks.generateTestHeaderString`.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-od-*'` los lista (8 de este epic; 46 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] El mensaje del commit de E6-T1 dice por qué entra `stripe` (regla 8 de `CLAUDE.md`).
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Las migraciones de E6-T2 se aplicaron solo después de un "sí" explícito de Jose Carlos.
