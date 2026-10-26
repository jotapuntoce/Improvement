# Epic 03: Sinapsis, red de premios y el Pacto

> Al terminar, una necesidad severa propone a la mejor especialista y entra solo con dos firmas de socios y la del dueño; los PowerUps salen de la red Summum con interruptor de corte; y cada persona lleva su Pacto con consentimiento, racha, escuadras y retos.

| | |
|---|---|
| **Epic id** | `03-sinapsis-premios-pacto` |
| **Tasks** | `E3-T1` … `E3-T9` |
| **Depends on** | `02-movimiento-afiliadas-sello` |
| **Unlocks** | `04-comunidad` |
| **Parallel with** | nada: comparte `packages/db/src/schema.ts` y `apps/summum/server/auth/guard.ts` |

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
  src/schema.ts                                  # exists, you will edit it (E3-T3, E3-T6, E3-T8)
  migrations/                                    # catálogo (sin --custom), pacto_rls, escuadras_rls
apps/improvement/
  server/owner/personality.ts                    # NEW (E3-T1)
  server/sinapsis/proposals.ts                   # NEW (E3-T1)
  server/needs/mutations.ts                      # exists, read-only (referNeedToSummum)
  server/powerups/catalog.ts                     # NEW (E3-T3)
  server/powerups/mutations.ts                   # exists, you will edit it (E3-T3: redeemPowerup)
  server/lobby/loadLobby.ts                      # exists, you will edit it (E3-T5)
  app/api/cron/sello/route.ts                    # exists, you will edit it (E3-T1)
  app/[org]/improvement/perfil/page.tsx          # NEW (E3-T5)
  app/[org]/necesidades/page.tsx                 # exists, you will edit it (E3-T5)
  app/[org]/powerups/page.tsx                    # exists, you will edit it (E3-T5)
  tests/sinapsis, powerups-red, pacto-schema (.test.ts)   # NEW
  tests/e2e/sinapsis.spec.ts                     # NEW (E3-T5)
apps/summum/
  server/auth/guard.ts                           # exists, you will edit it (E3-T7: assertPactoAccess)
  server/sinapsis/approvals.ts                   # NEW (E3-T2)
  server/benefits/benefits.ts                    # NEW (E3-T4)
  server/pacto/streak.ts, pacto/pacto.ts         # NEW (E3-T7)
  server/pacto/squads.ts                         # NEW (E3-T8)
  app/muelle/[muelleId]/layout.tsx               # exists, you will edit it (E3-T2, E3-T9)
  app/muelle/[muelleId]/sinapsis/page.tsx, pacto/page.tsx   # NEW
  app/red/page.tsx, red/[muelleId]/beneficios/page.tsx, red/[muelleId]/mi-transformacion/page.tsx   # NEW
  tests/sinapsis-approvals, benefits, pacto-streak, pacto, squads (.test.ts)   # NEW
  tests/e2e/red.spec.ts                          # exists from E2-T8, you will extend it (E3-T2, E3-T4, E3-T9)
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `specialist_proposal` | `muelle_org_id`, `org_id`, `org_need_id`, `affiliate_id`, `seal_score`, `match_score`, `status` (`propuesta`\|`aprobada_socios`\|`activa`\|`rechazada`), `first_partner_id` ≠ `second_partner_id`, `owner_decided_by` | Una abierta por necesidad |
| `powerup_partner` (existente) | + `network_org_id`, `affiliate_id`, `barco_org_id`, `published_by` | Las filas globales no cambian |
| `muelle_settings` | + `catalog_mode` (`global`\|`red`, default `global`) | Corte y reversa |
| `pacto_consent` | `profile_id` unique, `consent_text_version`, `accepted_at`, `revoked_at` | Antes del primer registro |
| `pacto_pillar` | `muelle_org_id`, `name`, `position`, `active` | Dato del muelle |
| `pacto_entry` | `profile_id`, `pillar_id`, `entry_date`, `note`; unique (perfil, pilar, fecha) | RLS: solo su dueño |
| `pacto_pause` | `profile_id`, `starts_on`, `ends_on`, `reason` | La posada |
| `squad`, `squad_member`, `challenge`, `challenge_participant` | ver §4 del blueprint, repetidos en E3-T8 | La escuadra ve solo un estado de apoyo |

Columnas completas, checks e índices: en el **Do** de cada tarea de esquema y en el apéndice de abajo,
copiado literal de `blueprint.md` §4 (incluye el SQL de RLS que cada tarea pega en su archivo `--custom`).

### Apéndice de esquema (copia de blueprint.md §4)

#### §4 · Pacto

**`pacto_consent`** — `id`, `profile_id` (FK profile cascade, not null, **unique**), `consent_text_version`
integer not null, `accepted_at` timestamptz not null, `revoked_at` timestamptz null, `created_at`,
`updated_at`.

**`pacto_pillar`** — `id`, `muelle_org_id` (cascade, not null), `name` text not null, `position` integer
not null default 0, `active` boolean not null default true, `created_at`, `updated_at`.

**`pacto_entry`** — `id`, `profile_id` (FK profile cascade, not null), `pillar_id` (FK `pacto_pillar.id`
cascade, not null), `entry_date` date not null, `note` text null, `created_at`; unique
`uq_pacto_entry_day` (`profile_id`, `pillar_id`, `entry_date`). Append + upsert de la nota del día; nunca
la lee nadie más.

**`pacto_pause`** (la posada) — `id`, `profile_id` (cascade, not null), `starts_on` date not null,
`ends_on` date not null, `reason` text null, `created_at`; check `pacto_pause_range` (`ends_on >= starts_on`).

#### §4 · Escuadras y retos

**`squad`** — `id`, `muelle_org_id` (cascade, not null), `name` text not null, `created_by` (FK profile
set null), `created_at`. **`squad_member`** — `id`, `squad_id` (FK squad cascade, not null), `profile_id`
(FK profile cascade, not null), `created_at`; unique (`squad_id`, `profile_id`). **`challenge`** — `id`,
`muelle_org_id` (cascade, not null), `squad_id` (FK squad cascade, null), `pillar_id` (FK pacto_pillar
set null), `title` text not null, `starts_on` date not null, `ends_on` date not null, `created_by` (FK
profile set null), `created_at`; check `challenge_range` (`ends_on >= starts_on`).
**`challenge_participant`** — `id`, `challenge_id` (cascade, not null), `profile_id` (cascade, not null),
`joined_at` timestamptz not null default `now()`; unique (`challenge_id`, `profile_id`).

