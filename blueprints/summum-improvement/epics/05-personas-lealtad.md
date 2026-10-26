# Epic 05: Personas tipo Ninety y lealtad para los clientes del cliente

> Al terminar, Improvement tiene Accountability Chart, check-in semanal y 1-a-1 privados, People Analyzer sin ranking, celebraciones e insights agregados, y un programa de lealtad con KPI de retorno en experiencias y un monedero web público por token.

| | |
|---|---|
| **Epic id** | `05-personas-lealtad` |
| **Tasks** | `E5-T1` … `E5-T7` |
| **Depends on** | `01-operacion`, `04-comunidad` (cadena de `schema.ts`) |
| **Unlocks** | nada — es el último |
| **Parallel with** | nada: comparte `packages/db/src/schema.ts` |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16.3.3 App Router · TypeScript 6 · Tailwind CSS v4 sobre tokens de `packages/ui/src/tokens.css`
(tema oscuro fijo) · Postgres del **Supabase compartido** (sin base local, sin Docker) · Drizzle ORM
0.45 (`packages/db`) · Supabase Auth + los guards de cada app · Vercel.
Package manager: `pnpm` 11.24.0. Runtime pinned in `.nvmrc` (24.19.0). Dependency versions are in
the lockfile — read it, never guess one. **Este cambio no agrega ni actualiza dependencias.**

| Task | Command |
|---|---|
| Dev | `pnpm dev:improvement` — http://localhost:3200 · `pnpm dev:summum` — http://localhost:3300 |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (todo) | `pnpm test` |
| Test (un archivo) | `pnpm --filter improvement test tests/<archivo>.test.ts` · `pnpm --filter @jotapuntoce/summum test tests/<archivo>.test.ts` |
| E2E (un spec) | `pnpm --filter improvement test:e2e <spec>.spec.ts` · `pnpm --filter @jotapuntoce/summum test:e2e <spec>.spec.ts` |
| DB — generar migración | `pnpm db:generate` · RLS: `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=<nombre>_rls` |
| DB — aplicar | `pnpm db:migrate` — **solo con un "sí" explícito de Jose Carlos**; la herramienta pide confirmación (`permissions.ask`) |
| Local services | NOT APPLICABLE — no hay servicios locales: la base es el Supabase compartido, con las llaves en `apps/improvement/.env.test`, `apps/summum/.env.test` y el `.env.local` de la raíz |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

Las pruebas de integración hablan con el Supabase compartido. Sin los `.env.test` y el `.env.local` de
la raíz con valores reales no corren: es esperado; detente y repórtalo, nunca uses una base falsa.
**Nunca `git add -A`**: el árbol trae WIP del usuario (`apps/admin/*`, `.claude/launch.json`,
`projects/`) que no es de este cambio. Cada Checkpoint nombra sus rutas y agrega
`blueprints/summum-improvement/tasks.json` (el estado de la tarea).

## Directory subtree

Only the parts this epic touches:

