# Epic 04: Comunidad de afiliadas: feed, calendario, aula, referidos y ranking

> Al terminar, la red de afiliadas tiene feed, calendario con en vivo, aula con candado por nivel, enlace de referidos con comisión devengada sobre el libro existente y un ranking que existe solo entre afiliadas.

| | |
|---|---|
| **Epic id** | `04-comunidad` |
| **Tasks** | `E4-T1` … `E4-T6` |
| **Depends on** | `03-sinapsis-premios-pacto` |
| **Unlocks** | `05-personas-lealtad` |
| **Parallel with** | nada: comparte `packages/db/src/schema.ts` y el guard de Summum |

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
  src/schema.ts                                  # exists, you will edit it (E4-T1, E4-T4)
  migrations/                                    # comunidad_rls, referidos_rls
apps/improvement/tests/comunidad-schema.test.ts  # NEW (E4-T1)
apps/summum/
  server/auth/guard.ts                           # exists, you will edit it (E4-T2: assertNetworkMember)
  server/community/feed.ts, events.ts, levels.ts # NEW (E4-T2)
  server/community/classroom.ts                  # NEW (E4-T3)
  server/community/leaderboard.ts                # NEW (E4-T6)
  server/referrals/referrals.ts                  # NEW (E4-T4)
  server/money/ledger.ts                         # exists, read-only
  app/red/[muelleId]/{comunidad,calendario,aula,referidos}/page.tsx   # NEW (E4-T5)
  app/red/[muelleId]/ranking/page.tsx            # NEW (E4-T6)
  app/r/[code]/page.tsx                          # NEW (E4-T6)
  tests/comunidad, classroom, referrals, leaderboard (.test.ts)   # NEW
  tests/e2e/red.spec.ts                          # exists, you will extend it (E4-T5, E4-T6)
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `post`, `comment` | `muelle_org_id`, `author_id`, `body` | Red: dueños del muelle y afiliadas activas |
| `community_event` | `muelle_org_id`, `title`, `starts_at`, `ends_at`, `live_url` (https), `description`, `created_by` | |
| `course`, `lesson`, `lesson_completion` | `min_level` 1-9; lección con `body`, `video_url`; completada única por persona | El candado por nivel es de la app |
| `referral_link` | `profile_id`, `muelle_org_id`, `code` unique | Para todos |
| `referral_attribution` | `barco_org_id` unique, `referral_link_id`, `share_bps`, `journey_months`, `starts_at`, `proposed_by` ≠ `approved_by` | Dos firmas |
| `referral_commission` | `attribution_id`, `ledger_entry_id` unique, `amount_cents` | Devengado, no pagado |

Columnas completas, checks e índices: en el **Do** de cada tarea de esquema y en el apéndice de abajo,
copiado literal de `blueprint.md` §4 (incluye el SQL de RLS que cada tarea pega en su archivo `--custom`).

### Apéndice de esquema (copia de blueprint.md §4)

#### §4 · Comunidad

**`post`** — `id`, `muelle_org_id` (cascade, not null), `author_id` (FK profile cascade, not null), `body`
text not null check `length(body) between 1 and 4000`, `created_at`, `updated_at`; índice (`muelle_org_id`,
`created_at`). **`comment`** — `id`, `post_id` (FK post cascade, not null), `author_id` (cascade, not
null), `body` text not null check `length(body) between 1 and 2000`, `created_at`.
**`community_event`** — `id`, `muelle_org_id` (cascade, not null), `title` text not null, `starts_at`
timestamptz not null, `ends_at` timestamptz null (check `ends_at is null or ends_at >= starts_at`),
`live_url` text null (check `live_url is null or live_url like 'https://%'`), `description` text not null
default `''`, `created_by` (FK profile set null), `created_at`. **`course`** — `id`, `muelle_org_id`
(cascade, not null), `title`, `description` text not null default `''`, `min_level` integer not null
default 1 check 1-9, `position` integer not null default 0, `published` boolean not null default false,
`created_at`, `updated_at`. **`lesson`** — `id`, `course_id` (cascade, not null), `title`, `body` text
not null default `''`, `video_url` text null (check https), `position`, `created_at`, `updated_at`.
**`lesson_completion`** — `id`, `lesson_id` (cascade, not null), `profile_id` (cascade, not null),
`completed_at` timestamptz not null default `now()`; unique (`lesson_id`, `profile_id`).