#### §4 · Migración `pacto_rls`

```sql
-- El Pacto guarda hábitos de salud (LFPDPPP, datos sensibles): cada fila la lee SOLO su dueño. Ni los
-- socios del muelle, ni la escuadra, ni el dueño de su empresa.
alter table pacto_consent enable row level security;
create policy "people read only their own pacto consent"
  on pacto_consent for select using (pacto_consent.profile_id = auth.uid());

alter table pacto_entry enable row level security;
create policy "people read only their own pacto entries"
  on pacto_entry for select using (pacto_entry.profile_id = auth.uid());

alter table pacto_pause enable row level security;
create policy "people read only their own pacto pauses"
  on pacto_pause for select using (pacto_pause.profile_id = auth.uid());

-- Los nombres de los pilares no son datos de nadie: los ve la red del muelle.
alter table pacto_pillar enable row level security;
create policy "network reads its pacto pillars"
  on pacto_pillar for select using (public.in_muelle_network(pacto_pillar.muelle_org_id));

grant select on pacto_consent, pacto_entry, pacto_pause, pacto_pillar to authenticated;
```

#### §4 · Migración `escuadras_rls`

```sql
-- squad_member no puede consultarse a sí mismo en su política (recursión): se usan funciones security
-- definer. La escuadra ve a sus miembros; nunca ve pacto_entry (esa política no cambia).
create or replace function public.is_squad_member(sq uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from squad_member s where s.squad_id = sq and s.profile_id = auth.uid()) $$;
create or replace function public.squad_muelle(sq uuid) returns uuid
  language sql stable security definer set search_path = public
  as $$ select muelle_org_id from squad where id = sq $$;
create or replace function public.challenge_muelle(ch uuid) returns uuid
  language sql stable security definer set search_path = public
  as $$ select muelle_org_id from challenge where id = ch $$;
revoke all on function public.is_squad_member(uuid), public.squad_muelle(uuid), public.challenge_muelle(uuid) from public;
grant execute on function public.is_squad_member(uuid), public.squad_muelle(uuid), public.challenge_muelle(uuid) to authenticated;

alter table squad enable row level security;
create policy "squad members and dock owners read squads"
  on squad for select using (public.is_squad_member(squad.id) or public.is_dock_owner(squad.muelle_org_id));

alter table squad_member enable row level security;
create policy "squad members and dock owners read squad members"
  on squad_member for select
  using (public.is_squad_member(squad_member.squad_id) or public.is_dock_owner(public.squad_muelle(squad_member.squad_id)));

alter table challenge enable row level security;
create policy "network reads challenges"
  on challenge for select using (public.in_muelle_network(challenge.muelle_org_id));

alter table challenge_participant enable row level security;
create policy "participants and dock owners read participation"
  on challenge_participant for select
  using (challenge_participant.profile_id = auth.uid()
    or public.is_dock_owner(public.challenge_muelle(challenge_participant.challenge_id)));

grant select on squad, squad_member, challenge, challenge_participant to authenticated;
```

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| `02` | `computeSealScore`, `runSealCycle`, `PERSONALITY_QUESTIONS`, `personalityMatch`, `personalityAnswersValid` | ver epic 02 |
| repo | `server/needs/mutations.ts` → `referNeedToSummum(userId, orgId, needId, note)` | Fija `derivada` y `referred_at`; solo dueño |
| repo | `server/powerups/mutations.ts` → `pointsBalance`, `redeemPowerup` | El balance sale solo de objetivos |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `apps/improvement/server/powerups/catalog.ts` → `listCatalogForOrg`, `isInCatalog`, `catalogModeFor` | ver E3-T3 | E3-T5 |
| `apps/summum/server/auth/guard.ts` → `assertPactoAccess` | `(userId, muelleId) => Promise<void>` | E3-T7, `04` |
| `apps/summum/server/pacto/streak.ts` → `mxDate`, `pillarStatus`, `supportStatus` | puros | E3-T8, E3-T9 |

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
- **La flecha va de Improvement a Summum.** Summum lee `org_need` para mostrar la propuesta y nunca le escribe; la
  derivación la hace `referNeedToSummum()` cuando aprueba el dueño.
