# Epic 03: Agentes, encargos y canal

> Al terminar, cada org tiene a Improvement como manager y agente del dueño, una recepción que recibe todos los encargos y un especialista por jefe de área; los encargos se rutean y se ejecutan desde `POST /api/agentes/<tarea>`; el equipo conversa en `/[org]/canal` con Realtime; y el worker `apps/agentes` corre en un VPS bajo systemd sin credenciales de base ni de IA.

| | |
|---|---|
| **Epic id** | `03-agentes` |
| **Tasks** | `E3-T1` … `E3-T9` |
| **Depends on** | `02-oficina` |
| **Unlocks** | `04-crm-erp`, `05-agenda` (las tareas `agenda`/`google` del runtime), `06-butacas` (la tarea `butacas`) |
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
  src/schema.ts                                    # exists, you will edit it (E3-T1, E3-T2)
  migrations/                                      # db:generate + --custom agentes_rls, canal_rls
apps/improvement/
  server/agents/heads.ts, agents.ts                # NEW (E3-T3)
  server/channels/channels.ts                      # NEW (E3-T4)
  server/agents/tasks.ts                           # NEW (E3-T5)
  server/agents/tareas.ts, runtime.ts              # NEW (E3-T6) — tareas.ts no importa nada
  server/ai/prompts/agent.ts                       # NEW (E3-T6)
  server/ai/gateway.ts                             # exists (epic 02), read-only
  server/permissions/sections.ts                   # exists, you will edit it (E3-T7: `canal`)
  app/api/agentes/[tarea]/route.ts                 # NEW (E3-T6)
  app/[org]/canal/page.tsx, ChannelLive.tsx        # NEW (E3-T7)
  tests/agentes-schema, canal-schema, agents, channels, agent-tasks,
        agents-runtime (.test.ts)                  # NEW
  tests/e2e/canal.spec.ts                          # NEW (E3-T7)
apps/agentes/                                      # NEW package (E3-T8, E3-T9)
  package.json, tsconfig.json, vitest.config.ts    # copiados de workspace/ (§19.6)
  src/main.ts, schedule.ts, client.ts
  tests/schedule.test.ts
  deploy/agentes.service                           # copiado de workspace/ (§19.6)
pnpm-lock.yaml                                     # E3-T8: el importer nuevo, sin versiones nuevas
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not listed
here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `agent` | `org_id`, `kind` (`manager`\|`especialista`\|`recepcion`), `area_id` (solo especialista), `owner_profile_id`, `name`, `instructions`, `skills` jsonb, `last_report_on` | Uno manager y una recepción por org; un especialista por área (únicos parciales). RLS: solo el dueño |
| `agent_task` | `org_id`, `agent_id`, `requested_by`, `area_id`, `channel_id`, `body` 1-2000, `status`, `attempts` 0-3, `locked_until`, `result` | RLS: quien lo pidió y el dueño |
| `worker_heartbeat` | `worker` pk, `seen_at` | RLS sin política: nadie lo lee por PostgREST |
| `channel` | `org_id`, `kind` (`general`\|`area`\|`directo`\|`agente`), `area_id`, `agent_id`, `profile_id`, `name` | Un `general` por org; un canal `agente` por (agente, persona) |
| `channel_member` | `channel_id`, `profile_id` | RLS: cada quien ve sus propias filas |
| `message` | `org_id`, `channel_id`, `author_profile_id` \| `author_agent_id` (uno), `body` ≤ 4000, `deleted_at` | Borrado suave (`body = ''`); en la publicación `supabase_realtime` |

### Apéndice de esquema (copia de blueprint.md §4)

#### `agentes_rls`

```sql
-- Custom SQL migration file, put your code below! --
-- Agentes y encargos. Las instrucciones de un agente pueden llevar memoria del dueño: solo el dueño
-- lee `agent`. Un encargo lo lee quien lo pidió y el dueño. `worker_heartbeat` no tiene política: RLS
-- encendida sin política = nadie lo lee por PostgREST; solo el servidor (rol dueño) lo escribe.
alter table agent enable row level security;
create policy "owners read their org's agents"
  on agent for select
  using (exists (
    select 1 from membership m
    where m.org_id = agent.org_id and m.user_id = auth.uid() and m.role = 'owner'));

alter table agent_task enable row level security;
create policy "requesters and owners read encargos"
  on agent_task for select
  using (agent_task.requested_by = auth.uid() or exists (
    select 1 from membership m
    where m.org_id = agent_task.org_id and m.user_id = auth.uid() and m.role = 'owner'));

alter table worker_heartbeat enable row level security;

grant select on agent, agent_task to authenticated;
```

#### `canal_rls`