#### §4 · Referidos

**`referral_link`** — `id`, `profile_id` (cascade, not null), `muelle_org_id` (cascade, not null), `code`
text not null **unique**, `created_at`; unique (`profile_id`, `muelle_org_id`).
**`referral_attribution`** — `id`, `muelle_org_id` (cascade, not null), `barco_org_id` (FK organization
cascade, not null, **unique**), `referral_link_id` (FK `referral_link.id` restrict, not null), `share_bps`
integer not null check 0-10000, `journey_months` integer not null check 1-60, `starts_at` timestamptz not
null, `proposed_by` (FK profile, not null), `approved_by` (FK profile, null; check
`referral_attribution_otra_firma`: `approved_by is null or approved_by <> proposed_by`), `approved_at`
timestamptz null, `created_at`. **`referral_commission`** — `id`, `attribution_id` (FK restrict, not null),
`ledger_entry_id` (FK `ledger_entry.id` restrict, not null, **unique**), `amount_cents` bigint not null
check `>= 0`, `created_at`. Solo se insertan filas.

#### §4 · Migración `comunidad_rls`

```sql
-- La comunidad es de la red de afiliadas: dueños del muelle y afiliadas activas.
alter table post enable row level security;
create policy "network members read posts" on post for select using (public.is_network_member(post.muelle_org_id));

alter table comment enable row level security;
create policy "network members read comments of readable posts"
  on comment for select using (exists (select 1 from post p where p.id = comment.post_id));

alter table community_event enable row level security;
create policy "network members read events"
  on community_event for select using (public.is_network_member(community_event.muelle_org_id));

-- El candado por nivel es de la app (el nivel se calcula en el servidor); RLS limita a la red.
alter table course enable row level security;
create policy "network members read courses" on course for select using (public.is_network_member(course.muelle_org_id));

alter table lesson enable row level security;
create policy "network members read lessons of readable courses"
  on lesson for select using (exists (select 1 from course c where c.id = lesson.course_id));

alter table lesson_completion enable row level security;
create policy "people read their completions, dock owners read their network's"
  on lesson_completion for select
  using (lesson_completion.profile_id = auth.uid() or exists (
    select 1 from lesson l join course c on c.id = l.course_id
    where l.id = lesson_completion.lesson_id and public.is_dock_owner(c.muelle_org_id)));

grant select on post, comment, community_event, course, lesson, lesson_completion to authenticated;
```

#### §4 · Migración `referidos_rls`