```
packages/db/
  src/schema.ts                                  # exists, you will edit it (E5-T1, E5-T2, E5-T3, E5-T6)
  migrations/                                    # organigrama_rls, uno_a_uno_rls, people_analyzer_rls, lealtad_rls
apps/improvement/
  server/people/seats.ts                         # NEW (E5-T1)
  server/people/checkins.ts                      # NEW (E5-T2)
  server/people/reviews.ts                       # NEW (E5-T3)
  server/people/culture.ts                       # NEW (E5-T5)
  server/direccion/scorecard/week.ts             # exists, read-only (weekStart, recentWeeks)
  server/crm/loyalty.ts, crm/wallet.ts           # NEW (E5-T6, E5-T7)
  server/kpis/sources.ts                         # exists, you will edit it (E5-T6)
  app/[org]/equipo/{organigrama,checkin,analizador}/page.tsx   # NEW (E5-T4)
  app/[org]/equipo/cultura/page.tsx              # NEW (E5-T5)
  app/[org]/clientes/lealtad/page.tsx            # NEW (E5-T7)
  app/w/[token]/page.tsx                         # NEW (E5-T7) — pública, sin sesión
  tests/organigrama, checkins, people-review, culture, lealtad, wallet (.test.ts)   # NEW
  tests/e2e/personas.spec.ts                     # NEW (E5-T4), grows in E5-T5
  tests/e2e/lealtad.spec.ts                      # NEW (E5-T7)
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `seat` | `org_id`, `area_id`, `parent_seat_id`, `title`, `roles` text[], `holder_profile_id`, `position` | RLS: dueño o `equipo` |
| `one_on_one` | `org_id`, `employee_id`, `held_by`, `held_on`, `shared_notes` | Empleado y dueño |
| `checkin` | `org_id`, `profile_id`, `week_start` (lunes), `mood` 1-5, `note`; unique por semana | Empleado y dueño |
| `people_review` | `org_id`, `employee_id`, `reviewer_id`, `period_start`, `ratings`, `gwc`, `note` | Empleado y dueño; sin ranking |
| `loyalty_program`, `loyalty_tier`, `experience_grant` | features jsonb; `min_purchases`; `value_cents` | RLS: dueño o `clientes: empresa` |
| `client` (existente) | + `wallet_token` text null unique | La llave del monedero |
| `org_kpi` (existente) | check `source` + `retorno_experiencias` | |

Columnas completas, checks e índices: en el **Do** de cada tarea de esquema y en el apéndice de abajo,
copiado literal de `blueprint.md` §4 (incluye el SQL de RLS que cada tarea pega en su archivo `--custom`).

### Apéndice de esquema (copia de blueprint.md §4)

#### §4 · Personas

**`seat`** — `id`, `org_id` (cascade, not null), `area_id` (FK area set null), `parent_seat_id` (FK
`seat.id` set null), `title` text not null, `roles` text[] not null default `'{}'`, `holder_profile_id`
(FK profile set null), `position` integer not null default 0, `created_at`, `updated_at`; índice (`org_id`,
`parent_seat_id`).

**`one_on_one`** — `id`, `org_id` (cascade, not null), `employee_id` (FK profile cascade, not null),
`held_by` (FK profile set null), `held_on` date not null, `shared_notes` text not null default `''`,
`created_at`, `updated_at`.

**`checkin`** — `id`, `org_id` (cascade, not null), `profile_id` (FK profile cascade, not null),
`week_start` date not null (check `extract(isodow from week_start) = 1`), `mood` integer not null check
1-5, `note` text null, `created_at`, `updated_at`; unique `uq_checkin_week` (`org_id`, `profile_id`,
`week_start`).

**`people_review`** — `id`, `org_id` (cascade, not null), `employee_id` (FK profile cascade, not null),
`reviewer_id` (FK profile set null), `period_start` date not null, `ratings` jsonb not null (`{ [valor
central]: "+"|"+/-"|"-" }`), `gwc` jsonb not null (`{ entiende, quiere, capacidad }`), `note` text null,
`created_at`, `updated_at`; unique (`org_id`, `employee_id`, `period_start`).

#### §4 · Lealtad

**`loyalty_program`** — `id`, `org_id` (cascade, not null, **unique**), `features` jsonb not null default
`'{}'` (`{ vip, referidos, cumpleanos, retos }` booleanos), `created_at`, `updated_at`.
**`loyalty_tier`** — `id`, `org_id` (cascade, not null), `name` text not null, `min_purchases` integer not
null default 0 check `>= 0`, `perks` text not null default `''`, `position` integer not null default 0,
`created_at`, `updated_at`. **`experience_grant`** — `id`, `org_id` (cascade, not null), `client_id` (FK
client cascade, not null), `title` text not null, `value_cents` bigint not null check `>= 0`, `granted_on`
date not null, `granted_by` (FK profile set null), `created_at`. **`client`** (existente) — +
`wallet_token` text null **unique**.

#### §4 · Migración `organigrama_rls`

```sql
alter table seat enable row level security;
create policy "members read seats their permission type allows"
  on seat for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = seat.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'equipo' in ('empresa', 'area'))
  ));
grant select on seat to authenticated;
```

#### §4 · Migración `uno_a_uno_rls`

```sql
-- Check-in (base NOM-035) y 1-a-1: la persona y el dueño del org. Nunca un compañero.
alter table checkin enable row level security;
create policy "people and their org owner read checkins"
  on checkin for select
  using (checkin.profile_id = auth.uid() or exists (
    select 1 from membership m where m.org_id = checkin.org_id and m.user_id = auth.uid() and m.role = 'owner'));

alter table one_on_one enable row level security;
create policy "the employee and the org owner read one-on-ones"
  on one_on_one for select
  using (one_on_one.employee_id = auth.uid() or exists (
    select 1 from membership m where m.org_id = one_on_one.org_id and m.user_id = auth.uid() and m.role = 'owner'));