- **Pacto = datos de salud.** Sin `pacto_consent` vigente no se escribe nada; la escuadra recibe `{ name, supportStatus }` y nada más.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/summum-improvement.md`,
`.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`, `.claude/rules/ia-gateway.md`.
All sit in the project root.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick.

### `E3-T1` — Cuestionario del dueño y propuestas de especialista

**Depends on:** `E2-T9`, `E2-T4` · **Priority:** p1 — metadata for scope cuts, not a running order

- `server/owner/personality.ts`: `getOwnerPersonality(userId)` y `saveOwnerPersonality(userId, orgId,
  answers: unknown)` — `findOwnerMembership` (si no: `FORBIDDEN`); `personalityAnswersValid` (si no:
  `VALIDATION_ERROR`); upsert de `personality_profile` (`profile_id = userId`, `subject_kind = "dueno"`,
  `org_id = orgId`, `questionnaire_version = PERSONALITY_VERSION`).
- `server/sinapsis/proposals.ts`:
  - `listNetworkSpecialties(userId, orgId)` — dueño; las `specialty` del muelle padre del org (sin muelle →
    `[]`). `setAreaSpecialty(userId, orgId, areaId, key: string | null)` — dueño; el área es del org y la
    llave existe en el muelle padre (si no: `NOT_FOUND`).
  - `generateProposals({ now = new Date(), muelleId }: { now?: Date; muelleId?: string } = {})` — de cron, sin
    sesión. Por cada `muelle_settings` (o solo la de `muelleId` cuando viene: las pruebas siempre pasan el
    muelle de su fixture, porque el Supabase es el compartido con producción): las `org_need`
    de barcos del muelle con `status` `abierta`/`en_progreso`, `severity >= proposal_min_severity`, área con
    `specialty_key` y sin una propuesta `propuesta`/`aprobada_socios`/`activa`. Candidatas: afiliadas
    `activa` del muelle cuyo `specialty_keys` contiene la llave, sin propuesta `rechazada` para esa
    necesidad y cuyo `barco_org_id` no es el org de la necesidad. Orden: puntaje de su última evaluación
    `aprobada` con vigencia `vigente`/`en_riesgo` (sin Sello al final), luego `personalityMatch` contra el
    `personality_profile` `dueno` del dueño del org (el primer dueño por `accepted_at`; sin cuestionario → 0),
    luego `created_at`. Inserta solo la primera, con `seal_score` y `match_score`. Idempotente. Devuelve el
    número creado.
  - `listOwnerProposals(userId, orgId)` — dueño; las `aprobada_socios` y `activa` del org con el título de
    la necesidad y el `display_name` de la afiliada.
  - `decideProposalAsOwner(userId, orgId, proposalId, decision: unknown)` — dueño (si no: `FORBIDDEN`);
    solo sobre `aprobada_socios` (si no: `INVALID_TRANSITION`); `rechazada` → la marca; `aprobada` → update
    condicionado a `aprobada_socios` que la deja `activa` con `owner_decided_by`/`owner_decided_at`, y
    después `referNeedToSummum(userId, orgId, needId, "Especialista Summum: <display_name>")` — el puerto
    existente fija `status = 'derivada'` y `referred_at`. `referNeedToSummum` no se edita.
- La pantalla "Tu perfil y tu red" llega en el paso 25, con su e2e.
- `app/api/cron/sello/route.ts`: después de `runSealCycle()`, `generateProposals({ now })` sin alcance (todos
  los muelles); la respuesta agrega `proposals`. El guard del bearer no cambia.
- `tests/sinapsis.test.ts`: cada llamada a `generateProposals` pasa `{ muelleId }` del muelle que crea la prueba.

**Files**
- `apps/improvement/server/owner/personality.ts` — new: cuestionario del dueño
- `apps/improvement/server/sinapsis/proposals.ts` — new: especialidad por área, regla, ranking y aprobación del dueño
- `apps/improvement/app/api/cron/sello/route.ts` — edit: llama `generateProposals` después de `runSealCycle`
- `apps/improvement/tests/sinapsis.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `generateProposals` corre con una necesidad `abierta` de severidad 3 en un área con llave `comercial` y dos afiliadas `comercial` con Sello aprobado de 50 y 80 puntos **THE SYSTEM SHALL** crear un solo `specialist_proposal` `propuesta` para la afiliada de 80 con `seal_score` 80, y WHEN corre otra vez THE SYSTEM SHALL seguir con exactamente uno.
2. **WHEN** las dos afiliadas tienen el mismo puntaje y las respuestas del dueño coinciden 9 de 9 con una y 3 de 9 con la otra **THE SYSTEM SHALL** proponer a la primera con `match_score` 100.
3. **WHEN** la necesidad tiene severidad 2 con `proposal_min_severity` 3, o su área no tiene `specialty_key` **THE SYSTEM SHALL** no crear ninguna propuesta.
4. **WHEN** el dueño aprueba una propuesta `aprobada_socios` **THE SYSTEM SHALL** dejarla `activa` y la `org_need` con `status` `derivada` y `referred_at` no nulo, y WHEN la propuesta está en `propuesta` THE SYSTEM SHALL devolver `code: "INVALID_TRANSITION"`.
5. **WHEN** un empleado llama `decideProposalAsOwner` o `saveOwnerPersonality` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`, y WHEN el dueño manda respuestas inválidas THE SYSTEM SHALL devolver `code: "VALIDATION_ERROR"`.
6. **WHEN** `setAreaSpecialty` recibe una llave que no existe en el muelle del org **THE SYSTEM SHALL** devolver `code: "NOT_FOUND"` sin escribir.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/sinapsis.test.ts tests/seal-vigencia.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/sinapsis apps/improvement/server/owner || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/owner/personality.ts apps/improvement/server/sinapsis/proposals.ts apps/improvement/app/api/cron/sello/route.ts apps/improvement/tests/sinapsis.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T1 (step 21): cuestionario del dueño y propuestas de especialista"
git tag step-21-si-sinapsis-motor
git ls-files --error-unmatch apps/improvement/server/sinapsis/proposals.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E3-T2` — Aprobación de especialistas por los socios en Summum

**Depends on:** `E3-T1`, `E2-T8` · **Priority:** p1 — metadata for scope cuts, not a running order

La flecha va de Improvement a Summum: Summum **lee** `org_need` y `organization` de sus barcos para
mostrar la propuesta y **nunca** les escribe. La derivación ocurre solo cuando el dueño aprueba en
Improvement (paso 21).

- `apps/summum/server/sinapsis/approvals.ts`: `listProposals(userId, muelleId)` — `assertDockOwner`; las
  `propuesta`, `aprobada_socios` y `activa` del muelle con título y severidad de la necesidad, nombre del
  barco, `display_name` de la afiliada, `seal_score`, `match_score` y quién firmó. `approveProposal(userId,
  proposalId)` — mismas dos firmas que `approveEvaluation`: primera firma; mismo socio otra vez →
  `"Necesita la firma del otro dueño."`; otro socio → `aprobada_socios` con `partners_approved_at`; fuera
  de `propuesta` → `"Este cambio ya se decidió."`. `rejectProposal(userId, proposalId)` — `propuesta` o
  `aprobada_socios` → `rechazada`.
- `app/muelle/[muelleId]/sinapsis/page.tsx`: `requireDockOwnership`; `h1` "Sinapsis"; el párrafo literal
  `El dueño del negocio decide al final.`; una tarjeta por propuesta con los datos de arriba y
  `Aprobar`/`Rechazar`; sin propuestas, "No hay propuestas de especialista."
- Layout del muelle: enlace `Sinapsis`.
- `tests/e2e/red.spec.ts`: el dueño del muelle sembrado abre `/muelle/[muelleId]/sinapsis`; el perfil sin
  relación recibe 404.
- La sección del dueño en `/[org]/necesidades` de Improvement llega en el paso 25.