```sql
-- Referidos: el referente ve lo suyo; los socios ven su muelle. Otro referente no ve nada ajeno.
alter table referral_link enable row level security;
create policy "owners of the link and dock owners read referral links"
  on referral_link for select
  using (referral_link.profile_id = auth.uid() or public.is_dock_owner(referral_link.muelle_org_id));

alter table referral_attribution enable row level security;
create policy "dock owners and the referrer read attributions"
  on referral_attribution for select
  using (public.is_dock_owner(referral_attribution.muelle_org_id) or exists (
    select 1 from referral_link l where l.id = referral_attribution.referral_link_id and l.profile_id = auth.uid()));

-- La subconsulta corre con el RLS de referral_attribution: solo comisiones de atribuciones visibles.
alter table referral_commission enable row level security;
create policy "commissions of readable attributions"
  on referral_commission for select
  using (exists (select 1 from referral_attribution a where a.id = referral_commission.attribution_id));

grant select on referral_link, referral_attribution, referral_commission to authenticated;
```

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| `03` | `assertPactoAccess` | dueño, afiliada activa o miembro de un barco del muelle |
| `02` | `affiliate` (`display_name`, `status`) | |
| repo | `ledger_entry` (`summum_fee_cents`, `barco_org_id`, `created_at`) | Solo lo escribe el webhook de Stripe; aquí solo se lee |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `apps/summum/server/auth/guard.ts` → `assertNetworkMember` | `(userId, muelleId) => Promise<void>` | E4-T3, E4-T6 |
| `apps/summum/server/community/levels.ts` → `LEVEL_THRESHOLDS`, `levelFor`, `memberPoints` | ver E4-T2 | E4-T3, E4-T6 |

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
- **El ranking es solo entre afiliadas.** Nunca un ranking de empleados ni en `apps/improvement`.
- **Comisiones sobre `summum_fee_cents`** con `Math.floor`; nada se paga por Stripe desde aquí.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/summum-improvement.md`,
`.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`, `.claude/rules/ia-gateway.md`.
All sit in the project root.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick.

### `E4-T1` — Esquema de la comunidad: feed, calendario y aula

**Depends on:** `E3-T8` · **Priority:** p2 — metadata for scope cuts, not a running order

La comunidad es de la red de afiliadas: la ven los dueños del muelle y las afiliadas `activa` (función
`public.is_network_member`, creada en `afiliadas_rls`). Los empleados y dueños de barcos no entran aquí.

1. `packages/db/src/schema.ts`: las seis tablas de §4 *Comunidad*, con sus checks (`course.min_level`
   1-9, `community_event.live_url` que empieza con `https://` o null, cuerpos no vacíos) y el unique de
   `lesson_completion` (`lesson_id`, `profile_id`).
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=comunidad_rls`
   con el SQL de §4 *Migración `comunidad_rls`*.
3. `apps/improvement/tests/comunidad-schema.test.ts` (patrón `asUser()`).
4. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: `post`, `comment`, `community_event`, `course`, `lesson`, `lesson_completion`
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_comunidad_rls.sql`
- `apps/improvement/tests/comunidad-schema.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** se insertan un `post`, un `comment`, un `community_event`, un `course`, una `lesson` y un `lesson_completion` **THE SYSTEM SHALL** leerlos de vuelta.
2. **WHEN** se inserta un `course` con `min_level` 10, un `community_event` con `live_url` `http://ejemplo.com`, un `comment` con cuerpo vacío o un segundo `lesson_completion` de la misma lección y persona **THE SYSTEM SHALL** rechazar cada insert en la base.
3. **WHEN** una afiliada `activa` del muelle consulta `post`, `course` y `community_event` como rol `authenticated` **THE SYSTEM SHALL** ver las filas de su muelle, y WHEN consulta una afiliada `suspendida` o un empleado de un barco del muelle THE SYSTEM SHALL devolver 0 filas.
4. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/comunidad-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/comunidad-schema.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E4-T1 (step 30): esquema de la comunidad con RLS"
git tag step-30-si-comunidad-esquema
git ls-files --error-unmatch apps/improvement/tests/comunidad-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E4-T2` — Motor de comunidad: feed, calendario y niveles

**Depends on:** `E4-T1`, `E3-T7` · **Priority:** p2 — metadata for scope cuts, not a running order

- `server/auth/guard.ts`: agrega `assertNetworkMember(userId, muelleId)` — dueño del muelle o afiliada
  `activa` del muelle; si no, `notFound()`. Lo existente no cambia.
- `server/community/levels.ts`: `LEVEL_THRESHOLDS = [0, 10, 30, 60, 100, 150, 220, 300, 400] as const`
  (nivel 1 a 9) y `COMMUNITY_POINTS = { post: 2, comment: 1, lesson: 5 } as const` — constantes del producto,
  iguales para toda red; `levelFor(points)` puro (el mayor nivel cuyo umbral es ≤ puntos);
  `memberPoints(muelleId): Promise<Map<string, number>>` — por `profile_id`: posts × 2 + comentarios × 1 +
  lecciones completadas × 5, todo dentro del muelle.
- `server/community/feed.ts`: `createPost(userId, muelleId, body)` (1-4000), `addComment(userId, postId,
  body)` (1-2000), `listFeed(userId, muelleId)` (los 50 más recientes con nombre del autor y número de
  comentarios), `deletePost(userId, postId)` (autor o dueño del muelle; si no, `"Revisa los datos del
  formulario."`). Todo con `assertNetworkMember`.