```sql
-- Custom SQL migration file, put your code below! --
-- Canal. `channel_member` se lee solo la fila propia (sin auto-referencia: una política que consulta
-- su propia tabla entra en recursión). `channel` y `message` se leen si hay una fila propia en
-- channel_member. El mensaje NO se filtra por deleted_at: el borrado es suave (body vacío por check) y
-- el UPDATE tiene que llegar por Realtime a los miembros; un DELETE físico no lo filtra RLS en Realtime.
alter table channel_member enable row level security;
create policy "members read their own channel memberships"
  on channel_member for select
  using (channel_member.profile_id = auth.uid());

alter table channel enable row level security;
create policy "members read channels they belong to"
  on channel for select
  using (exists (
    select 1 from channel_member cm
    where cm.channel_id = channel.id and cm.profile_id = auth.uid()));

alter table message enable row level security;
create policy "members read messages of channels they belong to"
  on message for select
  using (exists (
    select 1 from channel_member cm
    where cm.channel_id = message.channel_id and cm.profile_id = auth.uid()));

grant select on channel, channel_member, message to authenticated;

-- Realtime Postgres Changes autoriza cada evento contra la política de arriba, por suscriptor.
alter publication supabase_realtime add table message;
```

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/auth/guard.ts` → `findMembership`, `findOwnerMembership`, `resolveSection`, `requireSection`, `getSessionAccessToken` | 404 nunca 403 |
| repo | `area`, `seat` (con `parent_seat_id`, `position`, `holder_profile_id`) | Accountability Chart sin cambio |
| `02-oficina` | `generateStructured` con `purpose: "agente" \| "reporte"`, `category: "agente"`; tope diario | Ver epic 02 |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `server/agents/tareas.ts` → `TAREAS`, `Tarea` | `["heartbeat", "encargos", "reporte", "agenda", "google", "butacas"] as const` — sin imports | runtime, ruta, `apps/agentes/tests/schedule.test.ts` |
| `server/agents/runtime.ts` → `runTarea`, `isAuthorizedBearer`, `workerStatus` | `runTarea(tarea: Tarea, now: Date, deps?: { provider? }): Promise<{ procesadas: number }>` · `workerStatus(now, worker = "agentes"): Promise<{ seenAt: Date \| null; stale: boolean }>` (`stale` = sin fila o más de 3 min) | `05` (agenda, google), `06` (butacas) |
| `app/api/agentes/[tarea]/route.ts` | `POST`, `Authorization: Bearer $AGENTS_API_SECRET` → 401 / 404 (tarea desconocida) / 200 `{ ok: true, data: { procesadas } }` | `apps/agentes` |
| `server/channels/channels.ts` → `postAgentMessage`, `ensureAgentChannel` | internas: no actúan en nombre de nadie | runtime |
| `server/permissions/sections.ts` | `canal` en `SECTION_SLUGS` y en `OFICINAS_SLUGS` | `04` |

## Conventions that bite in this area

- **El worker no ejecuta nada.** Marca el ritmo y llama la ruta; todo lo que hace una tarea vive en
  `runtime.ts`, con el cliente `db` y el gateway del servidor. Si un encargo pasara del tiempo máximo de una
  función de Vercel, se reconsidera (§20.3), no se mueve a escondidas al worker.
- **`apps/agentes` corre TypeScript sin compilar** (`node src/main.ts`): solo sintaxis borrable, imports con
  `.ts`, `import type`, sin `enum`/`namespace`/propiedades de parámetro, y **cero** imports de `packages/*`
  (Node no quita tipos dentro de `node_modules`). El JSON se importa con `with { type: "json" }`.
- **Contrato de tareas en dos archivos:** `TAREAS` (`tareas.ts`) y `TAREAS_WORKER` (`schedule.ts`) son el
  mismo conjunto; la prueba del worker lo comprueba importando `tareas.ts` por ruta relativa.
- **Realtime bajo RLS.** `ChannelLive.tsx` se suscribe con el JWT del usuario (`realtime.setAuth`); los
  borrados son suaves porque los eventos DELETE no se filtran por RLS.
- **Dos puertas, import con `.ts`, resultados tipados, `--custom` solo para RLS, `grep` de uuid** — como en
  todo el repo.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/oficinas-digitales.md`,
`.claude/rules/ia-gateway.md`, `.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`.

---

## Tasks

### `E3-T1` — Esquema de agentes, encargos y latido del worker

**Depends on:** `E2-T1` · **Priority:** p0 · **Step:** 15

1. `packages/db/src/schema.ts`:
   - `AGENT_KINDS = ["manager", "especialista", "recepcion"] as const`,
     `AGENT_TASK_STATUSES = ["recibido", "asignado", "en_proceso", "hecho", "fallido"] as const`.
   - `agent`: `id`, `org_id` (cascade), `kind` (`AGENT_KINDS`, not null), `area_id` (→ area, cascade, null),
     `owner_profile_id` (→ profile, cascade, not null: el dueño para `manager` y `recepcion`, el jefe del área
     para `especialista`), `name` text not null, `instructions` text not null default `''`, `skills` jsonb not
     null default `[]`, `last_report_on` date null, `created_at`, `updated_at`. Checks `agent_kind_check`,
     `agent_area_kind_check` (`(kind = 'especialista') = (area_id is not null)`). Únicos parciales
     `uq_agent_org_manager` (`org_id`) where `kind = 'manager'`, `uq_agent_org_recepcion` (`org_id`) where
     `kind = 'recepcion'`, `uq_agent_area` (`area_id`) where `kind = 'especialista'`.
   - `agent_task`: `id`, `org_id` (cascade), `agent_id` (→ agent, set null), `requested_by` (→ profile, set
     null), `area_id` (→ area, set null), `body` text not null, `status` (`AGENT_TASK_STATUSES`, default
     `"recibido"`), `attempts` integer not null default 0, `locked_until` timestamptz null, `result` text null,
     `created_at`, `updated_at`. Checks `agent_task_status_check`, `agent_task_attempts_range` (0-3),
     `agent_task_body_length` (1-2000). Índice `idx_agent_task_status_lock` (`status`, `locked_until`).
   - `worker_heartbeat`: `worker` text primary key, `seen_at` timestamptz not null default now.
2. `pnpm db:generate`.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=agentes_rls` y pega, completo, el
   SQL de §4 *Migración `agentes_rls`*.
4. `apps/improvement/tests/agentes-schema.test.ts` con el patrón `asUser()`.
5. **Aprobación obligatoria.** Muestra los dos SQL a Jose Carlos y espera un "sí" explícito. Sin "sí", detente.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts`
- `packages/db/migrations/**`
- `apps/improvement/tests/agentes-schema.test.ts`

**Acceptance**
1. **WHEN** se inserta un segundo `agent` `manager` para el mismo org, o un `especialista` sin `area_id` **THE SYSTEM SHALL** rechazar cada insert en la base.
2. **WHEN** se inserta un `agent_task` con `attempts` 4 o con `status` `perdido` **THE SYSTEM SHALL** rechazarlo.
3. **WHEN** quien pidió un encargo consulta `agent_task` como `authenticated` **THE SYSTEM SHALL** ver su encargo, y **WHEN** otro empleado del org consulta **THE SYSTEM SHALL** devolver 0 filas.
4. **WHEN** un empleado consulta `agent` o `worker_heartbeat` como `authenticated` **THE SYSTEM SHALL** devolver 0 filas, y **WHEN** consulta el dueño `agent` **THE SYSTEM SHALL** ver los agentes de su org.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**
```bash
grep -q 'create policy "requesters and owners read encargos"' packages/db/migrations/*.sql
pnpm --filter improvement test tests/agentes-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/agentes-schema.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T1 (step 15): esquema agent, agent_task y worker_heartbeat con RLS"
git tag step-15-od-agentes-esquema
git ls-files --error-unmatch apps/improvement/tests/agentes-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E3-T2` — Esquema del canal con borrado suave y Realtime

**Depends on:** `E3-T1` · **Priority:** p0 · **Step:** 16

1. `packages/db/src/schema.ts`:
   - `CHANNEL_KINDS = ["general", "area", "directo", "agente"] as const`.
   - `channel`: `id`, `org_id` (cascade), `kind` (not null), `area_id` (→ area, cascade, null), `agent_id`
     (→ agent, cascade, null), `profile_id` (→ profile, cascade, null), `name` text not null, `created_at`.
     Checks `channel_kind_check`, `channel_agent_kind_check`
     (`(kind = 'agente') = (agent_id is not null and profile_id is not null)`). Únicos parciales
     `uq_channel_org_general` (`org_id`) where `kind = 'general'` y `uq_channel_agent_profile`
     (`agent_id`, `profile_id`) where `kind = 'agente'`.
   - `channel_member`: `id`, `channel_id` (cascade), `profile_id` (→ profile, cascade), `joined_at`;
     `uniqueIndex("uq_channel_member")` (`channel_id`, `profile_id`).
   - `message`: `id`, `org_id` (cascade), `channel_id` (cascade), `author_profile_id` (→ profile, cascade,
     null), `author_agent_id` (→ agent, cascade, null), `body` text not null, `deleted_at` timestamptz null,
     `created_at`. Checks `message_one_author_check` (`num_nonnulls(author_profile_id, author_agent_id) = 1`),
     `message_deleted_blank_check` (`deleted_at is null or body = ''`), `message_body_length`
     (`char_length(body) <= 4000`). Índice `idx_message_channel_created` (`channel_id`, `created_at`).
   - `agent_task` gana `channel_id` (→ channel, set null).
2. `pnpm db:generate`.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=canal_rls` y pega, completo, el SQL
   de §4 *Migración `canal_rls`* (incluye `alter publication supabase_realtime add table message;`).
4. `apps/improvement/tests/canal-schema.test.ts` con el patrón `asUser()`.
5. **Aprobación obligatoria.** Muestra los dos SQL a Jose Carlos y espera un "sí" explícito. Sin "sí", detente.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts`
- `packages/db/migrations/**`
- `apps/improvement/tests/canal-schema.test.ts`

**Acceptance**
1. **WHEN** se inserta un `message` con los dos autores o con ninguno **THE SYSTEM SHALL** rechazar el insert en la base.
2. **WHEN** se marca `deleted_at` en un `message` sin vaciar `body` **THE SYSTEM SHALL** rechazar el update, y **WHEN** se vacía `body` en el mismo update **THE SYSTEM SHALL** aceptarlo.
3. **WHEN** un miembro del canal consulta `message` como `authenticated` **THE SYSTEM SHALL** ver los mensajes del canal, y **WHEN** consulta un empleado del mismo org que no es miembro **THE SYSTEM SHALL** devolver 0 filas.
4. **WHEN** se consulta `pg_publication_tables` **THE SYSTEM SHALL** listar `message` en la publicación `supabase_realtime`.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**
```bash
grep -q 'alter publication supabase_realtime add table message;' packages/db/migrations/*.sql
pnpm --filter improvement test tests/canal-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/canal-schema.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T2 (step 16): esquema channel, channel_member y message con RLS y Realtime"
git tag step-16-od-canal-esquema
git ls-files --error-unmatch apps/improvement/tests/canal-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E3-T3` — Agentes por org: manager, recepción y un especialista por jefe

**Depends on:** `E3-T2` · **Priority:** p0 · **Step:** 17

1. `apps/improvement/server/agents/heads.ts` (puro): `areaHeads(seats)` con `seats: { id, areaId, parentSeatId, holderProfileId, position, title }[]`
   devuelve `Map<areaId, profileId>`. **Jefe de área** = quien ocupa el **asiento superior** del área: entre
   los `seat` con ese `area_id`, los que no tienen padre o cuyo padre es de otra área (o de ninguna); de esos,
   el de menor `position` y después menor `title`. Si ese asiento no tiene `holder_profile_id`, el área no
   tiene jefe y no lleva especialista.
2. `apps/improvement/server/agents/agents.ts`:
   - `ensureAgents(userId, orgId)` — `findOwnerMembership` (si no, `NOT_FOUND`). En una transacción: crea
     si falta el `manager` (`name` "Improvement", `owner_profile_id` = dueño) y la `recepcion` ("Recepción");
     por cada área con jefe, crea o actualiza su `especialista` ("Especialista de <área>", `owner_profile_id`
     = jefe); borra el especialista de un área que ya no tiene jefe; crea el canal `general` si falta y agrega
     como `channel_member` a toda membresía del org que falte. Idempotente.
   - `listAgents(userId, orgId)` (dueño) y `updateAgent(userId, orgId, agentId, input)` (dueño; `instructions`
     ≤ 4000, `skills` arreglo de hasta 20 cadenas de 1-60, validado con `zod`).
3. `apps/improvement/tests/agents.test.ts`.

**Files**
- `apps/improvement/server/agents/heads.ts`
- `apps/improvement/server/agents/agents.ts`
- `apps/improvement/tests/agents.test.ts`

**Acceptance**
1. **WHEN** `areaHeads` recibe un área cuyo asiento raíz tiene titular y un asiento hijo de la misma área **THE SYSTEM SHALL** devolver como jefe al titular del asiento raíz.
2. **WHEN** el asiento superior de un área no tiene titular **THE SYSTEM SHALL** no devolver jefe para esa área.
3. **WHEN** el dueño corre `ensureAgents` dos veces en un org con dos áreas con jefe **THE SYSTEM SHALL** dejar exactamente 1 `manager`, 1 `recepcion`, 2 `especialista` y 1 canal `general` con todos los miembros.
4. **WHEN** el jefe de un área deja su asiento y se corre `ensureAgents` **THE SYSTEM SHALL** borrar el especialista de esa área.
5. **WHEN** un empleado llama `ensureAgents` o `updateAgent` **THE SYSTEM SHALL** devolver `NOT_FOUND` sin escribir.

**Verify**
```bash
pnpm --filter improvement test tests/agents.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/agents || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/agents/heads.ts apps/improvement/server/agents/agents.ts apps/improvement/tests/agents.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T3 (step 17): agentes por org con especialista por jefe de área"
git tag step-17-od-agentes
git ls-files --error-unmatch apps/improvement/server/agents/agents.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E3-T4` — Canal: publicar, listar y borrar suave

**Depends on:** `E3-T2` · **Priority:** p0 · **Step:** 18

`apps/improvement/server/channels/channels.ts`:
1. `listChannels(userId, orgId)`: membresía del org primero; solo canales donde el usuario es `channel_member`.
2. `listMessages(userId, orgId, channelId, { before?, limit = 50 })`: el usuario debe ser miembro del canal
   (si no, `NOT_FOUND`); orden cronológico; un mensaje borrado sale con `deleted: true` y `body` vacío.
3. `postMessage(userId, orgId, channelId, body)`: miembro; `body` recortado de 1-4000 (`VALIDATION_ERROR`).
4. `deleteMessage(userId, orgId, messageId)`: el autor o el dueño del org; `update` con `body = ''` y
   `deleted_at = now()` — **nunca** `delete` (Realtime no filtra DELETE por RLS).
5. Internas, sin usuario (solo las llaman `server/agents/**`, documentado en su comentario):
   `postAgentMessage(agentId, channelId, body)` y `ensureAgentChannel(agentId, profileId)` (canal `agente`
   del par, con el perfil como único `channel_member`; idempotente por `uq_channel_agent_profile`).
6. `apps/improvement/tests/channels.test.ts`.

**Files**
- `apps/improvement/server/channels/channels.ts`
- `apps/improvement/tests/channels.test.ts`

**Acceptance**
1. **WHEN** un miembro publica y luego lista **THE SYSTEM SHALL** devolver su mensaje con su autor.
2. **WHEN** un empleado del org que no es miembro del canal lista o publica **THE SYSTEM SHALL** devolver `NOT_FOUND` sin escribir.
3. **WHEN** el autor borra su mensaje **THE SYSTEM SHALL** conservar la fila con `deleted_at` y `body` vacío, y **WHEN** otro empleado intenta borrarlo **THE SYSTEM SHALL** devolver `NOT_FOUND`.
4. **WHEN** `ensureAgentChannel` corre dos veces para el mismo agente y perfil **THE SYSTEM SHALL** dejar un solo canal `agente` con ese perfil como único miembro.

**Verify**
```bash
pnpm --filter improvement test tests/channels.test.ts
status=0; grep -n 'delete(message)' apps/improvement/server/channels/channels.ts || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/channels/channels.ts apps/improvement/tests/channels.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T4 (step 18): motor del canal con borrado suave"
git tag step-18-od-canal
git ls-files --error-unmatch apps/improvement/server/channels/channels.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E3-T5` — Recepción de encargos y su ruteo

**Depends on:** `E3-T3`, `E3-T4` · **Priority:** p0 · **Step:** 19

`apps/improvement/server/agents/tasks.ts`:
1. `routeEncargo(agents, areaId)` (puro): el `especialista` de `areaId` si existe; si no, el `manager`; si no
   hay `manager`, `null`.
2. `createEncargo(userId, orgId, input)`: membresía del org; `input` con `zod` (`body` 1-2000, `areaId`
   opcional y del mismo org). Sin `manager` → `{ ok: false, error: { code: "NOT_READY", message: "El dueño aún no activa los agentes." } }`.
   En una transacción: `ensureAgentChannel(agente, userId)`; inserta `agent_task` en `asignado` con
   `agent_id`, `requested_by`, `area_id`, `channel_id`; publica el `body` como mensaje del usuario y un
   mensaje de la `recepcion`: `Recibido. Lo atiende <nombre del agente>.` Devuelve el id.
3. `listEncargos(userId, orgId)`: los propios; el dueño ve todos los del org.
4. `apps/improvement/tests/agent-tasks.test.ts`.

**Files**
- `apps/improvement/server/agents/tasks.ts`
- `apps/improvement/tests/agent-tasks.test.ts`

**Acceptance**
1. **WHEN** un empleado pide un encargo con el `areaId` de un área con especialista **THE SYSTEM SHALL** asignarlo a ese especialista en estado `asignado`.
2. **WHEN** el encargo no trae `areaId` o el área no tiene especialista **THE SYSTEM SHALL** asignarlo al `manager`.
3. **WHEN** se crea un encargo **THE SYSTEM SHALL** publicar en su canal `agente` el mensaje del usuario y el de la recepción `Recibido. Lo atiende` seguido del nombre del agente.
4. **WHEN** el org no tiene `manager` **THE SYSTEM SHALL** devolver `NOT_READY` sin escribir, y **WHEN** un no miembro pide un encargo **THE SYSTEM SHALL** devolver `NOT_FOUND`.

**Verify**
```bash
pnpm --filter improvement test tests/agent-tasks.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/agents/tasks.ts apps/improvement/tests/agent-tasks.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T5 (step 19): recepción única de encargos con ruteo a especialista o manager"
git tag step-19-od-recepcion
git ls-files --error-unmatch apps/improvement/server/agents/tasks.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E3-T6` — Runtime protegido: latido, encargos y reporte matutino

**Depends on:** `E3-T5`, `E2-T3` · **Priority:** p0 · **Step:** 20

1. `server/agents/tareas.ts` (puro, sin imports): `export const TAREAS = ["heartbeat", "encargos", "reporte", "agenda", "google", "butacas"] as const;`
   y `type Tarea`. Es el contrato con el worker (paso 23 lo prueba).
2. `server/ai/prompts/agent.ts`: `buildEncargoSystem(agent, memory)` (instrucciones del agente; para el
   `manager`, además, las últimas 20 respuestas de `owner_memory` del dueño — Improvement es su agente
   personal) y `buildEncargoPrompt(task)`; `REPORT_SYSTEM_PROMPT` y `buildReportPrompt({ hechosAyer, abiertos })`.
3. `server/agents/runtime.ts` — funciones de sistema, no corren en nombre de nadie, y solo las llama la ruta
   de abajo después del bearer:
   - `isAuthorizedBearer(header, secret)`: compara `sha256(header)` con `sha256("Bearer " + secret)` con
     `crypto.timingSafeEqual`; `secret` vacío → `false`.
   - `runTarea(tarea, now, deps?: { provider? })`: `heartbeat` → upsert `worker_heartbeat('agentes', now)`;
     `encargos` → `drainEncargos`: reclama hasta 3 con un solo `update … where id in (select … for update skip locked) returning *`
     (estado `asignado`/`en_proceso`, `locked_until` nulo o vencido, `attempts < 3`) → `en_proceso`,
     `attempts + 1`, `locked_until = now + 5 min`; por cada uno, `generateStructured({ purpose: "agente", category: "agente", schema: z.object({ reply: z.string().min(1).max(4000), done: z.boolean() }) … })`;
     `ok` → `postAgentMessage` en su canal y `hecho` (o `asignado` si `done` es `false`); error → `fallido` con el
     mensaje `No pude completar este encargo.` si ya van 3 intentos, si no de vuelta a `asignado`;
     `reporte` → para hasta 5 orgs cuyo `manager` tiene `last_report_on` anterior a la fecha local
     (America/Mexico_City) y cuando la hora local es 08:00 o después: `generateStructured({ purpose: "reporte", category: "agente" … })`
     con los encargos hechos ayer y los abiertos, lo publica en el canal `general` como el `manager` y fija
     `last_report_on`; `agenda`, `google` y `butacas` → `{ procesadas: 0 }` hasta los pasos 36 y 44.
   - `workerStatus(now, worker = "agentes")`: `{ seenAt, stale }`, `stale` si no hay fila o pasaron más de
     3 minutos.
4. `app/api/agentes/[tarea]/route.ts`: `POST(request, { params }: { params: Promise<{ tarea: string }> })`;
   bearer inválido o `AGENTS_API_SECRET` sin configurar → 401 `{ ok: false, error: { code: "UNAUTHENTICATED" } }`;
   `tarea` fuera de `TAREAS` → 404; si no, 200 `{ ok: true, data }`.
5. `tests/agents-runtime.test.ts`: la ruta con `vi.stubEnv("AGENTS_API_SECRET", …)` (patrón de env de §9: `vi.stubEnv` + `vi.resetModules()` + `await import(…)` del módulo bajo prueba); `runTarea` con proveedor
   falso; `workerStatus` con una clave de worker propia de la prueba.

**Files**
- `apps/improvement/server/agents/tareas.ts`
- `apps/improvement/server/agents/runtime.ts`
- `apps/improvement/server/ai/prompts/agent.ts`
- `apps/improvement/app/api/agentes/[tarea]/route.ts`
- `apps/improvement/tests/agents-runtime.test.ts`

**Acceptance**
1. **WHEN** la ruta `POST /api/agentes/heartbeat` recibe un bearer incorrecto **THE SYSTEM SHALL** responder 401, y **WHEN** recibe el bearer correcto **THE SYSTEM SHALL** responder 200 y actualizar `worker_heartbeat`.
2. **WHEN** la ruta recibe la tarea `inventada` con el bearer correcto **THE SYSTEM SHALL** responder 404.
3. **WHEN** `runTarea("encargos")` corre con un encargo `asignado` y un proveedor falso que responde `done` en `true` **THE SYSTEM SHALL** dejarlo en `hecho` y publicar la respuesta en su canal como el agente.
4. **WHEN** un encargo falla en su tercer intento **THE SYSTEM SHALL** dejarlo en `fallido` y publicar `No pude completar este encargo.`
5. **WHEN** `runTarea("reporte")` corre dos veces el mismo día después de las 08:00 locales **THE SYSTEM SHALL** publicar un solo reporte en el canal `general`.
6. **WHEN** `workerStatus` lee un latido de hace 4 minutos **THE SYSTEM SHALL** devolver `stale` en `true`.

**Verify**
```bash
pnpm --filter improvement test tests/agents-runtime.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/agents || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/agents/tareas.ts apps/improvement/server/agents/runtime.ts apps/improvement/server/ai/prompts/agent.ts ":(literal)apps/improvement/app/api/agentes/[tarea]/route.ts" apps/improvement/tests/agents-runtime.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T6 (step 20): runtime de agentes protegido con bearer"
git tag step-20-od-runtime
git ls-files --error-unmatch ":(literal)apps/improvement/app/api/agentes/[tarea]/route.ts"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E3-T7` — Pantalla del canal con Realtime y aviso del worker caído

**Depends on:** `E3-T6`, `E2-T8` · **Priority:** p1 · **Step:** 21

1. `server/permissions/sections.ts`: `"canal"` al final de `SECTION_SLUGS` (`label: "Canal"`, `hint: "Mensajes del equipo y encargos a los agentes."`, `scopes: ["empresa"]`) y en `OFICINAS_SLUGS`.
2. `app/[org]/canal/page.tsx` (Server Component + Server Actions): `requireSection(org, "canal")`; lista de
   canales (`listChannels`), mensajes del canal elegido (`?c=<id>`, por defecto el `general`) con "Mensaje
   borrado" para los borrados, formulario para publicar, botón "Borrar" en los propios, formulario "Encargar
   a un agente" (texto + `<select>` de área opcional) → `createEncargo`. Solo el dueño: botón "Activar
   agentes" (`ensureAgents`) y, si `workerStatus(new Date()).stale`, un aviso `role="status"`:
   "El trabajador de agentes no responde desde hace más de 3 minutos."
3. `app/[org]/canal/ChannelLive.tsx` (`"use client"`): recibe `channelId`, `accessToken`
   (`getSessionAccessToken()` del servidor), URL y anon key; `createClient(...)`, `realtime.setAuth(accessToken)`,
   `channel(...).on("postgres_changes", { event: "*", schema: "public", table: "message", filter: \`channel_id=eq.${channelId}\` }, () => router.refresh())`;
   se desuscribe al desmontar. RLS decide qué eventos llegan.
4. `tests/e2e/canal.spec.ts` (`serial`): dueño y empleado con `canal = empresa`; el dueño activa agentes.

**Files**
- `apps/improvement/app/[org]/canal/page.tsx`
- `apps/improvement/app/[org]/canal/ChannelLive.tsx`
- `apps/improvement/server/permissions/sections.ts`
- `apps/improvement/tests/e2e/canal.spec.ts`

**Acceptance**
1. **WHEN** el dueño publica en el canal `general` **THE SYSTEM SHALL** mostrar el mensaje en la página abierta del empleado sin recargar en menos de 10 segundos.
2. **WHEN** el autor borra su mensaje **THE SYSTEM SHALL** mostrar "Mensaje borrado" en su lugar.
3. **WHEN** el empleado envía un encargo sin área **THE SYSTEM SHALL** mostrar en su canal `agente` el mensaje `Recibido. Lo atiende Improvement.`
4. **WHEN** un empleado sin permiso de `canal` abre `/[org]/canal` **THE SYSTEM SHALL** responder 404, y **WHEN** AxeBuilder analiza la página del dueño **THE SYSTEM SHALL** reportar 0 violaciones.

**Verify**
```bash
pnpm --filter improvement test:e2e canal.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- ":(literal)apps/improvement/app/[org]/canal/page.tsx" ":(literal)apps/improvement/app/[org]/canal/ChannelLive.tsx" apps/improvement/server/permissions/sections.ts apps/improvement/tests/e2e/canal.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T7 (step 21): pantalla del canal con Realtime y encargos"
git tag step-21-od-pantalla-canal
git ls-files --error-unmatch ":(literal)apps/improvement/app/[org]/canal/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E3-T8` — Worker de agentes: paquete y punto de entrada

**Depends on:** `E3-T6` · **Priority:** p0 · **Step:** 22

`apps/agentes` es un worker delgado de Node 24 que corre su TypeScript **sin compilar** (`node src/main.ts`,
type stripping). Solo sintaxis borrable: imports relativos con `.ts`, `import type` para tipos, sin `enum`
ni `namespace` ni propiedades de parámetro. No importa nada de otro paquete del monorepo (Node no quita tipos
dentro de `node_modules`). No tiene credenciales de base ni llave de Anthropic.

1. Copia los tres configs de §19.6 (solo-si-falta, cada línea sale 0 en una segunda corrida):
   ```bash
   mkdir -p apps/agentes/src
   test -e apps/agentes/package.json || cp blueprints/oficinas-digitales/workspace/apps/agentes/package.json apps/agentes/package.json
   test -e apps/agentes/tsconfig.json || cp blueprints/oficinas-digitales/workspace/apps/agentes/tsconfig.json apps/agentes/tsconfig.json
   test -e apps/agentes/vitest.config.ts || cp blueprints/oficinas-digitales/workspace/apps/agentes/vitest.config.ts apps/agentes/vitest.config.ts
   ```
2. `apps/agentes/src/main.ts`: `import pkg from "../package.json" with { type: "json" };` y, si
   `process.argv.includes("--version")`, imprime `pkg.version` y sale 0. (El ciclo del worker llega en el
   paso 23.)
3. `pnpm install` (sin `--frozen-lockfile`: el paquete nuevo agrega un importer al lockfile; sus
   devDependencies ya están en `pnpm-lock.yaml`, ninguna versión nueva). `pnpm-workspace.yaml` ya incluye
   `apps/*`.

**Files**
- `apps/agentes/package.json`
- `apps/agentes/tsconfig.json`
- `apps/agentes/vitest.config.ts`
- `apps/agentes/src/main.ts`
- `pnpm-lock.yaml`

**Acceptance**
1. **WHEN** `node apps/agentes/src/main.ts --version` corre desde la raíz **THE SYSTEM SHALL** salir 0 e imprimir `0.1.0`, la `version` de `apps/agentes/package.json`.
2. **WHEN** `pnpm install --frozen-lockfile` corre después de este paso **THE SYSTEM SHALL** salir 0.
3. **WHEN** `pnpm --filter @jotapuntoce/agentes typecheck` corre **THE SYSTEM SHALL** salir 0 con `erasableSyntaxOnly` y `verbatimModuleSyntax` activos.
4. **WHEN** `pnpm lint` corre **THE SYSTEM SHALL** incluir `apps/agentes` con el config raíz y salir 0.

**Verify**
```bash
test "$(node apps/agentes/src/main.ts --version)" = 0.1.0
pnpm install --frozen-lockfile
pnpm --filter @jotapuntoce/agentes typecheck
grep -q '"erasableSyntaxOnly": true' apps/agentes/tsconfig.json
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/agentes/package.json apps/agentes/tsconfig.json apps/agentes/vitest.config.ts apps/agentes/src/main.ts pnpm-lock.yaml blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T8 (step 22): paquete @jotapuntoce/agentes con punto de entrada ejecutable"
git tag step-22-od-worker
git ls-files --error-unmatch apps/agentes/src/main.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E3-T9` — Worker: cadencia, cliente y unidad systemd

**Depends on:** `E3-T8` · **Priority:** p0 · **Step:** 23

1. `apps/agentes/src/schedule.ts` (puro): `TAREAS_WORKER = ["heartbeat", "encargos", "reporte", "agenda", "google", "butacas"] as const`
   y `tareasDue(now: Date)`: cada minuto `heartbeat`, `encargos` y `butacas`; `google` si
   `now.getUTCMinutes() % 5 === 0`; `agenda` y `reporte` si `% 15 === 0` (el servidor decide si ya toca el
   reporte del día). Orden fijo: el de `TAREAS_WORKER`.
2. `apps/agentes/src/client.ts`: `readConfig(env)` → `{ ok: true, baseUrl, secret }` o
   `{ ok: false, missing: string[] }` con `IMPROVEMENT_API_URL` y `AGENTS_API_SECRET`;
   `callTarea(config, tarea, fetchImpl = fetch)` → `POST ${baseUrl}/api/agentes/${tarea}` con
   `Authorization: Bearer <secret>` y `signal: AbortSignal.timeout(55_000)`; devuelve `{ tarea, ok, status }`
   y **nunca lanza** (un error de red es `ok: false, status: 0`).
3. `apps/agentes/src/main.ts`: conserva `--version`; si no, `try { process.loadEnvFile(".env.local") } catch {}`,
   `readConfig(process.env)` (faltan → `console.error` con los nombres y `process.exit(1)`), un `tick()` que
   llama en serie las `tareasDue(new Date())` y escribe una línea JSON por llamada, `tick()` inmediato y
   `setInterval(tick, 60_000)`; `SIGTERM`/`SIGINT` → `clearInterval` y salida 0.
4. `apps/agentes/tests/schedule.test.ts`: importa `TAREAS` de `../../improvement/server/agents/tareas.ts` y
   exige el mismo conjunto que `TAREAS_WORKER` (el contrato entre los dos artefactos, en el primer paso donde
   existen los dos); `tareasDue` a las 10:00Z y 10:07Z; `callTarea` con `fetch` falso (URL, método, header) y
   con un `fetch` que rechaza.
5. Copia la unidad de §19.6:
   `test -e apps/agentes/deploy/agentes.service || { mkdir -p apps/agentes/deploy && cp blueprints/oficinas-digitales/workspace/apps/agentes/deploy/agentes.service apps/agentes/deploy/agentes.service; }`

**Files**
- `apps/agentes/src/schedule.ts`
- `apps/agentes/src/client.ts`
- `apps/agentes/src/main.ts`
- `apps/agentes/tests/schedule.test.ts`
- `apps/agentes/deploy/agentes.service`

**Acceptance**
1. **WHEN** `tareasDue` recibe `2026-11-18T10:00:00Z` **THE SYSTEM SHALL** devolver las 6 tareas, y **WHEN** recibe `2026-11-18T10:07:00Z` **THE SYSTEM SHALL** devolver solo `heartbeat`, `encargos` y `butacas`.
2. **WHEN** se compara `TAREAS_WORKER` con `TAREAS` de `apps/improvement/server/agents/tareas.ts` **THE SYSTEM SHALL** tener exactamente el mismo conjunto.
3. **WHEN** `callTarea` corre con un `fetch` falso **THE SYSTEM SHALL** hacer `POST` a `<baseUrl>/api/agentes/<tarea>` con `Authorization: Bearer <secret>`, y **WHEN** el `fetch` rechaza **THE SYSTEM SHALL** devolver `ok` en `false` sin lanzar.
4. **WHEN** `readConfig` recibe un entorno sin `AGENTS_API_SECRET` **THE SYSTEM SHALL** devolver `ok` en `false` con `AGENTS_API_SECRET` en `missing`.
5. **WHEN** se lee `apps/agentes/deploy/agentes.service` **THE SYSTEM SHALL** tener `ExecStart=/usr/bin/node src/main.ts` y `Restart=always`.

**Verify**
```bash
pnpm --filter @jotapuntoce/agentes test
test "$(node apps/agentes/src/main.ts --version)" = 0.1.0
grep -qx 'ExecStart=/usr/bin/node src/main.ts' apps/agentes/deploy/agentes.service
grep -qx 'Restart=always' apps/agentes/deploy/agentes.service
pnpm --filter @jotapuntoce/agentes typecheck
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/agentes/src/schedule.ts apps/agentes/src/client.ts apps/agentes/src/main.ts apps/agentes/tests/schedule.test.ts apps/agentes/deploy/agentes.service blueprints/oficinas-digitales/tasks.json
git commit -m "E3-T9 (step 23): ciclo del worker, cliente HTTP y unidad systemd"
git tag step-23-od-worker-ciclo
git ls-files --error-unmatch apps/agentes/deploy/agentes.service   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e canal.spec.ts` corre completo **THE SYSTEM SHALL** salir con código 0, con `/[org]/canal` auditada por axe sin violaciones.
2. **WHEN** `node apps/agentes/src/main.ts --version` corre desde la raíz **THE SYSTEM SHALL** salir 0 e imprimir `0.1.0`.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e canal.spec.ts
test "$(node apps/agentes/src/main.ts --version)" = 0.1.0
```

## Pitfalls

- **Darle al worker `DATABASE_URL` o `ANTHROPIC_API_KEY`** — nunca; solo `IMPROVEMENT_API_URL` y `AGENTS_API_SECRET`.
- **Importar `@jotapuntoce/db` (o cualquier paquete) desde `apps/agentes`** — Node no quita tipos bajo `node_modules` y el worker deja de arrancar.
- **Comparar el bearer con `===`** — `isAuthorizedBearer` compara hashes sha256 con `timingSafeEqual`.
- **Borrar filas de `message`** — siempre `deleted_at` + `body = ''`; el `Verify` de E3-T4 busca un `delete(message)`.
- **Políticas recursivas en `channel_member`** — la política es "mis propias filas"; la de `channel` y `message` consulta `channel_member` sin volver a sí misma.
- **`pnpm install --frozen-lockfile` en E3-T8 antes de instalar** — el importer nuevo cambia el lockfile: primero `pnpm install`, después el `--frozen-lockfile` del `Verify`.
- **Si `pnpm lint` en `apps/agentes` imprime "Pages directory cannot be found"** — es un aviso de consola de `eslint-config-next` en un paquete sin Next, no un problema de ESLint; el resumen de ESLint debe decir 0 problemas.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-od-*'` los lista (9 de este epic; 46 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Las migraciones de E3-T1 y E3-T2 se aplicaron solo después de un "sí" explícito de Jose Carlos.