**Files**
- `apps/summum/server/sinapsis/approvals.ts` — new: lista, aprobación de dos socios y rechazo
- `apps/summum/app/muelle/[muelleId]/sinapsis/page.tsx` — new: propuestas para los socios
- `apps/summum/app/muelle/[muelleId]/layout.tsx` — edit: enlace `Sinapsis`
- `apps/summum/tests/sinapsis-approvals.test.ts` — new
- `apps/summum/tests/e2e/red.spec.ts` — edit: abre la pantalla de Sinapsis

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el primer socio aprueba una propuesta **THE SYSTEM SHALL** guardar `first_partner_id` y dejarla `propuesta`, WHEN el mismo socio aprueba otra vez THE SYSTEM SHALL devolver `{ ok: false, error: "Necesita la firma del otro dueño." }`, y WHEN aprueba el otro socio THE SYSTEM SHALL dejarla `aprobada_socios` con `partners_approved_at` no nulo.
2. **WHEN** los dos socios aprobaron **THE SYSTEM SHALL** dejar la `org_need` de la propuesta con su `status` original `abierta`.
3. **WHEN** un socio rechaza una propuesta **THE SYSTEM SHALL** dejarla `rechazada`, y WHEN alguien la aprueba después THE SYSTEM SHALL devolver `{ ok: false, error: "Este cambio ya se decidió." }`.
4. **WHEN** un dueño de otro muelle llama `approveProposal` o `listProposals` **THE SYSTEM SHALL** lanzar el 404 de `assertDockOwner`.
5. **WHEN** un dueño del muelle abre `/muelle/[muelleId]/sinapsis` **THE SYSTEM SHALL** responder 200 con un `h1` `Sinapsis` y el texto `El dueño del negocio decide al final.`, y WHEN la abre el perfil sin relación con el muelle THE SYSTEM SHALL responder 404.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/sinapsis-approvals.test.ts
pnpm --filter @jotapuntoce/summum test:e2e red.spec.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/sinapsis || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/sinapsis/approvals.ts ":(literal)apps/summum/app/muelle/[muelleId]/sinapsis/page.tsx" ":(literal)apps/summum/app/muelle/[muelleId]/layout.tsx" apps/summum/tests/sinapsis-approvals.test.ts apps/summum/tests/e2e/red.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T2 (step 22): aprobación de especialistas por los socios"
git tag step-22-si-sinapsis-aprobacion
git ls-files --error-unmatch apps/summum/server/sinapsis/approvals.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E3-T3` — Catálogo de premios de la red con interruptor de corte

**Depends on:** `E2-T5` · **Priority:** p1 — metadata for scope cuts, not a running order

Este paso es la coexistencia de §9.1: el catálogo global sigue entero y es el modo por defecto; el catálogo
de la red se enciende **por muelle**, como dato, y se apaga igual.

1. `packages/db/src/schema.ts`: `CATALOG_MODES = ["global", "red"] as const`; en `powerup_partner`
   (catálogo global, sin RLS nueva): `network_org_id` (→ organization, set null), `affiliate_id` (→
   affiliate, set null), `barco_org_id` (→ organization, set null), `published_by` (→ profile, set null),
   índice `idx_powerup_partner_network` (`network_org_id`, `is_active`); en `muelle_settings`:
   `catalog_mode` (`CATALOG_MODES`, not null, default `"global"`) con check `muelle_settings_catalog_check`.
   Ninguna fila existente cambia ni se borra.
2. `pnpm db:generate` (no hay tabla nueva: no hay `--custom`).
3. `server/powerups/catalog.ts`: `catalogModeFor(orgId)` — el `catalog_mode` del muelle padre del org (sin
   muelle o sin fila → `global`); `listCatalogForOrg(orgId)` — `global`: filas `is_active` con
   `network_org_id` null (el comportamiento de hoy); `red`: filas `is_active` con `network_org_id` = el
   muelle; `isInCatalog(partnerId, orgId)`.
4. `server/powerups/mutations.ts`: dentro de la transacción de `redeemPowerup`, después de leer el partner,
   si `!isInCatalog` → `log("powerup_not_in_catalog", { org_id: orgId, partner_id: partnerId }, "warn")` de
   `lib/logger.ts` (existente) y `{ ok: false, error: { code: "NOT_FOUND", message: "El PowerUp no existe." } }`.
   Esa línea de log es la señal del criterio de aborto 3 de §9.1. El
   balance, `pointsBalance` y `listActivePowerups` no cambian: los puntos siguen saliendo solo de objetivos.
5. **Aprobación obligatoria** del SQL por Jose Carlos; sin un "sí" explícito, detente. Luego `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: columnas de red en `powerup_partner`, `catalog_mode` en `muelle_settings`
- `packages/db/migrations/**` — new: la que emite `pnpm db:generate` (sin tablas nuevas, sin `--custom`)
- `apps/improvement/server/powerups/catalog.ts` — new: `catalogModeFor`, `listCatalogForOrg`, `isInCatalog`
- `apps/improvement/server/powerups/mutations.ts` — edit: `redeemPowerup` exige que el premio esté en el catálogo del org
- `apps/improvement/tests/powerups-red.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `listCatalogForOrg` corre para un org sin muelle **THE SYSTEM SHALL** devolver las filas globales activas y ninguna fila con `network_org_id`.
2. **WHEN** el muelle de un barco tiene `catalog_mode` `red` **THE SYSTEM SHALL** devolver solo los premios activos de ese muelle, con las filas globales todavía en la tabla y con `is_active` sin cambio.
3. **WHEN** un empleado de un barco en modo `red` canjea un premio global **THE SYSTEM SHALL** devolver `code: "NOT_FOUND"` sin insertar en `powerup_redemption`, y WHEN canjea un premio de la red con puntos suficientes THE SYSTEM SHALL insertar exactamente un canje.
4. **WHEN** el muelle vuelve a `catalog_mode` `global` **THE SYSTEM SHALL** devolver otra vez las filas globales para ese barco.
5. **WHEN** `pnpm --filter improvement test tests/powerups.test.ts` corre **THE SYSTEM SHALL** salir con código 0 — el canje existente sin cambios para orgs en modo global.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/powerups-red.test.ts tests/powerups.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/server/powerups/catalog.ts apps/improvement/server/powerups/mutations.ts apps/improvement/tests/powerups-red.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T3 (step 23): catálogo de premios de la red con modo global/red"
git tag step-23-si-premios-catalogo
git ls-files --error-unmatch apps/improvement/server/powerups/catalog.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E3-T4` — Publicar beneficios de la red desde Summum

**Depends on:** `E3-T3`, `E3-T2`, `E2-T8` · **Priority:** p1 — metadata for scope cuts, not a running order