- `server/community/events.ts`: `createEvent(userId, muelleId, input)` — `assertDockOwner`; `{ title
  (3-160), startsAt, endsAt (≥ startsAt | null), liveUrl (https | null), description (≤2000) }`;
  `listUpcoming(userId, muelleId, now?)` — `assertNetworkMember`; los que empiezan desde `now`, por fecha.

**Files**
- `apps/summum/server/community/feed.ts` — new
- `apps/summum/server/community/events.ts` — new
- `apps/summum/server/community/levels.ts` — new: puntos y niveles 1-9
- `apps/summum/server/auth/guard.ts` — edit: `assertNetworkMember`
- `apps/summum/tests/comunidad.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `levelFor` recibe 0, 9, 10, 400 y 5000 **THE SYSTEM SHALL** devolver 1, 1, 2, 9 y 9.
2. **WHEN** una afiliada tiene 2 posts, 1 comentario y 1 lección completada en el muelle **THE SYSTEM SHALL** hacer que `memberPoints` le dé 10 puntos y `levelFor` nivel 2.
3. **WHEN** una afiliada `suspendida` llama `createPost` **THE SYSTEM SHALL** lanzar el 404 de `assertNetworkMember` sin escribir.
4. **WHEN** un dueño del muelle llama `createEvent` con `liveUrl` `http://ejemplo.com` **THE SYSTEM SHALL** devolver `ok: false`, y WHEN `listUpcoming` corre THE SYSTEM SHALL excluir los eventos que empezaron antes de `now`.
5. **WHEN** una afiliada que no es autora ni dueña del muelle llama `deletePost` **THE SYSTEM SHALL** devolver `{ ok: false, error: "Revisa los datos del formulario." }` y el post SHALL seguir existiendo.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/comunidad.test.ts tests/guard.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/community || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/community/feed.ts apps/summum/server/community/events.ts apps/summum/server/community/levels.ts apps/summum/server/auth/guard.ts apps/summum/tests/comunidad.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E4-T2 (step 31): feed, calendario y niveles de la comunidad"
git tag step-31-si-comunidad-motor
git ls-files --error-unmatch apps/summum/server/community/levels.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E4-T3` — Motor del aula con candado por nivel

**Depends on:** `E4-T2` · **Priority:** p2 — metadata for scope cuts, not a running order

- `server/community/classroom.ts`: `createCourse(userId, muelleId, input)` — `assertDockOwner`; `{ title,
  description, minLevel (1-9), position, published }`; `createLesson(userId, courseId, input)` — dueño del
  muelle del curso; `{ title, body (≤20000), videoUrl (https | null), position }`; `listCourses(userId,
  muelleId)` — `assertNetworkMember`; cursos `published`, cada uno con `locked = levelFor(puntos) <
  min_level` y sus lecciones **solo** si no está bloqueado; `completeLesson(userId, lessonId)` — miembro y
  curso no bloqueado (si no, `"Revisa los datos del formulario."`); idempotente por el unique.
- Las pantallas de aula, comunidad y calendario llegan en el paso 34, con su e2e.

**Files**
- `apps/summum/server/community/classroom.ts` — new: cursos, lecciones y el candado por nivel
- `apps/summum/tests/classroom.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** una afiliada de nivel 1 llama `listCourses` **THE SYSTEM SHALL** devolver un curso con `min_level` 2 con `locked` true y sin lecciones, y WHEN llama `completeLesson` sobre una de sus lecciones THE SYSTEM SHALL devolver `ok: false` sin escribir.
2. **WHEN** la misma afiliada llega a 10 puntos **THE SYSTEM SHALL** devolver ese curso con `locked` false y sus lecciones.
3. **WHEN** la afiliada completa dos veces la misma lección **THE SYSTEM SHALL** dejar una sola fila `lesson_completion`.
4. **WHEN** un perfil que no es de la red llama `listCourses` **THE SYSTEM SHALL** lanzar el 404 de `assertNetworkMember`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/classroom.test.ts tests/comunidad.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/community || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/community/classroom.ts apps/summum/tests/classroom.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E4-T3 (step 32): motor del aula por nivel"
git tag step-32-si-comunidad-aula
git ls-files --error-unmatch apps/summum/server/community/classroom.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E4-T4` — Referidos con atribución, comisión devengada y reporte

**Depends on:** `E4-T1`, `E3-T7` · **Priority:** p2 — metadata for scope cuts, not a running order

El dinero se queda en el muelle existente: la comisión se **devenga** sobre `ledger_entry.summum_fee_cents`
de los barcos referidos durante su recorrido y se reporta. Pagarla por Stripe no es de este blueprint.

1. `packages/db/src/schema.ts`: las tres tablas de §4 *Referidos*.
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=referidos_rls`
   con el SQL de §4 *Migración `referidos_rls`*.