grant select on checkin, one_on_one to authenticated;
```

#### §4 · Migración `people_analyzer_rls`

```sql
-- Mismo cuidado que responsibility_level (Non-negotiable #4): la persona evaluada y el dueño, nadie más.
alter table people_review enable row level security;
create policy "the employee and the org owner read people reviews"
  on people_review for select
  using (people_review.employee_id = auth.uid() or exists (
    select 1 from membership m where m.org_id = people_review.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on people_review to authenticated;
```

#### §4 · Migración `lealtad_rls`

```sql
-- Lealtad: mismo criterio que client (dueño o clientes = empresa). El monedero público no pasa por aquí:
-- lo sirve el servidor con columnas explícitas; PostgREST sin JWT con permiso no ve nada.
alter table loyalty_program enable row level security;
create policy "members read the loyalty program their permission type allows"
  on loyalty_program for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = loyalty_program.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')));

alter table loyalty_tier enable row level security;
create policy "members read loyalty tiers their permission type allows"
  on loyalty_tier for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = loyalty_tier.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')));

alter table experience_grant enable row level security;
create policy "members read experience grants their permission type allows"
  on experience_grant for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = experience_grant.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')));

grant select on loyalty_program, loyalty_tier, experience_grant to authenticated;
```

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/direccion/scorecard/week.ts` → `weekStart`, `recentWeeks` | La única semana |
| repo | `org_vision.core_values` | Valores del People Analyzer (solo lectura) |
| `01` | `server/crm/deals.ts` → `mxMonthStart`; tabla `deal` | Ventas ganadas para el KPI y los niveles |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `apps/improvement/server/crm/wallet.ts` → `issueWalletToken`, `loadWallet` | ver E5-T7 | — |
| `server/kpis/sources.ts` → fuente `retorno_experiencias` | config `{ periodo }` | requisitos `kpi` del Sello (dato) |

## Conventions that bite in this area

- **Dos puertas.** El cliente `db` conecta como dueño de las tablas: RLS **no** corre en el camino de la
  app. La única autorización ahí es el guard (`assertMembership`/`findOwnerMembership`/`resolveSection` en
  Improvement; `assertDockOwner`/`assertBarcoOwner`/`assertPactoAccess`/`assertNetworkMember` en Summum) +
  el filtro por org o por persona en cada consulta. La política RLS cierra la otra puerta (PostgREST).
- **Import relativo con `.ts` explícito** (`../auth/guard.ts`); `@/` solo en páginas; sin barrels.
- **Resultados tipados.** Improvement: `{ ok: true, data } | { ok: false, error: { code, message } }` con
  `Result<T>` local por archivo, como `server/needs/mutations.ts`. Summum: `Result<T>` de
  `server/result.ts` con los mensajes de `server/error-codes.ts`.
- **Las migraciones generadas no se editan.** Lo único escrito a mano en `packages/db/migrations/` es el
  archivo que crea `--custom --name=<nombre>_rls`, con el SQL que da este epic.
- **Motor genérico:** ningún uuid, slug ni nombre de cliente literal en `server/**` (lo comprueba un `grep`).
- **`git add` de rutas con corchetes** (`[org]`, `[muelleId]`) usa `":(literal)…"`, como en los Checkpoints.
- **Nunca un ranking ni un orden por puntaje** en Improvement: People Analyzer se ordena por nombre.
- **Insights agregados con mínimo de 3 respuestas**; nunca un valor por persona.
- **`/w/[token]` es pública**: columnas explícitas, `noindex`, `no-referrer`; nunca montos ni ids.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/summum-improvement.md`,
`.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`, `.claude/rules/ia-gateway.md`.
All sit in the project root.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick.

### `E5-T1` — Accountability Chart: asientos, roles y responsables

**Depends on:** `E4-T4` · **Priority:** p2 — metadata for scope cuts, not a running order

1. `packages/db/src/schema.ts`: tabla `seat` de §4 *Personas*.
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=organigrama_rls`
   con el SQL de §4 *Migración `organigrama_rls`*.
3. `server/people/seats.ts` (sección existente `equipo`): `listSeats(userId, orgId)` — alcance distinto de
   `ninguno` (si no, `[]`); árbol por `parent_seat_id` y `position`, con el nombre del responsable.
   `createSeat`, `updateSeat`, `removeSeat` — `findOwnerMembership` (si no: `FORBIDDEN`); `{ title (2-120),
   roles (1-5 textos de 1-120), areaId (del org | null), parentSeatId (del org | null), holderProfileId
   (miembro | null), position }`. Un `parentSeatId` que es el propio asiento o uno de sus descendientes →
   `VALIDATION_ERROR` "Ese asiento no puede colgar de sí mismo.". Ids de otro org → `NOT_FOUND`.
4. La pantalla del Accountability Chart llega en el paso 39, con su e2e.
5. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: tabla `seat`
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_organigrama_rls.sql`
- `apps/improvement/server/people/seats.ts` — new
- `apps/improvement/tests/organigrama.test.ts` — new: motor y RLS

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el dueño crea un asiento raíz y dos que cuelgan de él **THE SYSTEM SHALL** hacer que `listSeats` devuelva un árbol con la raíz y sus dos hijos en orden de `position`.
2. **WHEN** `updateSeat` intenta colgar un asiento de uno de sus descendientes **THE SYSTEM SHALL** devolver `code: "VALIDATION_ERROR"` sin escribir.
3. **WHEN** un empleado llama `createSeat` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`, y WHEN el dueño pone de responsable a un perfil que no es miembro THE SYSTEM SHALL devolver `code: "NOT_FOUND"`.
4. **WHEN** un empleado sin tipo de permiso consulta `seat` como rol `authenticated` **THE SYSTEM SHALL** devolver 0 filas, y WHEN consulta uno con grants `{"equipo":"area"}` THE SYSTEM SHALL ver los asientos de su org.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/organigrama.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/people || status=$?; test "$status" -eq 1
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/server/people/seats.ts apps/improvement/tests/organigrama.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E5-T1 (step 36): Accountability Chart con RLS"
git tag step-36-si-organigrama
git ls-files --error-unmatch apps/improvement/server/people/seats.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E5-T2` — 1-a-1 y check-in semanal privados

**Depends on:** `E5-T1` · **Priority:** p2 — metadata for scope cuts, not a running order

Base NOM-035: el check-in es un dato personal; lo ven la persona y el dueño, nadie más.

1. `packages/db/src/schema.ts`: `one_on_one` y `checkin` de §4 *Personas* (`checkin` con check de lunes
   como `measurable_value`, `mood` 1-5 y unique `org_id` + `profile_id` + `week_start`).
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=uno_a_uno_rls`
   con el SQL de §4 *Migración `uno_a_uno_rls`*.
3. `server/people/checkins.ts`: `submitCheckin(userId, orgId, input, now?)` — `assertMembership`;
   `{ mood (1-5), note (≤500 | null) }`; `week_start = weekStart(now)` de
   `server/direccion/scorecard/week.ts` (la única semana); upsert. `myCheckins(userId, orgId)`.
   `checkinsFor(userId, orgId, employeeId)` — solo el dueño (si no: `FORBIDDEN`). `recordOneOnOne(userId,
   orgId, input)` — dueño; `{ employeeId (miembro), heldOn, sharedNotes (≤4000) }`. `myOneOnOnes(userId,
   orgId)` — los suyos como empleado; el dueño ve los de cada empleado con `oneOnOnesFor`.
4. La pantalla del check-in llega en el paso 39, con su e2e.
5. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: tablas `one_on_one` y `checkin`
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_uno_a_uno_rls.sql`
- `apps/improvement/server/people/checkins.ts` — new
- `apps/improvement/tests/checkins.test.ts` — new: motor y RLS

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** un empleado manda dos check-ins en la misma semana **THE SYSTEM SHALL** dejar una sola fila con el `mood` del segundo y `week_start` igual a `weekStart(now)`.
2. **WHEN** un empleado llama `checkinsFor` sobre un compañero **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`, y WHEN manda `mood` 6 THE SYSTEM SHALL devolver `code: "VALIDATION_ERROR"` sin escribir.
3. **WHEN** un empleado consulta `checkin` y `one_on_one` como rol `authenticated` **THE SYSTEM SHALL** ver solo los suyos y 0 filas de un compañero, y WHEN consulta el dueño del org THE SYSTEM SHALL ver los de todo su equipo.
4. **WHEN** el dueño registra un 1-a-1 con un empleado **THE SYSTEM SHALL** hacer que `myOneOnOnes` de ese empleado lo devuelva y que el de otro empleado no.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/checkins.test.ts tests/direccion-week.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/people || status=$?; test "$status" -eq 1
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/server/people/checkins.ts apps/improvement/tests/checkins.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E5-T2 (step 37): 1-a-1 y check-in semanal con RLS por persona"
git tag step-37-si-checkin
git ls-files --error-unmatch apps/improvement/server/people/checkins.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E5-T3` — People Analyzer privado y sin ranking

**Depends on:** `E5-T2` · **Priority:** p2 — metadata for scope cuts, not a running order

Mismo cuidado que `responsibility_level` (Non-negotiable #4): un empleado nunca lee la evaluación de otro, y
el producto nunca ordena a las personas por puntaje.

1. `packages/db/src/schema.ts`: `PEOPLE_RATINGS = ["+", "+/-", "-"] as const` y la tabla `people_review`
   de §4 *Personas* (unique `org_id` + `employee_id` + `period_start`).
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=people_analyzer_rls`
   con el SQL de §4 *Migración `people_analyzer_rls`*.
3. `server/people/reviews.ts`: los valores salen de `org_vision.core_values` (Dirección, solo lectura); sin
   valores → `VALIDATION_ERROR` "Primero escribe los valores en la Visión.". `saveReview(userId, orgId,
   employeeId, input)` — dueño; `{ periodStart (primer día de un trimestre, YYYY-MM-DD), ratings (una llave
   por valor central, en `PEOPLE_RATINGS`), gwc: { entiende, quiere, capacidad } (booleanos), note (≤2000 |
   null) }`; una llave que no es valor central → `VALIDATION_ERROR`. `reviewsForOwner(userId, orgId,
   periodStart)` — dueño; ordenadas **por nombre**, sin ningún total ni puntaje calculado. `myReviews(userId,
   orgId)` — las propias.
4. La pantalla del People Analyzer llega en el paso 39, con su e2e.
5. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: tabla `people_review`
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_people_analyzer_rls.sql`
- `apps/improvement/server/people/reviews.ts` — new
- `apps/improvement/tests/people-review.test.ts` — new: motor y RLS

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el dueño guarda la evaluación de un empleado con una calificación por cada valor central **THE SYSTEM SHALL** hacer que `myReviews` de ese empleado la devuelva.
2. **WHEN** un empleado consulta `people_review` como rol `authenticated` **THE SYSTEM SHALL** ver solo la suya y 0 filas de un compañero, y WHEN un empleado llama `reviewsForOwner` THE SYSTEM SHALL devolver `code: "FORBIDDEN"`.
3. **WHEN** `reviewsForOwner` corre con dos empleados `Beto` y `Ana` donde Beto tiene mejores calificaciones **THE SYSTEM SHALL** devolver `Ana` primero y ninguna fila SHALL tener una llave `score` ni `total`.
4. **WHEN** `saveReview` recibe una calificación para un valor que no está en `core_values`, o el org no tiene visión **THE SYSTEM SHALL** devolver `code: "VALIDATION_ERROR"` sin escribir.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/people-review.test.ts tests/responsibility.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/people || status=$?; test "$status" -eq 1
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/server/people/reviews.ts apps/improvement/tests/people-review.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E5-T3 (step 38): People Analyzer con RLS por persona"
git tag step-38-si-people-analyzer
git ls-files --error-unmatch apps/improvement/server/people/reviews.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E5-T4` — Pantallas de organigrama, check-in y People Analyzer

**Depends on:** `E5-T3` · **Priority:** p2 — metadata for scope cuts, not a running order

Las tres pantallas sobre los motores de los pasos 36, 37 y 38, abiertas en el e2e en el mismo paso.

- `app/[org]/equipo/organigrama/page.tsx`: `requireSection(orgId, "equipo")`; `h1` "Accountability Chart";
  el árbol como listas anidadas (`ul`/`li`) con título, roles y responsable; formularios del dueño.
- `app/[org]/equipo/checkin/page.tsx`: `requireOrgMembership` (todo miembro puede hacer su check-in);
  `h1` "Check-in semanal"; cinco radios de ánimo con `label` en texto (`Muy mal` … `Muy bien`), nota
  opcional; tus últimos check-ins y tus 1-a-1. El dueño además ve, por empleado, sus check-ins y el
  formulario de 1-a-1.
- `app/[org]/equipo/analizador/page.tsx`: `requireOrgMembership`; `h1` "People Analyzer"; dueño: tabla persona × valor con
  `+`/`+/-`/`-` en texto y las tres casillas GWC; empleado: solo su propia evaluación; nadie más ve nada.
  Nada se ordena ni se colorea por puntaje.
- `tests/e2e/personas.spec.ts` — spec nuevo, serial, sesión como en `tests/e2e/direccion.spec.ts`; dueño y
  empleado sin tipo de permiso; siembra un asiento raíz "Dirección general", un check-in del empleado y la
  visión con dos valores. `afterAll` borra el org (cascade), luego los profiles y los usuarios de Auth.

**Files**
- `apps/improvement/app/[org]/equipo/organigrama/page.tsx` — new
- `apps/improvement/app/[org]/equipo/checkin/page.tsx` — new
- `apps/improvement/app/[org]/equipo/analizador/page.tsx` — new
- `apps/improvement/tests/e2e/personas.spec.ts` — new: las pantallas de Personas, abiertas en el paso que las crea

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el dueño abre `/[org]/equipo/organigrama` **THE SYSTEM SHALL** responder 200 con un `h1` `Accountability Chart` y el asiento `Dirección general`, y axe-core SHALL reportar 0 violaciones serious o critical.
2. **WHEN** el dueño abre `/[org]/equipo/checkin` y `/[org]/equipo/analizador` **THE SYSTEM SHALL** responder 200 con los `h1` `Check-in semanal` y `People Analyzer` respectivamente, y axe-core SHALL reportar 0 violaciones serious o critical en cada una.
3. **WHEN** el empleado sin tipo de permiso abre `/[org]/equipo/checkin` **THE SYSTEM SHALL** responder 200 con la opción `Muy bien`, y WHEN abre `/[org]/equipo/organigrama` THE SYSTEM SHALL responder 404.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test:e2e personas.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/equipo/organigrama/page.tsx" ":(literal)apps/improvement/app/[org]/equipo/checkin/page.tsx" ":(literal)apps/improvement/app/[org]/equipo/analizador/page.tsx" apps/improvement/tests/e2e/personas.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E5-T4 (step 39): pantallas de organigrama, check-in y People Analyzer"
git tag step-39-si-personas-pantallas
git ls-files --error-unmatch apps/improvement/tests/e2e/personas.spec.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E5-T5` — Celebraciones automáticas e insights de cultura agregados

**Depends on:** `E5-T4` · **Priority:** p2 — metadata for scope cuts, not a running order

- `server/people/culture.ts`:
  - `celebrations(userId, orgId, now?)` — alcance `equipo` distinto de `ninguno` (si no, `[]`): objetivos
    completados en los últimos 7 días (título y nombre de quien lo cerró) y aniversarios de membresía cuyo
    día-mes de `accepted_at` cae en los próximos 7 días con al menos 1 año cumplido. Sin puntos, sin orden
    por desempeño.
  - `cultureInsights(userId, orgId, now?)` — dueño o `equipo: empresa`; las últimas 4 semanas (de
    `recentWeeks(weekStart(now), 4)`), cada una con `responses` y `averageMood` = `Math.round(promedio)` **solo
    si `responses >= 3`**; si no, `averageMood: null`. Nunca un id, un nombre ni un valor por persona.
- `app/[org]/equipo/cultura/page.tsx`: `requireSection(orgId, "equipo")`; `h1` "Cultura"; celebraciones y,
  si puede verlos, la tabla de insights con "Muy pocas respuestas para mostrar" cuando es null.
- `tests/e2e/personas.spec.ts` (lo creó el paso 39): el dueño abre `/[org]/equipo/cultura`; el empleado sin
  tipo de permiso recibe 404.

**Files**
- `apps/improvement/server/people/culture.ts` — new: `celebrations`, `cultureInsights`
- `apps/improvement/app/[org]/equipo/cultura/page.tsx` — new
- `apps/improvement/tests/culture.test.ts` — new
- `apps/improvement/tests/e2e/personas.spec.ts` — edit: la pantalla de Cultura

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `cultureInsights` corre sobre una semana con 2 check-ins **THE SYSTEM SHALL** devolver `averageMood` null para esa semana, y WHEN la semana tiene check-ins de 3, 4 y 5 THE SYSTEM SHALL devolver `averageMood` 4 y `responses` 3.
2. **WHEN** se recorre el resultado de `cultureInsights` **THE SYSTEM SHALL** no contener ningún `profile_id` ni nombre de persona.
3. **WHEN** un miembro aceptó hace 2 años y su aniversario cae en 3 días **THE SYSTEM SHALL** incluirlo en `celebrations`, y WHEN un empleado sin la sección `equipo` llama `celebrations` THE SYSTEM SHALL devolver `[]`.
4. **WHEN** el dueño abre `/[org]/equipo/cultura` **THE SYSTEM SHALL** responder 200 con un `h1` `Cultura` y axe-core SHALL reportar 0 violaciones serious o critical.
5. **WHEN** el empleado sin tipo de permiso abre `/[org]/equipo/cultura` **THE SYSTEM SHALL** responder 404.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/culture.test.ts
pnpm --filter improvement test:e2e personas.spec.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/people || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/people/culture.ts ":(literal)apps/improvement/app/[org]/equipo/cultura/page.tsx" apps/improvement/tests/culture.test.ts apps/improvement/tests/e2e/personas.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E5-T5 (step 40): celebraciones e insights de cultura"
git tag step-40-si-cultura
git ls-files --error-unmatch apps/improvement/server/people/culture.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E5-T6` — Lealtad: niveles VIP, experiencias y KPI de retorno

**Depends on:** `E5-T3`, `E1-T10` · **Priority:** p2 — metadata for scope cuts, not a running order

"10 % de retorno a los clientes" = 10 % en **experiencias**, no descuentos: se mide como valor de
experiencias entregadas ÷ ventas ganadas. El 10 % no está en código: es el `threshold` de un requisito
`kpi` del Sello (dato).

1. `packages/db/src/schema.ts`: `LOYALTY_FEATURES = ["vip", "referidos", "cumpleanos", "retos"] as const`; las
   tres tablas de §4 *Lealtad*; `client` + `wallet_token` text null **unique**; `org_kpi_source_check` +=
   `'retorno_experiencias'`.
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=lealtad_rls`
   con el SQL de §4 *Migración `lealtad_rls`*.
3. `server/crm/loyalty.ts` (sección `clientes`; escrituras con alcance `empresa`): `getProgram`,
   `setFeatures(userId, orgId, features)` — objeto con solo llaves de `LOYALTY_FEATURES` y valores booleanos
   (si no: `VALIDATION_ERROR`); `upsertTier(userId, orgId, input)` — `{ name (2-60), minPurchases (entero
   ≥ 0), perks (≤500), position }`; `grantExperience(userId, orgId, input)` — `{ clientId, title (3-160),
   valueCents (entero ≥ 0), grantedOn }`; `tierForClient(orgId, clientId)` — el nivel con el mayor
   `min_purchases` ≤ tratos `ganado` del cliente, o null.
4. `server/kpis/sources.ts`: fuente `retorno_experiencias` antes de `manual`.
   Config `z.object({ periodo: z.enum(["mes", "anio"]).default("mes") })`; inicio del periodo con
   `mxMonthStart` (y `YYYY-01-01` para `anio`); valor = `Math.round(Σ value_cents de experience_grant con
   granted_on ≥ inicio × 100 / Σ amount_cents de deal ganado con closed_at ≥ inicio)`; sin ventas → 0.
5. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: `loyalty_program`, `loyalty_tier`, `experience_grant`, `client.wallet_token`, check de `org_kpi`
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_lealtad_rls.sql`
- `apps/improvement/server/crm/loyalty.ts` — new
- `apps/improvement/server/kpis/sources.ts` — edit: fuente `retorno_experiencias`
- `apps/improvement/tests/lealtad.test.ts` — new: motor, KPI y RLS

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** un org tiene este mes experiencias por 10000 centavos y tratos ganados por 100000 centavos **THE SYSTEM SHALL** devolver `10` para `retorno_experiencias` con `{}`, y WHEN no tiene tratos ganados THE SYSTEM SHALL devolver `0`.
2. **WHEN** un cliente tiene 3 tratos ganados y el org tiene niveles con `min_purchases` 0, 2 y 5 **THE SYSTEM SHALL** hacer que `tierForClient` devuelva el de 2.
3. **WHEN** `setFeatures` recibe la llave `cashback` **THE SYSTEM SHALL** devolver `code: "VALIDATION_ERROR"` sin escribir.
4. **WHEN** un empleado sin `{"clientes":"empresa"}` llama `grantExperience` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`, y WHEN consulta `experience_grant` como rol `authenticated` sin tipo de permiso THE SYSTEM SHALL devolver 0 filas.
5. **WHEN** se inserta un `client` con un `wallet_token` repetido **THE SYSTEM SHALL** rechazar el insert en la base.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/lealtad.test.ts tests/crm.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/crm || status=$?; test "$status" -eq 1
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/server/crm/loyalty.ts apps/improvement/server/kpis/sources.ts apps/improvement/tests/lealtad.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E5-T6 (step 41): lealtad y KPI retorno_experiencias con RLS"
git tag step-41-si-lealtad-motor
git ls-files --error-unmatch apps/improvement/server/crm/loyalty.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E5-T7` — Monedero web del cliente final y gate completo

**Depends on:** `E5-T6`, `E5-T5`, `E4-T6`, `E3-T5`, `E2-T2`, `E1-T10` · **Priority:** p2 — metadata for scope cuts, not a running order

La única ruta de `apps/improvement` sin sesión. Análisis de puertas en §8: el token es la única llave, la
página lee con `db` columnas explícitas, y PostgREST no ve nada de lealtad sin un JWT con permiso.

- `server/crm/wallet.ts`: `issueWalletToken(userId, orgId, clientId)` — alcance `empresa` en `clientes`;
  `crypto.randomBytes(24).toString("base64url")` (32 caracteres) en `client.wallet_token`; reemitir lo
  reemplaza (el anterior deja de abrir). `loadWallet(token)` — sin sesión; si el token no cumple
  `/^[A-Za-z0-9_-]{32}$/` devuelve `null` sin consultar; si no existe o el programa del org no tiene ninguna
  feature encendida, `null`; si existe, **exactamente** `{ orgName, clientName, tierName, perks, experiences:
  { title, grantedOn }[] }` — nunca `value_cents`, ids, notas ni la salud del cliente.
- `app/w/[token]/page.tsx`: `loadWallet` (null → `notFound()`); `export const metadata = { robots: { index:
  false, follow: false }, referrer: "no-referrer" }`; `h1` "Tu monedero en <org>"; nivel, beneficios y
  experiencias recibidas con fecha es-MX. Mismos tokens de `globals.css`; sin "use client".
- `app/[org]/clientes/lealtad/page.tsx`: `requireSection(orgId, "clientes")`; `h1` "Lealtad"; features
  (casillas), niveles VIP, "Dar una experiencia" (cliente, título, valor en MXN → centavos, fecha) y por
  cliente `Generar enlace del monedero` que muestra `NEXT_PUBLIC_APP_URL` + `/w/` + token. El QR queda
  fuera (§1 Non-Goals).
- `tests/e2e/lealtad.spec.ts`: siembra programa con `vip`, un nivel, un cliente con token y una experiencia
  "Cena de aniversario" de 50000 centavos; dueño y empleado sin tipo.

**Files**
- `apps/improvement/server/crm/wallet.ts` — new: `issueWalletToken`, `loadWallet`
- `apps/improvement/app/w/[token]/page.tsx` — new: monedero público, sin sesión
- `apps/improvement/app/[org]/clientes/lealtad/page.tsx` — new: configuración de lealtad y enlaces de monedero
- `apps/improvement/tests/wallet.test.ts` — new
- `apps/improvement/tests/e2e/lealtad.spec.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `issueWalletToken` corre **THE SYSTEM SHALL** guardar un token de 32 caracteres `[A-Za-z0-9_-]`, y WHEN corre otra vez para el mismo cliente THE SYSTEM SHALL reemplazarlo y `loadWallet` con el token anterior SHALL devolver `null`.
2. **WHEN** `loadWallet` recibe un token válido **THE SYSTEM SHALL** devolver un objeto cuyas llaves son exactamente `orgName`, `clientName`, `tierName`, `perks` y `experiences`, y cada experiencia SHALL tener solo `title` y `grantedOn`.
3. **WHEN** un visitante sin sesión abre `/w/<token>` **THE SYSTEM SHALL** responder 200 con `Cena de aniversario` y un HTML que no contiene el id del cliente ni el texto `50000`, y WHEN abre `/w/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` THE SYSTEM SHALL responder 404.
4. **WHEN** el dueño abre `/[org]/clientes/lealtad` **THE SYSTEM SHALL** responder 200 con un `h1` `Lealtad` y 0 violaciones serious o critical, y WHEN la abre el empleado sin la sección `clientes` THE SYSTEM SHALL responder 404.
5. **WHEN** `pnpm --filter improvement test:e2e` y `pnpm --filter @jotapuntoce/summum test:e2e` corren completos **THE SYSTEM SHALL** salir con código 0 en ambos.
6. **WHEN** `pnpm build` corre **THE SYSTEM SHALL** salir con código 0 para todas las apps del monorepo.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/wallet.test.ts tests/lealtad.test.ts
pnpm --filter improvement test:e2e
pnpm --filter @jotapuntoce/summum test:e2e
pnpm build
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/crm || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/crm/wallet.ts ":(literal)apps/improvement/app/w/[token]/page.tsx" ":(literal)apps/improvement/app/[org]/clientes/lealtad/page.tsx" apps/improvement/tests/wallet.test.ts apps/improvement/tests/e2e/lealtad.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E5-T7 (step 42): monedero web del cliente y gate completo"
git tag step-42-si-monedero
git ls-files --error-unmatch apps/improvement/server/crm/wallet.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e` corre completo **THE SYSTEM SHALL** salir con código 0 con `personas.spec.ts` y `lealtad.spec.ts`.
2. **WHEN** un empleado consulta `checkin` o `people_review` de un compañero como rol `authenticated` **THE SYSTEM SHALL** devolver 0 filas.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e
```

## Pitfalls

- **Calcular la semana a mano** — `weekStart` de `week.ts`, siempre.
- **Mostrar `value_cents` en el monedero** — el 10 % es una métrica del negocio, no algo que ve el cliente final.
- **Ordenar People Analyzer por calificación** — es un Non-Goal y un riesgo de vigilancia laboral.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-si-*'` los lista (7 de este epic; 42 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` sin cambios — este cambio no agrega variables.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Cada migración de este epic se aplicó solo después de un "sí" explícito de Jose Carlos.