- `apps/summum/server/benefits/benefits.ts`:
  - `publishBenefit(userId, muelleId, input)` — `{ as: "afiliada" | "negocio", barcoOrgId (si negocio),
    category (2-60), discountDescription (3-300), redemptionInstructions (3-500), pointsCost (entero
    1-100000) }`. `afiliada`: afiliada `activa` del muelle → `business_name = display_name`, `affiliate_id`.
    `negocio`: `userId` dueño de ese barco y el barco cuelga del muelle → `business_name = organization.name`,
    `barco_org_id`. Siempre `network_org_id = muelleId`, `published_by = userId`, `is_active = true`. Si no
    cumple → `"Revisa los datos del formulario."`.
  - `setBenefitActive(userId, benefitId, active)` — quien publicó o un dueño del muelle.
  - `listNetworkBenefits(userId, muelleId)` — dueño del muelle o afiliada activa.
  - `setCatalogMode(userId, muelleId, mode)` — `assertDockOwner`; upsert de `muelle_settings.catalog_mode`.
    Es el corte y el interruptor de reversa de §9.1.
- `app/red/[muelleId]/beneficios/page.tsx`: sesión; `listNetworkBenefits` (sin acceso → 404); `h1`
  "Beneficios de la red"; formulario de publicación con las opciones que la persona puede usar; lista con
  activar/desactivar; si es dueño del muelle, el control "Catálogo de PowerUps: global / solo red" con el
  texto de lo que cambia.
- `tests/e2e/red.spec.ts`: la afiliada sembrada abre `/red/[muelleId]/beneficios` y publica "Masaje de la
  red"; el dueño del muelle ve el control del catálogo.
- El cambio de Improvement que **usa** el catálogo por org (recepción y `/[org]/powerups`) llega en el paso
  25, con su e2e.

**Files**
- `apps/summum/server/benefits/benefits.ts` — new: publicar, activar y el modo del catálogo
- `apps/summum/app/red/[muelleId]/beneficios/page.tsx` — new
- `apps/summum/tests/benefits.test.ts` — new
- `apps/summum/tests/e2e/red.spec.ts` — edit: abre la pantalla de beneficios

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** una afiliada activa publica un beneficio como `afiliada` **THE SYSTEM SHALL** crear una fila `powerup_partner` con `network_org_id` igual al muelle, `affiliate_id` de la afiliada, `business_name` igual a su `display_name` e `is_active` true.
2. **WHEN** el dueño de un barco del muelle publica como `negocio` **THE SYSTEM SHALL** guardar `barco_org_id`, y WHEN lo intenta con un barco de otro muelle THE SYSTEM SHALL devolver `{ ok: false, error: "Revisa los datos del formulario." }` sin escribir.
3. **WHEN** un dueño del muelle llama `setCatalogMode` con `red` **THE SYSTEM SHALL** dejar `muelle_settings.catalog_mode` en `red`, y WHEN lo llama alguien que no es dueño del muelle THE SYSTEM SHALL lanzar el 404 de `assertDockOwner`.
4. **WHEN** la afiliada abre `/red/[muelleId]/beneficios` y publica `Masaje de la red` **THE SYSTEM SHALL** responder 200 con un `h1` `Beneficios de la red` y mostrar `Masaje de la red` en la lista, y WHEN el dueño del muelle abre la misma página THE SYSTEM SHALL mostrar el texto `Catálogo de PowerUps`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/benefits.test.ts
pnpm --filter @jotapuntoce/summum test:e2e red.spec.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/benefits || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/benefits/benefits.ts ":(literal)apps/summum/app/red/[muelleId]/beneficios/page.tsx" apps/summum/tests/benefits.test.ts apps/summum/tests/e2e/red.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T4 (step 24): publicar beneficios de la red"
git tag step-24-si-premios-publicar
git ls-files --error-unmatch apps/summum/server/benefits/benefits.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E3-T5` — Pantallas del dueño: perfil, especialistas y PowerUps

**Depends on:** `E3-T4` · **Priority:** p1 — metadata for scope cuts, not a running order

Las pantallas de Improvement que usan los motores de los pasos 21, 23 y 24, con su e2e en el mismo paso.

- `app/[org]/improvement/perfil/page.tsx`: `requireOrgMembership`; no dueño → `notFound()`; `h1` "Tu
  perfil y tu red"; el cuestionario (`fieldset`/`legend`/radios con `label`) y, si el org cuelga de un
  muelle, cada área con un `select` de especialidad; si no, "Tu empresa todavía no está en una red Summum."
- `app/[org]/necesidades/page.tsx`: sin quitar nada, si es dueño agrega la sección `h2` "Especialistas
  propuestos" con `listOwnerProposals` y, por cada `aprobada_socios`, los botones `Aceptar especialista` y
  `No por ahora` → `decideProposalAsOwner`; las `activa` se listan como "En curso".
- `server/lobby/loadLobby.ts` y `app/[org]/powerups/page.tsx`: cambia `listActivePowerups()` por
  `listCatalogForOrg(orgId)`. Nada más cambia en esos archivos.
- `tests/e2e/sinapsis.spec.ts` — spec nuevo, serial, mismo mecanismo de sesión que `tests/e2e/direccion.spec.ts`.
  `beforeAll`: un muelle con `muelle_settings` en `catalog_mode` `red` y un premio de red activo "Masaje de la
  red" (`network_org_id` = muelle, 10 puntos); un barco con `parent_org_id` = muelle, su dueño y un empleado
  sin tipo de permiso; un área con `specialty_key` `comercial`; una `org_need` `abierta` en esa área; una
  afiliada "Ana Comercial" y una `specialist_proposal` `aprobada_socios` para esa necesidad. Un segundo org
  sin muelle con su dueño. Ninguna fila global de `powerup_partner` se crea ni se toca. `afterAll` borra los
  orgs (cascade), luego los profiles y los usuarios de Auth.

**Files**
- `apps/improvement/app/[org]/improvement/perfil/page.tsx` — new: "Tu perfil y tu red"
- `apps/improvement/app/[org]/necesidades/page.tsx` — edit: sección "Especialistas propuestos" para el dueño
- `apps/improvement/server/lobby/loadLobby.ts` — edit: `listCatalogForOrg(orgId)` en lugar de `listActivePowerups()`
- `apps/improvement/app/[org]/powerups/page.tsx` — edit: igual
- `apps/improvement/tests/e2e/sinapsis.spec.ts` — new: las tres pantallas, abiertas en el paso que las toca

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el dueño del barco abre `/[org]/improvement/perfil` **THE SYSTEM SHALL** responder 200 con un `h1` `Tu perfil y tu red` y un `select` de especialidad para el área sembrada, y axe-core SHALL reportar 0 violaciones serious o critical.
2. **WHEN** el dueño del org sin muelle abre su `/[org]/improvement/perfil` **THE SYSTEM SHALL** mostrar `Tu empresa todavía no está en una red Summum.`, y WHEN el empleado abre `/[org]/improvement/perfil` THE SYSTEM SHALL responder 404.
3. **WHEN** el dueño del barco abre `/[org]/necesidades` **THE SYSTEM SHALL** mostrar la sección `Especialistas propuestos` con `Ana Comercial`, y WHEN pulsa `Aceptar especialista` THE SYSTEM SHALL mostrarla como `En curso`.
4. **WHEN** el dueño del barco abre `/[org]/powerups` **THE SYSTEM SHALL** responder 200 y mostrar `Masaje de la red`.
5. **WHEN** `pnpm --filter improvement test tests/lobby.test.ts tests/powerups.test.ts tests/powerups-red.test.ts` corre **THE SYSTEM SHALL** salir con código 0 — recepción y canje con el catálogo por org.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/lobby.test.ts tests/powerups.test.ts tests/powerups-red.test.ts
pnpm --filter improvement test:e2e sinapsis.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/improvement/perfil/page.tsx" ":(literal)apps/improvement/app/[org]/necesidades/page.tsx" apps/improvement/server/lobby/loadLobby.ts ":(literal)apps/improvement/app/[org]/powerups/page.tsx" apps/improvement/tests/e2e/sinapsis.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T5 (step 25): perfil del dueño, especialistas propuestos y catálogo por org"
git tag step-25-si-dueno-red-pantallas
git ls-files --error-unmatch apps/improvement/tests/e2e/sinapsis.spec.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E3-T6` — Esquema del Pacto con consentimiento y RLS estricta