3. `server/referrals/referrals.ts`:
   - `ensureReferralLink(userId, muelleId)` — `assertPactoAccess` (dueño, afiliada o miembro de un barco:
     el enlace es para todos); `code` = `crypto.randomBytes(12).toString("base64url")` (16 caracteres);
     una por perfil y muelle; la segunda llamada devuelve la misma.
   - `proposeAttribution(userId, muelleId, input)` — `assertDockOwner`; `{ barcoOrgId (barco del muelle),
     code (de un enlace del muelle), shareBps (0-10000), journeyMonths (1-60), startsAt }`.
   - `approveAttribution(userId, attributionId)` — otro dueño del muelle: mismo socio →
     `"Necesita la firma del otro dueño."`; ya aprobada → `"Este cambio ya se decidió."`.
   - `accrueCommissions(muelleId, now?)` — por cada atribución aprobada, los `ledger_entry` de su barco con
     `created_at` en [`starts_at`, `starts_at` + `journey_months` meses) sin comisión: inserta
     `amount_cents = Math.floor(summum_fee_cents × share_bps / 10000)`. Idempotente por el unique de
     `ledger_entry_id`. Devuelve cuántas creó.
   - `referralReport(userId, muelleId)` — como referente: su enlace, sus atribuciones y su total devengado;
     como dueño del muelle: todas.
4. La pantalla de referidos llega en el paso 34, con su e2e.
5. `tests/referrals.test.ts` (incluye RLS con `asUser()`).
6. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: `referral_link`, `referral_attribution`, `referral_commission`
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_referidos_rls.sql`
- `apps/summum/server/referrals/referrals.ts` — new
- `apps/summum/tests/referrals.test.ts` — new: motor y RLS

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `ensureReferralLink` corre dos veces para la misma persona y muelle **THE SYSTEM SHALL** devolver el mismo `code` de 16 caracteres `[A-Za-z0-9_-]`.
2. **WHEN** el socio que propuso una atribución intenta aprobarla **THE SYSTEM SHALL** devolver `{ ok: false, error: "Necesita la firma del otro dueño." }`, y WHEN la aprueba el otro socio THE SYSTEM SHALL fijar `approved_by` y `approved_at`.
3. **WHEN** `accrueCommissions` corre sobre una atribución aprobada de 2500 puntos base y un `ledger_entry` del barco dentro del recorrido con `summum_fee_cents` 1000 **THE SYSTEM SHALL** insertar una `referral_commission` de 250 centavos, y WHEN corre otra vez THE SYSTEM SHALL no insertar otra.
4. **WHEN** un `ledger_entry` del barco es anterior a `starts_at` o posterior al fin del recorrido **THE SYSTEM SHALL** no generar comisión.
5. **WHEN** el referente consulta `referral_commission` como rol `authenticated` **THE SYSTEM SHALL** ver sus comisiones, y WHEN consulta otro referente del mismo muelle THE SYSTEM SHALL devolver 0 filas de esas comisiones.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/referrals.test.ts tests/ledger.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/referrals || status=$?; test "$status" -eq 1
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/summum/server/referrals/referrals.ts apps/summum/tests/referrals.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E4-T4 (step 33): referidos sobre ledger_entry con RLS"
git tag step-33-si-referidos
git ls-files --error-unmatch apps/summum/server/referrals/referrals.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E4-T5` — Pantallas de aula, comunidad, calendario y referidos