**Depends on:** `E3-T3` · **Priority:** p1 — metadata for scope cuts, not a running order

Datos de salud (LFPDPPP): consentimiento expreso antes del primer registro, y cada registro lo lee solo su
dueño — ni los socios del muelle.

1. `packages/db/src/schema.ts`: `PACTO_CONSENT_VERSION = 1` y las cuatro tablas de §4 *Pacto*:
   `pacto_consent` (unique por `profile_id`), `pacto_pillar` (del muelle), `pacto_entry` (unique
   `profile_id` + `pillar_id` + `entry_date`) y `pacto_pause` (check `ends_on >= starts_on`).
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=pacto_rls`
   con el SQL de §4 *Migración `pacto_rls`*.
3. `apps/improvement/tests/pacto-schema.test.ts` (patrón `asUser()`).
4. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: `pacto_consent`, `pacto_pillar`, `pacto_entry`, `pacto_pause`
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_pacto_rls.sql`
- `apps/improvement/tests/pacto-schema.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** se insertan un `pacto_consent`, un `pacto_pillar`, un `pacto_entry` y un `pacto_pause` **THE SYSTEM SHALL** leerlos de vuelta.
2. **WHEN** se inserta un segundo `pacto_entry` del mismo perfil, pilar y fecha, un `pacto_pause` con `ends_on` antes de `starts_on` o un segundo `pacto_consent` del mismo perfil **THE SYSTEM SHALL** rechazar cada insert en la base.
3. **WHEN** la persona consulta `pacto_entry`, `pacto_consent` y `pacto_pause` como rol `authenticated` **THE SYSTEM SHALL** ver solo sus filas, y WHEN consulta un dueño del muelle THE SYSTEM SHALL devolver 0 filas de esas tres tablas que no sean suyas.
4. **WHEN** una afiliada activa del muelle consulta `pacto_pillar` **THE SYSTEM SHALL** ver los pilares de su muelle, y WHEN consulta un perfil sin relación con el muelle THE SYSTEM SHALL devolver 0 filas.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/pacto-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/pacto-schema.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T6 (step 26): esquema del Pacto con RLS por persona"
git tag step-26-si-pacto-esquema
git ls-files --error-unmatch apps/improvement/tests/pacto-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E3-T7` — Motor de racha y riesgo del Pacto y su servidor

**Depends on:** `E3-T6` · **Priority:** p1 — metadata for scope cuts, not a running order

- `server/auth/guard.ts`: agrega `assertPactoAccess(userId, muelleId)` — sin tocar lo existente: uuid válido
  y (dueño del muelle, o afiliada `activa` del muelle, o miembro de cualquier rol de un barco con
  `parent_org_id = muelle`); si no, `notFound()`.
- `server/pacto/streak.ts` — puro, sin base:
  - `mxDate(now: Date): string` — `YYYY-MM-DD` en America/Mexico_City con `Intl.DateTimeFormat("en-US",
    { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" })` y `formatToParts`.
  - `pillarStatus({ today, entryDates, pauses, since })` → `{ streak, risk }`. `since` (`YYYY-MM-DD`) es el día
    desde el que se le pide algo a la persona: el más tardío entre `mxDate(pacto_consent.accepted_at)` y
    `mxDate(pacto_pillar.created_at)`; todo día anterior a `since` cuenta como cubierto (no hay falta antes de
    aceptar ni antes de que el pilar exista). Un día está *cubierto* si tiene registro, cae en una posada o es
    anterior a `since`. `faltas` = días seguidos sin cubrir que terminan en `today` (incluido), contados solo
    desde `since`:
    0 → `al_dia`, 1 → `pendiente`, 2 → `peligro`, ≥ 3 → `desliz`. `streak` = días **con registro** dentro
    del tramo cubierto que termina en `today` (si `today` está cubierto) o en ayer (si no); si ni hoy ni ayer
    están cubiertos, 0. El tramo no empieza antes de `since`. La posada no suma ni rompe.
  - `supportStatus(risks)` → `apoyo` si alguno es `peligro` o `desliz`; si no, `bien`.
- `server/pacto/pacto.ts`:
  - `giveConsent(userId, muelleId)` — `assertPactoAccess`; crea o reactiva su `pacto_consent`
    (`consent_text_version = PACTO_CONSENT_VERSION`, `accepted_at = now`, `revoked_at = null`).
  - `revokeConsent(userId, { borrar })` — `revoked_at = now`; con `borrar`, borra sus `pacto_entry` y
    `pacto_pause` (es su derecho de cancelación).
  - `logEntry(userId, muelleId, input, now?)` — sin consentimiento vigente → `{ ok: false, error: "Primero
    acepta el Pacto." }` sin escribir; `{ pillarId (pilar activo del muelle), note (≤500 | null) }`;
    `entry_date = mxDate(now)`; upsert por perfil + pilar + fecha.
  - `pausePacto(userId, input)` — consentimiento vigente; `{ startsOn, endsOn, reason (≤300 | null) }`,
    máximo 30 días.
  - `myPacto(userId, muelleId, now?)` — `assertPactoAccess`; consentimiento y, por pilar activo, su
    `pillarStatus` con `today = mxDate(now)` y `since` = el más tardío entre `mxDate(accepted_at)` de su
    consentimiento vigente y `mxDate(created_at)` del pilar.
  - `upsertPillar(userId, muelleId, input)` — `assertDockOwner`; `{ id?, name (2-60), position, active }`.

**Files**
- `apps/summum/server/pacto/streak.ts` — new: `mxDate`, `pillarStatus`, `supportStatus` (puros)
- `apps/summum/server/pacto/pacto.ts` — new: consentimiento, registros, posada, pilares
- `apps/summum/server/auth/guard.ts` — edit: `assertPactoAccess`
- `apps/summum/tests/pacto-streak.test.ts` — new (puro)
- `apps/summum/tests/pacto.test.ts` — new (integración)

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `mxDate` recibe `2026-10-27T05:59:00Z` **THE SYSTEM SHALL** devolver `2026-10-26`, y con `2026-10-27T06:00:00Z` SHALL devolver `2026-10-27`.
2. **WHEN** `pillarStatus` corre con `today` `2026-10-26`, `since` `2026-10-01` y registros el 23, 24 y 25 **THE SYSTEM SHALL** devolver `streak` 3 y `risk` `pendiente`; con registros del 23 al 26 SHALL devolver `streak` 4 y `al_dia`; con registros del 20 al 22 y posada del 23 al 25 SHALL devolver `streak` 3 y `pendiente`; con solo un registro el 24 SHALL devolver `streak` 0 y `peligro`; y con solo un registro el 22 SHALL devolver `streak` 0 y `desliz`.
3. **WHEN** `pillarStatus` corre con `today` `2026-10-26`, `since` `2026-10-26` y sin registros **THE SYSTEM SHALL** devolver `streak` 0 y `risk` `pendiente`.
4. **WHEN** una persona sin consentimiento llama `logEntry` **THE SYSTEM SHALL** devolver `{ ok: false, error: "Primero acepta el Pacto." }` sin escribir, y WHEN ya aceptó y registra dos veces el mismo pilar el mismo día THE SYSTEM SHALL dejar una sola fila con `entry_date` igual a `mxDate(now)`.
5. **WHEN** la persona llama `revokeConsent` con `borrar` true **THE SYSTEM SHALL** dejar 0 filas `pacto_entry` suyas y `revoked_at` no nulo, y WHEN pide una posada de 31 días THE SYSTEM SHALL devolver `ok: false`.
6. **WHEN** un perfil sin relación con el muelle llama `giveConsent` **THE SYSTEM SHALL** lanzar el 404 de `assertPactoAccess`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/pacto-streak.test.ts tests/pacto.test.ts
pnpm --filter @jotapuntoce/summum test tests/guard.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/pacto || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/pacto/streak.ts apps/summum/server/pacto/pacto.ts apps/summum/server/auth/guard.ts apps/summum/tests/pacto-streak.test.ts apps/summum/tests/pacto.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T7 (step 27): motor del Pacto, consentimiento y registros"
git tag step-27-si-pacto-motor
git ls-files --error-unmatch apps/summum/server/pacto/streak.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E3-T8` — Escuadras y retos con fecha del Pacto

**Depends on:** `E3-T7` · **Priority:** p2 — metadata for scope cuts, not a running order

1. `packages/db/src/schema.ts`: las cuatro tablas de §4 *Escuadras y retos*.
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=escuadras_rls`
   con el SQL de §4 *Migración `escuadras_rls`*.
3. `server/pacto/squads.ts`:
   - `createSquad(userId, muelleId, name)` y `createChallenge(userId, muelleId, input)` — `assertDockOwner`;
     reto `{ title (3-120), pillarId (del muelle | null), squadId (del muelle | null), startsOn, endsOn
     (≥ startsOn) }`.
   - `addSquadMember(userId, squadId, email)` — dueño del muelle de la escuadra; el perfil debe tener
     `assertPactoAccess` en ese muelle **y** consentimiento vigente (si no: `"Revisa los datos del
     formulario."`, sin insertar).
   - `squadBoard(userId, squadId, now?)` — miembro de la escuadra o dueño del muelle (si no: `notFound()`);
     devuelve por miembro **solo** `{ name, supportStatus }` (`supportStatus` de los `pillarStatus` de esa
     persona, calculados con el mismo `since` que `myPacto`; nunca registros, notas ni pilares).
   - `joinChallenge(userId, challengeId)` — consentimiento vigente; `listChallenges(userId, muelleId, now?)` —
     activos (`startsOn <= mxDate(now) <= endsOn`).
4. `apps/summum/tests/squads.test.ts` — incluye la RLS con el patrón `asUser()` de
   `apps/improvement/tests/muelle-schema.test.ts`.
5. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: `squad`, `squad_member`, `challenge`, `challenge_participant`
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_escuadras_rls.sql`
- `apps/summum/server/pacto/squads.ts` — new
- `apps/summum/tests/squads.test.ts` — new: motor y RLS

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `squadBoard` corre para un miembro **THE SYSTEM SHALL** devolver objetos cuyas únicas llaves son `name` y `supportStatus`.
2. **WHEN** un miembro de la escuadra tiene un pilar en `peligro` **THE SYSTEM SHALL** mostrarlo con `supportStatus` `apoyo`, y WHEN todos sus pilares están `al_dia` THE SYSTEM SHALL mostrar `bien`.
3. **WHEN** `addSquadMember` recibe un perfil sin consentimiento vigente **THE SYSTEM SHALL** devolver `ok: false` sin insertar en `squad_member`, y WHEN alguien que no es miembro ni dueño llama `squadBoard` THE SYSTEM SHALL lanzar el 404.
4. **WHEN** un miembro consulta `squad_member` como rol `authenticated` **THE SYSTEM SHALL** ver los miembros de su escuadra y 0 filas `pacto_entry` de sus compañeros, y WHEN consulta un perfil fuera de la escuadra THE SYSTEM SHALL devolver 0 filas de `squad_member`.
5. **WHEN** `createChallenge` recibe `endsOn` antes de `startsOn` **THE SYSTEM SHALL** devolver `ok: false` sin escribir.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/squads.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/pacto || status=$?; test "$status" -eq 1
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/summum/server/pacto/squads.ts apps/summum/tests/squads.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T8 (step 28): escuadras y retos del Pacto con RLS"
git tag step-28-si-pacto-escuadras
git ls-files --error-unmatch apps/summum/server/pacto/squads.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E3-T9` — Mi transformación y panel del Pacto

**Depends on:** `E3-T8`, `E3-T4`, `E2-T8` · **Priority:** p2 — metadata for scope cuts, not a running order

- `app/red/[muelleId]/mi-transformacion/page.tsx`: sesión; `myPacto` (sin acceso → 404); `h1` "Mi
  transformación". Sin consentimiento vigente: el aviso de privacidad de §14 *Pacto y LFPDPPP* (qué se
  guarda, para qué, que solo tú lo ves, cómo revocar y borrar), una casilla con la etiqueta `Acepto que
  Summum guarde mis registros del Pacto` y el botón `Aceptar`; **ningún** botón de registro. Con
  consentimiento: por pilar, su `Racha N` y el riesgo en texto (`Al día` · `Pendiente hoy` · `En peligro`
  · `Desliz — aquí estamos para apoyarte`) con el botón `Registrar hoy`; formulario de posada; retos
  activos con `Unirme`; el tablero de su escuadra (nombre + `Bien`/`Necesita apoyo`); y el formulario
  "Revocar consentimiento" con la casilla "Borrar mis registros".
- `app/muelle/[muelleId]/pacto/page.tsx`: `requireDockOwnership`; `h1` "Pacto"; pilares (crear, ordenar,
  desactivar), escuadras (crear, agregar miembro por correo), retos (crear).
- Layout del muelle: enlace `Pacto`.
- `app/red/page.tsx`: sesión; `h1` "Mis redes"; los muelles donde la persona es dueña, afiliada activa o
  miembro de un barco, con enlaces a `mi-transformacion` y, si es afiliada, a `afiliada`.
- `tests/e2e/red.spec.ts`: siembra el pilar "Cuerpo" en el muelle; la afiliada abre
  `/red/[muelleId]/mi-transformacion`, ve la casilla, acepta, ve `Pendiente hoy`, registra y ve `Al día` y
  `Racha 1`; un perfil sin relación → 404; `/red` lista el muelle; el dueño del muelle crea un pilar.

**Files**
- `apps/summum/app/red/[muelleId]/mi-transformacion/page.tsx` — new: consentimiento, pilares, posada, retos, escuadra
- `apps/summum/app/muelle/[muelleId]/pacto/page.tsx` — new: pilares, escuadras y retos de los socios
- `apps/summum/app/muelle/[muelleId]/layout.tsx` — edit: enlace `Pacto`
- `apps/summum/app/red/page.tsx` — new: "Mis redes"
- `apps/summum/tests/e2e/red.spec.ts` — edit

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** la afiliada sin consentimiento abre `/red/[muelleId]/mi-transformacion` **THE SYSTEM SHALL** mostrar la casilla `Acepto que Summum guarde mis registros del Pacto` y ningún botón `Registrar hoy`.
2. **WHEN** la afiliada acepta **THE SYSTEM SHALL** mostrar el pilar `Cuerpo` con `Pendiente hoy`, y WHEN pulsa `Registrar hoy` THE SYSTEM SHALL mostrar `Al día` y `Racha 1`.
3. **WHEN** un perfil sin relación con el muelle abre `/red/[muelleId]/mi-transformacion` **THE SYSTEM SHALL** responder 404.
4. **WHEN** la afiliada abre `/red` **THE SYSTEM SHALL** mostrar el nombre del muelle con un enlace a su `mi-transformacion`.
5. **WHEN** un dueño del muelle crea el pilar `Descanso` en `/muelle/[muelleId]/pacto` **THE SYSTEM SHALL** responder 200 con un `h1` `Pacto` y mostrar `Descanso` en la lista de pilares.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test:e2e red.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/summum/app/red/[muelleId]/mi-transformacion/page.tsx" ":(literal)apps/summum/app/muelle/[muelleId]/pacto/page.tsx" ":(literal)apps/summum/app/muelle/[muelleId]/layout.tsx" apps/summum/app/red/page.tsx apps/summum/tests/e2e/red.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E3-T9 (step 29): Mi transformación y panel del Pacto"
git tag step-29-si-pacto-pantallas
git ls-files --error-unmatch apps/summum/app/red/page.tsx   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** una necesidad severa genera una propuesta, los dos socios la aprueban y el dueño la acepta **THE SYSTEM SHALL** dejar la propuesta `activa` y la necesidad `derivada` con `referred_at`.
2. **WHEN** el muelle de un barco está en `catalog_mode` `red` **THE SYSTEM SHALL** mostrar en ese barco solo los premios de la red, y WHEN vuelve a `global` THE SYSTEM SHALL mostrar otra vez el catálogo global.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @jotapuntoce/summum test:e2e red.spec.ts
```

## Pitfalls

- **Borrar el catálogo global** — nunca: se oculta por `catalog_mode`; borrarlo es la decomisión, y va en el checklist de lanzamiento.
- **Exponer registros del Pacto a la escuadra o a los socios** — ni por la app ni por RLS.
- **`getDay()` para el día del Pacto** — usa `mxDate`.
- **Escribir en `org_need` desde Summum** — rompe el puerto de una sola dirección.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-si-*'` los lista (9 de este epic; 42 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` sin cambios — este cambio no agrega variables.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Cada migración de este epic se aplicó solo después de un "sí" explícito de Jose Carlos.