**Depends on:** `E4-T4`, `E4-T3`, `E3-T9` · **Priority:** p2 — metadata for scope cuts, not a running order

Las cuatro pantallas de la red sobre los motores de los pasos 31, 32 y 33, abiertas en el e2e en el mismo paso.

- `app/red/[muelleId]/aula/page.tsx`: sesión + `listCourses`; `h1` "Aula"; tu nivel en texto (`Nivel N`);
  cursos bloqueados con `Se abre en el nivel N`; lecciones con `Marcar como vista`.
- `app/red/[muelleId]/comunidad/page.tsx`: `h1` "Comunidad"; formulario de publicación y feed con
  comentarios (`listFeed`, `createPost`, `addComment`).
- `app/red/[muelleId]/calendario/page.tsx`: `h1` "Calendario"; `listUpcoming` con fecha y hora es-MX en
  America/Mexico_City y el enlace `Entrar en vivo` cuando hay `live_url`; formulario de evento si es dueño.
- `app/red/[muelleId]/referidos/page.tsx`: sesión; `ensureReferralLink`; `h1` "Referidos"; tu enlace
  (`NEXT_PUBLIC_SUMMUM_URL` + `/r/` + código), tus barcos referidos y lo devengado en MXN. Si es dueño del
  muelle: llama `accrueCommissions` al cargar y muestra proponer/aprobar atribuciones y el reporte del
  muelle, con la nota "Devengado, no pagado".
- `tests/e2e/red.spec.ts`: siembra un curso publicado `Ventas consultivas` con `min_level` 9; la afiliada abre,
  en este orden, aula (todavía sin publicaciones: nivel 1), comunidad (publica "Hola red"), calendario y
  referidos; el perfil sin relación recibe 404 en el aula.

**Files**
- `apps/summum/app/red/[muelleId]/aula/page.tsx` — new
- `apps/summum/app/red/[muelleId]/comunidad/page.tsx` — new: feed
- `apps/summum/app/red/[muelleId]/calendario/page.tsx` — new
- `apps/summum/app/red/[muelleId]/referidos/page.tsx` — new
- `apps/summum/tests/e2e/red.spec.ts` — edit: las cuatro pantallas, abiertas en el paso que las crea

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** la afiliada abre `/red/[muelleId]/aula` **THE SYSTEM SHALL** responder 200 con un `h1` `Aula`, el texto `Nivel 1` y el curso `Ventas consultivas` con `Se abre en el nivel 9`.
2. **WHEN** la afiliada publica `Hola red` en `/red/[muelleId]/comunidad` **THE SYSTEM SHALL** responder 200 con un `h1` `Comunidad` y mostrar `Hola red` en el feed.
3. **WHEN** la afiliada abre `/red/[muelleId]/calendario` **THE SYSTEM SHALL** responder 200 con un `h1` `Calendario`.
4. **WHEN** la afiliada abre `/red/[muelleId]/referidos` **THE SYSTEM SHALL** responder 200 con un `h1` `Referidos` y un enlace que contiene `/r/`, y WHEN el dueño del muelle la abre THE SYSTEM SHALL mostrar `Devengado, no pagado`.
5. **WHEN** el perfil sin relación con el muelle abre `/red/[muelleId]/aula` **THE SYSTEM SHALL** responder 404.

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
git add -- ":(literal)apps/summum/app/red/[muelleId]/aula/page.tsx" ":(literal)apps/summum/app/red/[muelleId]/comunidad/page.tsx" ":(literal)apps/summum/app/red/[muelleId]/calendario/page.tsx" ":(literal)apps/summum/app/red/[muelleId]/referidos/page.tsx" apps/summum/tests/e2e/red.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E4-T5 (step 34): pantallas de aula, comunidad, calendario y referidos"
git tag step-34-si-comunidad-pantallas
git ls-files --error-unmatch ":(literal)apps/summum/app/red/[muelleId]/aula/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E4-T6` — Ranking entre afiliadas y página pública del enlace

**Depends on:** `E4-T5`, `E2-T8` · **Priority:** p2 — metadata for scope cuts, not a running order

- `server/community/leaderboard.ts`: `leaderboard(userId, muelleId)` — `assertNetworkMember`; **solo**
  afiliadas `activa` del muelle (ni dueños del muelle ni gente de barcos), cada una con `display_name`,
  puntos de `memberPoints` y `levelFor`, ordenadas por puntos desc y luego por nombre. `referrerByCode(code)`
  — sin sesión; el código debe pasar `/^[A-Za-z0-9_-]{16}$/`; devuelve solo `{ firstName }` (el
  `display_name` de la afiliada o el `full_name` del perfil, primera palabra) o `null`.
- `app/red/[muelleId]/ranking/page.tsx`: `h1` "Ranking de afiliadas"; `ol` con posición, nombre, `Nivel N` y
  puntos.
- `app/r/[code]/page.tsx`: `referrerByCode` (null → `notFound()`); "Te recomendó <nombre>", el código visible
  ("Menciónalo al agendar") y un enlace a `/diagnostico`; `metadata` con `robots: { index: false }`.
- `tests/e2e/red.spec.ts`: la afiliada ve `/red/[muelleId]/ranking` con su nombre y `Nivel`; un visitante
  abre `/r/<código sembrado>` y ve `Te recomendó`; `/r/AAAAAAAAAAAAAAAA` → 404.

**Files**
- `apps/summum/server/community/leaderboard.ts` — new: `leaderboard`, `referrerByCode`
- `apps/summum/app/red/[muelleId]/ranking/page.tsx` — new
- `apps/summum/app/r/[code]/page.tsx` — new: página pública sin sesión
- `apps/summum/tests/leaderboard.test.ts` — new
- `apps/summum/tests/e2e/red.spec.ts` — edit

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `leaderboard` corre en un muelle con dos afiliadas activas de 10 y 30 puntos, una suspendida y un dueño del muelle con publicaciones **THE SYSTEM SHALL** devolver solo las dos activas, la de 30 primero, con `level` 3 y 2.
2. **WHEN** `referrerByCode` recibe un código que no cumple `/^[A-Za-z0-9_-]{16}$/` o que no existe **THE SYSTEM SHALL** devolver `null`.
3. **WHEN** la afiliada abre `/red/[muelleId]/ranking` **THE SYSTEM SHALL** responder 200 con un `h1` `Ranking de afiliadas`, su nombre y el texto `Nivel`.
4. **WHEN** un visitante sin sesión abre `/r/<código existente>` **THE SYSTEM SHALL** responder 200 con `Te recomendó`, y WHEN abre `/r/AAAAAAAAAAAAAAAA` THE SYSTEM SHALL responder 404.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/leaderboard.test.ts
pnpm --filter @jotapuntoce/summum test:e2e red.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/community/leaderboard.ts ":(literal)apps/summum/app/red/[muelleId]/ranking/page.tsx" ":(literal)apps/summum/app/r/[code]/page.tsx" apps/summum/tests/leaderboard.test.ts apps/summum/tests/e2e/red.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E4-T6 (step 35): ranking de afiliadas y enlace público de referido"
git tag step-35-si-ranking
git ls-files --error-unmatch apps/summum/server/community/leaderboard.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** una afiliada activa abre `/red/[muelleId]/comunidad`, `/red/[muelleId]/calendario`, `/red/[muelleId]/aula` y `/red/[muelleId]/ranking` **THE SYSTEM SHALL** responder 200 en cada una.
2. **WHEN** `accrueCommissions` corre dos veces sobre la misma atribución aprobada **THE SYSTEM SHALL** dejar una sola comisión por `ledger_entry`.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @jotapuntoce/summum test:e2e red.spec.ts
```

## Pitfalls

- **Contar a los dueños del muelle en el ranking** — solo afiliadas `activa`.
- **Mostrar lecciones de un curso bloqueado** — `listCourses` no las devuelve; la página no las pide por otro lado.
- **Un `live_url` `http://`** — el check de la base lo rechaza; valida antes con el mismo criterio.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-si-*'` los lista (6 de este epic; 42 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` sin cambios — este cambio no agrega variables.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Cada migración de este epic se aplicó solo después de un "sí" explícito de Jose Carlos.
