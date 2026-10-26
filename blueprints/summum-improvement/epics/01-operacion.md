# Epic 01: Operación: Proyectos/obra, CRM con ventas y Postventa

> Al terminar, Improvement autoriza proyectos y mide su avance por etapas, lleva tratos y la hiperpersonalización de cada cliente con sugerencia de atención por IA, atiende postventa, y el panel de Indicadores tiene cinco fuentes nuevas.

| | |
|---|---|
| **Epic id** | `01-operacion` |
| **Tasks** | `E1-T1` … `E1-T10` |
| **Depends on** | nothing — start here |
| **Unlocks** | `02-movimiento-afiliadas-sello`, `05-personas-lealtad` |
| **Parallel with** | nada: los epics siguientes editan `packages/db/src/schema.ts` en cadena |

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
CLAUDE.md, AGENTS.md, .claude/settings.json      # fusionados y commiteados por el Bootstrap — read-only
.claude/rules/summum-improvement.md              # NUEVO (Bootstrap) — read-only
packages/db/
  src/schema.ts                                  # exists, you will edit it (E1-T1, E1-T5, E1-T9)
  migrations/                                    # lo que emiten db:generate y --custom (proyectos_rls, crm_rls, postventa_rls)
apps/improvement/
  server/
    auth/guard.ts                                # exists, read-only
    projects/mutations.ts                        # exists, read-only (STATUS_LABEL, listProjects)
    erp/projects.ts                              # NEW (E1-T2)
    erp/tickets.ts                               # NEW (E1-T9)
    crm/deals.ts, crm/preferences.ts             # NEW (E1-T6)
    crm/attention.ts                             # NEW (E1-T7)
    ai/gateway.ts                                # exists, you will edit it (E1-T7: + generateStructured)
    ai/prompts/attention.ts                      # NEW (E1-T7)
    kpis/sources.ts                              # exists, you will edit it (E1-T3, E1-T6, E1-T10)
    permissions/sections.ts                      # exists, you will edit it (E1-T4, E1-T9)
  app/[org]/
    proyectos/page.tsx                           # NEW (E1-T4)
    postventa/page.tsx                           # NEW (E1-T10)
    clientes/page.tsx                            # exists, you will edit it (E1-T8: enlaces)
    clientes/pipeline/page.tsx                   # NEW (E1-T8)
    clientes/[clienteId]/page.tsx                # NEW (E1-T8)
  tests/
    proyectos-schema, erp-projects, kpi-erp, erp-sections, crm-schema, crm, crm-attention,
    postventa, kpi-postventa (.test.ts)          # NEW
    direccion-permissions.test.ts                # exists, you will edit ONE assertion (E1-T4)
    e2e/erp.spec.ts                              # NEW (E1-T4), grows in E1-T8 and E1-T10
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `project` (existente) | + `authorization_status` (`pendiente`\|`autorizado`\|`rechazado`, default `pendiente`), `authorized_by`, `authorized_at`, `owner_profile_id` | Los proyectos que ya existían pasan a `autorizado` en `proyectos_rls` |
| `project_stage` | `org_id`, `project_id` (cascade), `name`, `position`, `weight` 1-100, `progress` 0-100, `status` | RLS: miembros del org |
| `client_preference` | `org_id`, `client_id` (unique), `answers` jsonb, `unmet_note`, `unmet_flagged_at`, `updated_by` | RLS: dueño o `clientes: empresa` |
| `deal` | `org_id`, `client_id`, `title`, `amount_cents` bigint ≥0, `currency`, `stage` (`DEAL_STAGES`), `owner_profile_id`, `closed_at` | Cerrado ⇔ `ganado`/`perdido` |
| `ticket` | `org_id`, `client_id`, `project_id`, `title`, `detail`, `severity` 1-3, `status`, `opened_at`, `resolved_at`, `satisfaction` 1-5 | RLS: dueño o `postventa: empresa` |
| `org_kpi` (existente) | check `source` + `proyectos`, `pendientes`, `ventas`, `postventa` | Semántica igual |
| `ai_suggestion` (existente) | check `category` + `siguiente_movimiento` | La usa el epic 02 |

Columnas completas, checks e índices: en el **Do** de cada tarea de esquema y en el apéndice de abajo,
copiado literal de `blueprint.md` §4 (incluye el SQL de RLS que cada tarea pega en su archivo `--custom`).

### Apéndice de esquema (copia de blueprint.md §4)

#### §4 · Migración `proyectos_rls`

```sql
-- RLS de project_stage (blueprint summum-improvement §4). Mismo criterio que 0020 para project: lo
-- lee cualquier miembro del org; lo que no cruza es la empresa de al lado.
alter table project_stage enable row level security;
create policy "members read their org's project stages"
  on project_stage for select
  using (exists (
    select 1 from membership m
    where m.org_id = project_stage.org_id
      and m.user_id = auth.uid()
  ));
grant select on project_stage to authenticated;

-- Los proyectos que ya existían no conocían la autorización: quedan como el dueño ya los veía
-- (autorizados). Los que se den de alta después nacen 'pendiente' por el default de la columna.
update project
  set authorization_status = 'autorizado', authorized_at = created_at
  where authorization_status = 'pendiente' and authorized_at is null;
```

#### §4 · Migración `crm_rls`

```sql
-- RLS del CRM. Mismo criterio que 0016 para client: dueño o tipo de permiso con clientes = empresa.
alter table client_preference enable row level security;
create policy "members read client preferences their permission type allows"
  on client_preference for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = client_preference.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')
  ));

alter table deal enable row level security;
create policy "members read deals their permission type allows"
  on deal for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = deal.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')
  ));

grant select on client_preference, deal to authenticated;
```

#### §4 · Migración `postventa_rls`

```sql
-- RLS de ticket: dueño o tipo de permiso con postventa = empresa.
alter table ticket enable row level security;
create policy "members read tickets their permission type allows"
  on ticket for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = ticket.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'postventa' = 'empresa')
  ));
grant select on ticket to authenticated;
```

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/auth/guard.ts` → `assertMembership`, `findOwnerMembership`, `resolveSection`, `requireSection` | 404 nunca 403; `resolveSection` devuelve `ninguno` sin lanzar |
| repo | `server/kpis/sources.ts` → `KPI_SOURCES`, `computeKpiValues`, `kpiSource` | Agregar una fuente = una entrada + su valor en el check |
| repo | `server/ai/gateway.ts` → `SuggestionProvider`, `MODEL_ID`, `ProviderRateLimitError` | Único import de `@anthropic-ai/sdk` |
| repo | `server/employees/teammates.ts` → `listTeammates` | Sin `responsibility_level` |
| repo | `@jotapuntoce/db/test-fixtures` → `createTestAuthUser`, `deleteTestAuthUser`, `signInTestUser` | Usuarios reales para e2e |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `server/erp/projects.ts` → `stageWeightedProgress`, `loadProjectBoard`, `authorizeProject` … | ver E1-T2 | E1-T4 |
| `server/crm/deals.ts` → `mxMonthStart`, `listPipeline`, `createDeal`, `moveDeal` | ver E1-T6 | E1-T7, E1-T8, `05` (KPI de retorno) |
| `server/crm/preferences.ts` → `HIPER_QUESTIONS` | seis `{ key, question }` | E1-T7, E1-T8 |
| `server/ai/gateway.ts` → `generateStructured` | `<T>(args: { orgId; purpose; category; system; prompt; schema; toText; basedOn; provider? }) => Promise<StructuredResult<T>>` | `02` (siguiente movimiento) |
| `packages/db/src/schema.ts` → `PROJECT_AUTHORIZATION`, `STAGE_STATUSES`, `DEAL_STAGES`, `TICKET_STATUSES`, `projectStage`, `clientPreference`, `deal`, `ticket` | tablas Drizzle / `as const` | `02`, `05` |
| `server/permissions/sections.ts` | `proyectos` y `postventa` al final de `SECTION_SLUGS` | todos |

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
- **`org_kpi` solo crece por su vía.** Una fuente nueva es una entrada en `KPI_SOURCES` + su valor en
  `org_kpi_source_check`. Nunca otra tabla de indicadores ni otra semántica.
- **Un solo import del SDK de IA.** `generateStructured` vive en `gateway.ts`; los prompts en `server/ai/prompts/`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/summum-improvement.md`,
`.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`, `.claude/rules/ia-gateway.md`.
All sit in the project root.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick.

### `E1-T1` — Agregar el esquema de Proyectos/obra con su RLS

**Depends on:** nothing · **Priority:** p0 — metadata for scope cuts, not a running order

El Bootstrap (§10) ya cambió a la rama `summum-improvement` (cortada de `direccion-jaime`), instaló
dependencias, fusionó `workspace/` y commiteó el bundle. Antes de tocar nada corre `pnpm lint`,
`pnpm typecheck` y `pnpm test`: si alguno sale distinto de 0, detente y reporta qué paquete falla (puede
ser WIP de `apps/admin/`, que no es de este cambio y no se arregla aquí).

1. `packages/db/src/schema.ts`:
   - Constantes nuevas junto a las de Dirección: `PROJECT_AUTHORIZATION = ["pendiente", "autorizado", "rechazado"] as const`
     y `STAGE_STATUSES = ["pendiente", "en_curso", "terminada"] as const`.
   - En `project`, después de `dueAt`: `authorizationStatus` (`text("authorization_status", { enum: PROJECT_AUTHORIZATION })`,
     not null, default `"pendiente"`), `authorizedBy` (uuid → `profile.id`, on delete set null), `authorizedAt`
     (timestamptz, null), `ownerProfileId` (uuid → `profile.id`, on delete set null). En su arreglo: check
     `project_authorization_check` (`authorization_status in ('pendiente','autorizado','rechazado')`) e índice
     `idx_project_org_authorization` (`org_id`, `authorization_status`).
   - Tabla `project_stage`: `id`, `org_id` (→ organization, cascade, not null), `project_id` (→ project, cascade,
     not null), `name` text not null, `position` integer not null default 0, `weight` integer not null default 1,
     `progress` integer not null default 0, `status` (`STAGE_STATUSES`, default `"pendiente"`), `created_at`,
     `updated_at`. Checks `project_stage_weight_range` (1-100), `project_stage_progress_range` (0-100),
     `project_stage_status_check`; índice `idx_project_stage_project_position` (`project_id`, `position`).
   - `org_kpi_source_check`: agrega `'proyectos','pendientes'` al final de la lista.
2. `pnpm db:generate` — la migración de esquema; el nombre lo pone `drizzle-kit` y no se edita.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=proyectos_rls` y pega en el
   archivo `*_proyectos_rls.sql` que crea el SQL de §4 *Migración `proyectos_rls`*, completo (incluye el
   `update` que marca `autorizado` a los proyectos que ya existían).
4. `apps/improvement/tests/proyectos-schema.test.ts` con el patrón `asUser()` de `tests/muelle-schema.test.ts`
   (cada prueba crea su org y sus profiles y los borra en `afterEach`, primero el org).
5. **Aprobación obligatoria.** Muestra a Jose Carlos los dos archivos SQL nuevos y pide en el chat un "sí"
   explícito para aplicarlos al Supabase compartido (`pnpm db:migrate` está en `permissions.ask`). Sin "sí",
   detente y reporta; no sigas. Es la autorización de un comando sobre datos compartidos, no un criterio de
   aceptación: los criterios los decide la prueba.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: columnas nuevas de `project`, tabla `project_stage`, dos constantes, check de `org_kpi`
- `packages/db/migrations/**` — new: la migración que emite `pnpm db:generate` y la `*_proyectos_rls.sql` que crea `--custom`
- `apps/improvement/tests/proyectos-schema.test.ts` — new: tablas, restricciones y RLS contra el Supabase compartido

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `git branch --show-current` corre **THE SYSTEM SHALL** imprimir `summum-improvement`, y WHEN se lee `CLAUDE.md` THE SYSTEM SHALL contener un encabezado que empieza con `## Summum + Improvement` y tener menos de 200 líneas.
2. **WHEN** `pnpm --filter improvement test tests/proyectos-schema.test.ts` corre **THE SYSTEM SHALL** insertar y leer de vuelta un `project` nuevo con `authorization_status` `pendiente` por defecto y una fila de `project_stage` ligada a él.
3. **WHEN** se inserta un `project` con `authorization_status` `aprobado`, o un `project_stage` con `progress` 101 o con `weight` 0 **THE SYSTEM SHALL** rechazar cada insert en la base.
4. **WHEN** se inserta un `org_kpi` con `source` `proyectos` o `pendientes` **THE SYSTEM SHALL** aceptarlo, y WHEN el `source` es `inventado` THE SYSTEM SHALL rechazarlo.
5. **WHEN** un miembro del org consulta `project_stage` como rol `authenticated` **THE SYSTEM SHALL** devolver las etapas de su org, y WHEN consulta un perfil sin membresía en ese org THE SYSTEM SHALL devolver 0 filas.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
test "$(git branch --show-current)" = summum-improvement
grep -q '^## Summum + Improvement' CLAUDE.md
test "$(wc -l < CLAUDE.md)" -lt 200
pnpm --filter improvement test tests/proyectos-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/proyectos-schema.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T1 (step 1): esquema de Proyectos/obra con RLS"
git tag step-01-si-proyectos-esquema
git ls-files --error-unmatch apps/improvement/tests/proyectos-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T2` — Motor de proyectos: autorización, responsable y etapas

**Depends on:** `E1-T1` · **Priority:** p0 — metadata for scope cuts, not a running order

`apps/improvement/server/erp/projects.ts` (el directorio `server/erp/` existe vacío). Mismo estilo que
`server/projects/mutations.ts`: `type Result<T>` local, `fail()`, zod en el borde, cada consulta filtrada
por `orgId`. `server/projects/mutations.ts` **no se edita**: sigue siendo el camino manual del avance.

- `stageWeightedProgress(stages: { weight: number; progress: number }[]): number | null` — puro: `null` si
  la lista está vacía; si no, `Math.round(Σ(weight × progress) / Σ weight)`.
- `loadProjectBoard(userId, orgId): Promise<ProjectBoard>` — `assertMembership` (los proyectos los lee
  cualquier miembro, como la política `0020`); todos los proyectos del org con sus etapas por `position`,
  el nombre del cliente y del responsable, y `canManage` (= rol dueño).
- `authorizeProject(userId, orgId, projectId, decision: unknown)` — `findOwnerMembership` (si no:
  `FORBIDDEN`); `decision` en `["autorizado", "rechazado"]` (si no: `VALIDATION_ERROR`); solo desde
  `pendiente` (si no: `INVALID_TRANSITION`); fija `authorized_by` = actor y `authorized_at` = ahora.
- `setProjectOwner(userId, orgId, projectId, ownerProfileId: string | null)` — dueño; el perfil debe ser
  miembro del org (si no: `NOT_FOUND`).
- `addStage(userId, orgId, projectId, input)` — dueño; `{ name (2-120), weight (entero 1-100, default 1) }`;
  `position` = máximo + 1.
- `updateStage(userId, orgId, stageId, input)` — el dueño **o** el responsable del proyecto
  (`project.owner_profile_id = userId`); `{ progress (entero 0-100), status (STAGE_STATUSES) }`.
- `removeStage(userId, orgId, stageId)` — dueño.
- Después de `addStage`, `updateStage` y `removeStage`, en la misma transacción: si el proyecto tiene
  etapas, `project.progress = stageWeightedProgress(etapas)` y `updated_at = now()`; sin etapas, el avance
  manual se queda como está.
- Un id de otro org en cualquier función → `NOT_FOUND`.

`apps/improvement/tests/erp-projects.test.ts`: los criterios, con orgs y profiles propios borrados en
`afterEach`.

**Files**
- `apps/improvement/server/erp/projects.ts` — new: tablero, autorización, responsable y etapas con avance ponderado
- `apps/improvement/tests/erp-projects.test.ts` — new: lo puro y la integración con alcances

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `stageWeightedProgress` recibe las etapas (peso 1, avance 100) y (peso 3, avance 0) **THE SYSTEM SHALL** devolver `25`; con (peso 2, avance 50) y (peso 1, avance 80) SHALL devolver `60`; con una lista vacía SHALL devolver `null`.
2. **WHEN** el dueño agrega dos etapas a un proyecto y actualiza sus avances **THE SYSTEM SHALL** dejar `project.progress` igual al promedio ponderado redondeado de esas etapas.
3. **WHEN** el dueño autoriza un proyecto `pendiente` **THE SYSTEM SHALL** guardar `authorization_status` `autorizado`, `authorized_by` igual al dueño y `authorized_at` no nulo, y WHEN lo intenta autorizar otra vez THE SYSTEM SHALL devolver `code: "INVALID_TRANSITION"`.
4. **WHEN** un empleado llama `authorizeProject` o `addStage` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"` sin escribir, y WHEN el empleado responsable del proyecto llama `updateStage` THE SYSTEM SHALL guardar el avance.
5. **WHEN** `setProjectOwner` recibe un perfil que no es miembro del org, o cualquier función recibe un id de proyecto de otro org **THE SYSTEM SHALL** devolver `code: "NOT_FOUND"`.
6. **WHEN** alguien sin membresía en el org llama `loadProjectBoard` **THE SYSTEM SHALL** lanzar el 404 de `assertMembership` (`notFound()`).

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/erp-projects.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/erp || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/erp/projects.ts apps/improvement/tests/erp-projects.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T2 (step 2): motor de proyectos con autorización y etapas"
git tag step-02-si-proyectos-motor
git ls-files --error-unmatch apps/improvement/server/erp/projects.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T3` — Fuentes de KPI proyectos y pendientes

**Depends on:** `E1-T2` · **Priority:** p0 — metadata for scope cuts, not a running order

En `apps/improvement/server/kpis/sources.ts` agrega dos entradas a `KPI_SOURCES`, después de `clientes` y
antes de `manual`. Nada más del archivo cambia: `computeKpiValues`, `describeKpi` y las fuentes existentes
quedan igual (interfaz congelada de §5).

- `proyectos` — config `z.object({ estado: z.enum(["por_autorizar", "en_obra", "avance_promedio"]).default("en_obra") })`
  leída con `parseConfig` (config inválida → `en_obra`, nunca lanza). `por_autorizar` = proyectos
  `status = 'activo'` con `authorization_status = 'pendiente'`; `en_obra` = `activo` + `autorizado`;
  `avance_promedio` = `Math.round` del promedio de `progress` de los `activo` + `autorizado` (0 si no hay).
  `describe`: "Proyectos por autorizar", "Proyectos en obra", "Avance promedio de obra".
- `pendientes` — los pendientes de Dirección: objetivos con `need_id` no nulo y `status <> 'completed'`.
  Config `z.object({ responsable: z.enum(["todos", "con", "sin"]).default("todos") })`: `con` =
  `assigned_employee_id` no nulo, `sin` = nulo. `describe`: "Pendientes abiertos de los issues".

Ambas cargan con una consulta agrupada por `org_id` (`byOrg`), como las existentes.
`apps/improvement/tests/kpi-erp.test.ts` llama `computeKpiValues` con filas `KpiRow` armadas en la prueba
sobre un org sembrado.

**Files**
- `apps/improvement/server/kpis/sources.ts` — edit: dos entradas nuevas en `KPI_SOURCES` (la vía de extensión documentada)
- `apps/improvement/tests/kpi-erp.test.ts` — new: `computeKpiValues` sobre las dos fuentes

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `computeKpiValues` corre para un org con tres proyectos activos — uno `pendiente`, uno `autorizado` con avance 25 y otro `autorizado` con avance 60 — **THE SYSTEM SHALL** devolver `1` para `proyectos` con `{"estado":"por_autorizar"}`, `2` con `{"estado":"en_obra"}` y `43` con `{"estado":"avance_promedio"}`.
2. **WHEN** el org tiene tres objetivos abiertos con `need_id` — dos con responsable y uno sin — y uno completado con `need_id` **THE SYSTEM SHALL** devolver `3` para `pendientes` con `{}`, `2` con `{"responsable":"con"}` y `1` con `{"responsable":"sin"}`.
3. **WHEN** la config de una fila `proyectos` trae `{"estado":"otro"}` **THE SYSTEM SHALL** calcular como `en_obra` sin lanzar.
4. **WHEN** un org no tiene proyectos **THE SYSTEM SHALL** devolver `0` para `proyectos` con `{"estado":"avance_promedio"}`.
5. **WHEN** `pnpm --filter improvement test tests/owner-panel.test.ts` corre **THE SYSTEM SHALL** salir con código 0 — el panel existente de Indicadores sin cambios.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/kpi-erp.test.ts
pnpm --filter improvement test tests/owner-panel.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/kpis/sources.ts apps/improvement/tests/kpi-erp.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T3 (step 3): fuentes de KPI proyectos y pendientes"
git tag step-03-si-kpi-proyectos
git ls-files --error-unmatch apps/improvement/tests/kpi-erp.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T4` — Pantalla de Proyectos con autorización y etapas

**Depends on:** `E1-T3` · **Priority:** p0 — metadata for scope cuts, not a running order

- `server/permissions/sections.ts`: agrega `"proyectos"` **al final** de `SECTION_SLUGS` (después de
  `"junta"`) y al final de `SECTIONS`:
  `{ slug: "proyectos", label: "Proyectos", hint: "Autorización y avance de obra", scopes: ["empresa"] }`.
  `scopeFor`, `grantsSchema` y las diez entradas existentes no se tocan. La recepción la enlaza sola como
  puerta suelta `/[org]/proyectos` (`loadLobby` no se edita).
- `tests/direccion-permissions.test.ts`: en la aserción de la línea 51, `expect(SECTION_SLUGS).toEqual(` pasa a
  `expect(SECTION_SLUGS.slice(0, 10)).toEqual(` con el mismo arreglo de diez slugs. Ninguna otra línea
  cambia: la propiedad que protegía (las cuatro de Dirección al final de las seis originales) sigue probada.
- `tests/erp-sections.test.ts`: el prefijo de diez, que `proyectos` está en `SECTION_SLUGS`, y `scopeFor`
  para dueño y empleado sin tipo.
- `app/[org]/proyectos/page.tsx`: `requireSection(orgId, "proyectos")` primero; `loadProjectBoard`;
  `h1` "Proyectos"; una `config-card` por proyecto con nombre, cliente, estado (`STATUS_LABEL` de
  `server/projects/mutations.ts`), autorización como texto (`Por autorizar` · `Autorizado` · `Rechazado`) y
  `<progress max={100} value={…}>` con su texto `Avance N%`. Si `canManage`: botones `Autorizar` y
  `Rechazar` (solo en `pendiente`), `select` "Responsable" (`listTeammates`), tabla de etapas con su
  formulario por fila (avance, estado, quitar) y el formulario "Nueva etapa" (nombre, peso). Server
  Actions inline que llaman `server/erp/projects.ts`, `revalidatePath` + `redirect`; un `ok: false` va a
  `?error=` y se pinta en `p.invite-error`. Solo clases existentes de `globals.css`; ningún color nuevo.
- `tests/e2e/erp.spec.ts` — spec nuevo, `test.describe.configure({ mode: "serial" })`, mismo mecanismo de
  sesión que `tests/e2e/direccion.spec.ts` (`createTestAuthUser`, `signInTestUser`, cookie
  `imp-access-token`). `beforeAll`: dueño y empleado sin tipo de permiso, un org, sus `profile` y
  `membership`, un proyecto `activo` "Obra norte" en `pendiente`. `afterAll`: borra el org (cascade),
  luego los profiles y los usuarios de Auth.

**Files**
- `apps/improvement/app/[org]/proyectos/page.tsx` — new: tablero de proyectos con autorización, responsable y etapas
- `apps/improvement/server/permissions/sections.ts` — edit: `proyectos` al final de `SECTION_SLUGS` y de `SECTIONS`
- `apps/improvement/tests/direccion-permissions.test.ts` — edit: una sola aserción pasa de lista completa a prefijo
- `apps/improvement/tests/erp-sections.test.ts` — new: la sección nueva y el prefijo intacto
- `apps/improvement/tests/e2e/erp.spec.ts` — new: spec serial de la operación (este paso, el 7.5 y el 9)

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el dueño abre `/[org]/proyectos` **THE SYSTEM SHALL** responder 200 con un `h1` `Proyectos`, mostrar el proyecto sembrado `Obra norte` con el texto `Por autorizar`, y axe-core SHALL reportar 0 violaciones de impacto serious o critical.
2. **WHEN** el dueño pulsa `Autorizar` en `Obra norte` **THE SYSTEM SHALL** mostrar `Autorizado` después de la redirección.
3. **WHEN** el dueño agrega la etapa `Cimentación` con peso 1 **THE SYSTEM SHALL** mostrarla en la tabla de etapas del proyecto.
4. **WHEN** un empleado sin la sección `proyectos` abre `/[org]/proyectos` **THE SYSTEM SHALL** responder 404.
5. **WHEN** se lee `SECTION_SLUGS` **THE SYSTEM SHALL** empezar con `mapa`, `objetivos`, `equipo`, `clientes`, `powerups`, `cobros`, `vision`, `scorecard`, `issues`, `junta` en ese orden e incluir `proyectos`, y `scopeFor("owner", null, "proyectos")` SHALL devolver `empresa` y `scopeFor("employee", null, "proyectos")` SHALL devolver `ninguno`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/erp-sections.test.ts tests/direccion-permissions.test.ts
pnpm --filter improvement test tests/permissions.test.ts tests/lobby.test.ts tests/direccion-lobby.test.ts
pnpm --filter improvement test:e2e erp.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/proyectos/page.tsx" apps/improvement/server/permissions/sections.ts apps/improvement/tests/direccion-permissions.test.ts apps/improvement/tests/erp-sections.test.ts apps/improvement/tests/e2e/erp.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T4 (step 4): pantalla de Proyectos y sección proyectos"
git tag step-04-si-proyectos-pagina
git ls-files --error-unmatch apps/improvement/tests/e2e/erp.spec.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T5` — Esquema de CRM: hiperpersonalización y tratos

**Depends on:** `E1-T1` · **Priority:** p0 — metadata for scope cuts, not a running order

1. `packages/db/src/schema.ts`:
   - `DEAL_STAGES = ["prospecto", "propuesta", "negociacion", "ganado", "perdido"] as const`.
   - Tabla `client_preference`: `id`, `org_id` (→ organization, cascade, not null), `client_id` (→ client,
     cascade, not null, **unique**), `answers` jsonb not null default `'{}'`, `unmet_note` text null,
     `unmet_flagged_at` timestamptz null, `updated_by` (→ profile, set null), `created_at`, `updated_at`.
   - Tabla `deal`: `id`, `org_id` (cascade), `client_id` (→ client, cascade, not null), `title` text not null,
     `amount_cents` bigint (`mode: "number"`) not null, `currency` text not null default `"mxn"`, `stage`
     (`DEAL_STAGES`, default `"prospecto"`), `owner_profile_id` (→ profile, set null), `closed_at`
     timestamptz null, `created_at`, `updated_at`. Checks `deal_stage_check`, `deal_amount_nonneg`
     (`amount_cents >= 0`), `deal_closed_consistency` (`(stage in ('ganado','perdido')) = (closed_at is not null)`);
     índices `idx_deal_org_stage` (`org_id`, `stage`) e `idx_deal_client` (`client_id`).
   - `org_kpi_source_check`: agrega `'ventas'` al final. `ai_suggestion_category_check`: agrega
     `'siguiente_movimiento'` (lo usa el paso 11; va aquí para que sea una sola migración aprobada).
2. `pnpm db:generate`.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=crm_rls` con el SQL de §4
   *Migración `crm_rls`*, completo.
4. `apps/improvement/tests/crm-schema.test.ts` (patrón `asUser()`).
5. **Aprobación obligatoria.** Muestra los dos SQL a Jose Carlos y espera un "sí" explícito; sin él,
   detente y reporta. No es un criterio de aceptación.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: `client_preference`, `deal`, `DEAL_STAGES`, checks de `org_kpi` y `ai_suggestion`
- `packages/db/migrations/**` — new: la migración de `pnpm db:generate` y la `*_crm_rls.sql` de `--custom`
- `apps/improvement/tests/crm-schema.test.ts` — new: tablas, restricciones y RLS

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `pnpm --filter improvement test tests/crm-schema.test.ts` corre **THE SYSTEM SHALL** insertar y leer de vuelta un `client_preference` con `answers` lleno y un `deal` en `prospecto` con `closed_at` nulo.
2. **WHEN** se inserta un segundo `client_preference` del mismo cliente, un `deal` con `amount_cents` -1, un `deal` `ganado` con `closed_at` nulo o un `deal` `prospecto` con `closed_at` lleno **THE SYSTEM SHALL** rechazar cada insert en la base.
3. **WHEN** se inserta un `org_kpi` con `source` `ventas` y un `ai_suggestion` con `category` `siguiente_movimiento` **THE SYSTEM SHALL** aceptar ambos.
4. **WHEN** un empleado sin tipo de permiso consulta `client_preference` y `deal` como rol `authenticated` **THE SYSTEM SHALL** devolver 0 filas, y WHEN consulta un empleado con grants `{"clientes":"empresa"}` o el dueño THE SYSTEM SHALL devolver las filas de su org.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/crm-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/crm-schema.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T5 (step 5): esquema de CRM con RLS"
git tag step-05-si-crm-esquema
git ls-files --error-unmatch apps/improvement/tests/crm-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T6` — Motor de ventas, hiperpersonalización y KPI ventas

**Depends on:** `E1-T5`, `E1-T3` · **Priority:** p0 — metadata for scope cuts, not a running order

Todo bajo la sección existente `clientes`: lee quien tenga alcance distinto de `ninguno`; escribe el dueño
o quien tenga `clientes: empresa` (la sección solo admite `empresa`). Mismo `Result<T>` que
`server/needs/mutations.ts`.

- `server/crm/preferences.ts`: `HIPER_QUESTIONS` — seis `{ key, question }`, en este orden y con este texto:
  `como_atenderlo` "¿Cómo quiere que lo atendamos?", `expectativa` "¿Qué espera de nosotros?",
  `como_arreglarlo` "Si fallamos, ¿cómo espera que lo arreglemos y que estemos presentes?",
  `valor_agregado` "¿Qué valor agregado le gustaría recibir?", `extra_por_ser_cliente` "¿Qué le gustaría
  recibir de extra por ser nuestro cliente?", `como_se_siente_valorado` "¿Cómo se siente valorado por
  nosotros?". `getClientPreference(userId, orgId, clientId)` (`ninguno` → `null`) y
  `saveClientPreference(userId, orgId, clientId, input)` — cada llave opcional,
  `z.string().trim().max(1000)`; upsert por `client_id`; `updated_by` = actor; cliente de otro org →
  `NOT_FOUND`.
- `server/crm/deals.ts`: `mxMonthStart(now: Date): string` — puro, `YYYY-MM-01` del mes en
  America/Mexico_City con `Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", year:
  "numeric", month: "2-digit", day: "2-digit" })` y `formatToParts` (nunca `getMonth()` de la hora del
  servidor). `createDeal(userId, orgId, input)` — `{ clientId (uuid del org), title (3-160), amountCents
  (entero ≥ 0), ownerProfileId (uuid miembro | null) }`, etapa `prospecto`. `moveDeal(userId, orgId,
  dealId, stage: unknown)` — cualquier etapa de `DEAL_STAGES`; `ganado`/`perdido` fijan `closed_at = now`,
  las demás lo vuelven `null`. `listPipeline(userId, orgId)` — tratos agrupados por etapa en el orden de
  `DEAL_STAGES`, con nombre del cliente.
- `server/kpis/sources.ts`: fuente `ventas` antes de `manual`. Config
  `z.object({ metrica: z.enum(["monto_ganado", "tratos_ganados"]).default("monto_ganado") })`; cuenta tratos
  `ganado` con `closed_at >= (mxMonthStart(new Date()))::timestamp at time zone 'America/Mexico_City'`.
  `monto_ganado` = `Math.round(Σ amount_cents / 100)` (pesos, formato `dinero` del panel); `tratos_ganados` =
  conteo.
- La pantalla del pipeline llega en el paso 8, junto con la ficha, en el mismo paso que la abre en el e2e.
- `tests/crm.test.ts`: los criterios; los tratos del mes se siembran con `closed_at = now` y el del mes
  anterior con `now - 40 días`, así el resultado no depende del día en que corre.

**Files**
- `apps/improvement/server/crm/deals.ts` — new: tratos, pipeline y `mxMonthStart`
- `apps/improvement/server/crm/preferences.ts` — new: las seis preguntas de hiperpersonalización
- `apps/improvement/server/kpis/sources.ts` — edit: fuente `ventas`
- `apps/improvement/tests/crm.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `mxMonthStart` recibe `2026-11-01T05:59:00Z` **THE SYSTEM SHALL** devolver `2026-10-01`, y con `2026-11-01T06:00:00Z` SHALL devolver `2026-11-01`.
2. **WHEN** el dueño mueve un trato a `ganado` **THE SYSTEM SHALL** fijar `closed_at`, y WHEN lo regresa a `negociacion` THE SYSTEM SHALL dejar `closed_at` en null.
3. **WHEN** `computeKpiValues` corre para un org con dos tratos ganados este mes de 150000 y 50000 centavos, uno ganado hace 40 días y uno perdido **THE SYSTEM SHALL** devolver `2000` para `ventas` con `{}` y `2` con `{"metrica":"tratos_ganados"}`.
4. **WHEN** `saveClientPreference` recibe las seis respuestas **THE SYSTEM SHALL** guardarlas en `answers`, y WHEN una respuesta pasa de 1000 caracteres THE SYSTEM SHALL devolver `code: "VALIDATION_ERROR"` sin escribir.
5. **WHEN** un empleado sin la sección `clientes` llama `createDeal` o `saveClientPreference` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`, y WHEN llama `getClientPreference` THE SYSTEM SHALL devolver `null`.
6. **WHEN** se lee `HIPER_QUESTIONS` **THE SYSTEM SHALL** tener seis entradas con las llaves `como_atenderlo`, `expectativa`, `como_arreglarlo`, `valor_agregado`, `extra_por_ser_cliente` y `como_se_siente_valorado`, en ese orden.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/crm.test.ts
pnpm --filter improvement test tests/clients.test.ts tests/owner-panel.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/crm || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/crm/deals.ts apps/improvement/server/crm/preferences.ts apps/improvement/server/kpis/sources.ts apps/improvement/tests/crm.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T6 (step 6): tratos, hiperpersonalización y KPI ventas"
git tag step-06-si-crm-motor
git ls-files --error-unmatch apps/improvement/server/crm/deals.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T7` — IA de atención al cliente en el servidor

**Depends on:** `E1-T6` · **Priority:** p1 — metadata for scope cuts, not a running order

- `server/ai/gateway.ts`: agrega `generateStructured<T>(args)` con la firma de §5. Usa el mismo
  `MODEL_ID`, el mismo `SuggestionProvider`/`AnthropicSuggestionProvider`, `parseCompletion`, **un** reintento
  si `args.schema` rechaza la respuesta y después `VALIDATION_ERROR`; el límite de 10 por org por hora se
  cuenta **antes** de resolver el proveedor, sobre `llm_calls` con `purpose = args.purpose`; inserta
  `ai_suggestion` (`category`, `suggestion_text = args.toText(parsed)`, `based_on = args.basedOn`) y
  `llm_calls` (uso real del proveedor) en una transacción. `generateSuggestion`, `reviewObjective`,
  `reviewPendingObjectives` y `MODEL_ID` no se tocan; no se cambia el modelo (si alguna vez se cambia, antes
  se invoca la skill `claude-api`, regla `ia-gateway.md`).
- `server/ai/prompts/attention.ts`: `ATTENTION_SYSTEM_PROMPT` (asesor de servicio al cliente de la empresa;
  responde solo JSON), `attentionSchema = z.object({ suggestionText: z.string().min(1).max(1200),
  expectativaIncumplida: z.boolean(), motivo: z.string().max(500).nullable() })` y
  `buildAttentionPrompt({ clientName, healthStatus, answers: { question, answer }[], deals: { title, stage }[] })`.
- `server/crm/attention.ts`: `suggestAttention(userId, orgId, clientId, provider?)` — alcance `empresa` en
  `clientes` (si no: `FORBIDDEN`, sin llamar al proveedor); sin ninguna respuesta en `client_preference` →
  `VALIDATION_ERROR` "Primero captura cómo quiere que lo atiendan." sin llamar al proveedor; llama
  `generateStructured({ purpose: "atencion_cliente", category: "servicio_cliente", basedOn: { clientIds:
  [clientId], dealIds } … })`; si `expectativaIncumplida`, guarda `unmet_note = motivo` y `unmet_flagged_at
  = now`; si no, los deja en null. `latestAttention(userId, orgId, clientId)` — la última `ai_suggestion`
  `servicio_cliente` cuyo `based_on->'clientIds'` contiene el cliente.
- La ficha del cliente que usa `suggestAttention` y `latestAttention` llega en el paso 8.
- `tests/crm-attention.test.ts`: un `FakeProvider` como el de `tests/ai-gateway.test.ts`; nunca la API real.

**Files**
- `apps/improvement/server/ai/gateway.ts` — edit: export nuevo `generateStructured`; lo existente no cambia
- `apps/improvement/server/ai/prompts/attention.ts` — new: prompt y esquema de atención
- `apps/improvement/server/crm/attention.ts` — new: `suggestAttention`, `latestAttention`
- `apps/improvement/tests/crm-attention.test.ts` — new: con proveedor simulado

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `suggestAttention` corre con un proveedor simulado que devuelve `expectativaIncumplida: true` y `motivo` `"Pidió entrega el viernes"` **THE SYSTEM SHALL** insertar una `ai_suggestion` con `category` `servicio_cliente` y `based_on.clientIds` igual a `[clientId]`, una fila `llm_calls` con `purpose` `atencion_cliente`, y guardar `unmet_note` `Pidió entrega el viernes` con `unmet_flagged_at` no nulo.
2. **WHEN** el proveedor simulado devuelve `expectativaIncumplida: false` **THE SYSTEM SHALL** dejar `unmet_note` y `unmet_flagged_at` en null.
3. **WHEN** el proveedor simulado devuelve dos veces un texto que no cumple `attentionSchema` **THE SYSTEM SHALL** devolver `code: "VALIDATION_ERROR"` sin insertar en `ai_suggestion`.
4. **WHEN** el cliente no tiene ninguna respuesta de hiperpersonalización, o quien llama es un empleado sin `{"clientes":"empresa"}` **THE SYSTEM SHALL** devolver `VALIDATION_ERROR` o `FORBIDDEN` respectivamente sin llamar al proveedor.
5. **WHEN** se buscan archivos que importen `@anthropic-ai/sdk` en `apps/improvement/server`, `app`, `lib` y `components` **THE SYSTEM SHALL** encontrar solo `apps/improvement/server/ai/gateway.ts`.
6. **WHEN** `pnpm --filter improvement test tests/ai-gateway.test.ts` corre **THE SYSTEM SHALL** salir con código 0 — el gateway existente sin cambios de comportamiento.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/crm-attention.test.ts tests/ai-gateway.test.ts
test "$(grep -rl '@anthropic-ai/sdk' apps/improvement/server apps/improvement/app apps/improvement/lib apps/improvement/components)" = apps/improvement/server/ai/gateway.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/ai/gateway.ts apps/improvement/server/ai/prompts/attention.ts apps/improvement/server/crm/attention.ts apps/improvement/tests/crm-attention.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T7 (step 7): sugerencia de atención por IA"
git tag step-07-si-crm-atencion
git ls-files --error-unmatch apps/improvement/server/crm/attention.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T8` — Pantallas del CRM: pipeline, ficha y entradas

**Depends on:** `E1-T7`, `E1-T4` · **Priority:** p1 — metadata for scope cuts, not a running order

Las dos pantallas del CRM se construyen y se abren en el e2e en el mismo paso: un error de ruta o de
sección aparece aquí, no tres pasos después.

- `app/[org]/clientes/pipeline/page.tsx`: `requireSection(orgId, "clientes")`; `h1` "Pipeline de ventas";
  una columna `section` con `h2` por etapa; cada trato con título, cliente, monto en MXN
  (`Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })`), un `select` para moverlo y el
  enlace a la ficha `/[org]/clientes/[clienteId]`; formulario "Nuevo trato".
- `app/[org]/clientes/[clienteId]/page.tsx`: `requireSection(orgId, "clientes")`; cliente de otro org →
  `notFound()`; `h1` con el nombre; aviso `Expectativa en riesgo: <motivo>` si `unmet_flagged_at`; formulario
  con las seis preguntas de `HIPER_QUESTIONS` (cada `textarea` con su `label`); botón
  `Sugerir cómo atenderlo` (error de la IA → `?error=`); la última sugerencia; los tratos de este cliente
  (de `listPipeline`).
- `app/[org]/clientes/page.tsx`: agrega en cada fila un enlace `Ficha` a `/[org]/clientes/[id]` y arriba un
  enlace `Pipeline de ventas` a `/[org]/clientes/pipeline`. Nada existente se quita.
- `tests/e2e/erp.spec.ts`: en `beforeAll` siembra el cliente "Cliente Uno" y un trato "Remodelación baño" de
  ese cliente en `prospecto`; dueño: `/[org]/clientes/pipeline` 200 + axe con el trato bajo `Prospecto`;
  `/[org]/clientes` muestra `Ficha`; la ficha muestra las seis preguntas; empleado sin tipo de permiso → 404
  en `/[org]/clientes/pipeline`. Nunca pulsa `Sugerir cómo atenderlo` (llamaría a la API real).

**Files**
- `apps/improvement/app/[org]/clientes/pipeline/page.tsx` — new: pipeline por etapa
- `apps/improvement/app/[org]/clientes/[clienteId]/page.tsx` — new: ficha del cliente
- `apps/improvement/app/[org]/clientes/page.tsx` — edit: enlaces a la ficha y al pipeline (nada se quita)
- `apps/improvement/tests/e2e/erp.spec.ts` — edit: pipeline y ficha, abiertas en el paso que las crea

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el dueño abre `/[org]/clientes/pipeline` **THE SYSTEM SHALL** responder 200 con un `h1` `Pipeline de ventas` y el trato sembrado `Remodelación baño`, y axe-core SHALL reportar 0 violaciones serious o critical.
2. **WHEN** el dueño abre la ficha de `Cliente Uno` desde el enlace `Ficha` de `/[org]/clientes` **THE SYSTEM SHALL** responder 200 con un `h1` `Cliente Uno` y mostrar las seis preguntas de hiperpersonalización.
3. **WHEN** el dueño abre `/[org]/clientes` **THE SYSTEM SHALL** mostrar el enlace `Pipeline de ventas`.
4. **WHEN** un empleado sin tipo de permiso abre `/[org]/clientes/pipeline` **THE SYSTEM SHALL** responder 404.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test:e2e erp.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/clientes/pipeline/page.tsx" ":(literal)apps/improvement/app/[org]/clientes/[clienteId]/page.tsx" ":(literal)apps/improvement/app/[org]/clientes/page.tsx" apps/improvement/tests/e2e/erp.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T8 (step 8): pipeline, ficha del cliente y entradas del CRM"
git tag step-08-si-crm-pantallas
git ls-files --error-unmatch ":(literal)apps/improvement/app/[org]/clientes/pipeline/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T9` — Postventa: esquema, sección y motor de tickets

**Depends on:** `E1-T5`, `E1-T4` · **Priority:** p1 — metadata for scope cuts, not a running order

1. `packages/db/src/schema.ts`: `TICKET_STATUSES = ["abierto", "en_proceso", "resuelto"] as const`; tabla
   `ticket`: `id`, `org_id` (cascade), `client_id` (→ client, cascade, not null), `project_id` (→ project,
   set null), `title` text not null, `detail` text null, `severity` integer not null default 2,
   `status` (`TICKET_STATUSES`, default `"abierto"`), `opened_at` timestamptz not null default `now()`,
   `resolved_at` timestamptz null, `satisfaction` integer null, `created_by` (→ profile, set null),
   `created_at`, `updated_at`. Checks `ticket_severity_range` (1-3), `ticket_status_check`,
   `ticket_resolved_consistency` (`(status = 'resuelto') = (resolved_at is not null)`),
   `ticket_satisfaction_range` (`satisfaction is null or (satisfaction between 1 and 5 and status = 'resuelto')`);
   índice `idx_ticket_org_status` (`org_id`, `status`). `org_kpi_source_check` += `'postventa'`.
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=postventa_rls`
   con el SQL de §4 *Migración `postventa_rls`*.
3. `server/permissions/sections.ts`: `"postventa"` al final de `SECTION_SLUGS` y
   `{ slug: "postventa", label: "Postventa", hint: "Lo que pasa después de entregar", scopes: ["empresa"] }` al
   final de `SECTIONS`. La puerta suelta `/[org]/postventa` aparece en la recepción desde aquí y su página
   llega en el paso 10 (el e2e del paso 10 la cubre).
4. `server/erp/tickets.ts` (guard por la sección `postventa`): `openTicket(userId, orgId, input)` —
   `{ clientId (del org), projectId (del org | null), title (3-160), detail (≤2000 | null), severity (1-3) }`;
   `moveTicket(userId, orgId, ticketId, status: unknown)` — a `resuelto` fija `resolved_at = now`; fuera de
   `resuelto` vuelve `resolved_at` y `satisfaction` a null; `rateTicket(userId, orgId, ticketId,
   satisfaction: unknown)` — entero 1-5, solo si `resuelto` (si no: `INVALID_TRANSITION`);
   `listTickets(userId, orgId)` — `ninguno` → `[]`. Escrituras con alcance `empresa`; si no, `FORBIDDEN`.
5. `tests/postventa.test.ts` (incluye RLS con `asUser()`).
6. **Aprobación obligatoria** de los dos SQL por Jose Carlos (un "sí" explícito); sin él, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: tabla `ticket`, `TICKET_STATUSES`, check de `org_kpi`
- `packages/db/migrations/**` — new: la migración de `pnpm db:generate` y la `*_postventa_rls.sql`
- `apps/improvement/server/erp/tickets.ts` — new: abrir, mover, calificar y listar tickets
- `apps/improvement/server/permissions/sections.ts` — edit: `postventa` al final
- `apps/improvement/tests/postventa.test.ts` — new: esquema, RLS y motor

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** se inserta un `ticket` `resuelto` sin `resolved_at`, un `ticket` `abierto` con `satisfaction` 4 o uno con `severity` 4 **THE SYSTEM SHALL** rechazar cada insert en la base.
2. **WHEN** el dueño abre un ticket y lo mueve a `resuelto` **THE SYSTEM SHALL** fijar `resolved_at`, y WHEN lo califica con 5 THE SYSTEM SHALL guardar `satisfaction` 5.
3. **WHEN** `rateTicket` corre sobre un ticket `abierto` **THE SYSTEM SHALL** devolver `code: "INVALID_TRANSITION"`, y WHEN un ticket `resuelto` se regresa a `en_proceso` THE SYSTEM SHALL dejar `resolved_at` y `satisfaction` en null.
4. **WHEN** un empleado sin la sección `postventa` llama `openTicket` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`, y WHEN llama `listTickets` THE SYSTEM SHALL devolver `[]`.
5. **WHEN** un empleado sin tipo de permiso consulta `ticket` como rol `authenticated` **THE SYSTEM SHALL** devolver 0 filas, y WHEN consulta uno con grants `{"postventa":"empresa"}` THE SYSTEM SHALL devolver los tickets de su org.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/postventa.test.ts
pnpm --filter improvement test tests/erp-sections.test.ts tests/direccion-permissions.test.ts tests/lobby.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/erp || status=$?; test "$status" -eq 1
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/server/erp/tickets.ts apps/improvement/server/permissions/sections.ts apps/improvement/tests/postventa.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T9 (step 9): tickets de postventa con RLS y sección postventa"
git tag step-09-si-postventa-motor
git ls-files --error-unmatch apps/improvement/server/erp/tickets.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E1-T10` — Pantalla de Postventa y KPI postventa

**Depends on:** `E1-T9`, `E1-T8` · **Priority:** p1 — metadata for scope cuts, not a running order

- `server/kpis/sources.ts`: fuente `postventa` antes de `manual`. Config
  `z.object({ metrica: z.enum(["abiertos", "satisfaccion_promedio", "horas_promedio_resolucion"]).default("abiertos") })`.
  `abiertos` = tickets con `status <> 'resuelto'`; `satisfaccion_promedio` = `Math.round(promedio × 10) / 10`
  de `satisfaction` no nula (0 sin datos); `horas_promedio_resolucion` = `Math.round` del promedio de horas
  entre `opened_at` y `resolved_at` de los `resuelto` (0 sin datos).
- `app/[org]/postventa/page.tsx`: `requireSection(orgId, "postventa")`; `h1` "Postventa"; tres secciones con
  `h2` `Abiertos` · `En proceso` · `Resueltos`; cada ticket con cliente, título, severidad en texto; botones
  para moverlo (nunca arrastrar) y, si está resuelto, un `select` de satisfacción 1-5; formulario
  "Nuevo ticket" (cliente, proyecto opcional, título, detalle, severidad).
- `tests/kpi-postventa.test.ts`: tickets resueltos sembrados con `opened_at`/`resolved_at` fijos.
- `tests/e2e/erp.spec.ts`: siembra un ticket `abierto` de "Cliente Uno" (el cliente lo sembró el paso 8);
  dueño: `/[org]/postventa` 200 + axe, mueve el ticket a `Resueltos`; empleado sin sección → 404 en
  `/[org]/postventa`.

**Files**
- `apps/improvement/app/[org]/postventa/page.tsx` — new: tickets por estado
- `apps/improvement/server/kpis/sources.ts` — edit: fuente `postventa`
- `apps/improvement/tests/kpi-postventa.test.ts` — new
- `apps/improvement/tests/e2e/erp.spec.ts` — edit: postventa

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `computeKpiValues` corre para un org con dos tickets resueltos de 2 y 5 horas calificados con 4 y 5, y un ticket abierto **THE SYSTEM SHALL** devolver `1` para `postventa` con `{}`, `4.5` con `{"metrica":"satisfaccion_promedio"}` y `4` con `{"metrica":"horas_promedio_resolucion"}`.
2. **WHEN** un org no tiene tickets resueltos **THE SYSTEM SHALL** devolver `0` para `{"metrica":"satisfaccion_promedio"}` y para `{"metrica":"horas_promedio_resolucion"}`.
3. **WHEN** el dueño abre `/[org]/postventa` **THE SYSTEM SHALL** responder 200 con un `h1` `Postventa` y el ticket sembrado bajo `Abiertos`, axe-core SHALL reportar 0 violaciones serious o critical, y WHEN el dueño lo mueve a resuelto THE SYSTEM SHALL mostrarlo bajo `Resueltos`.
4. **WHEN** un empleado sin la sección `postventa` abre `/[org]/postventa` **THE SYSTEM SHALL** responder 404.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/kpi-postventa.test.ts
pnpm --filter improvement test:e2e erp.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/postventa/page.tsx" apps/improvement/server/kpis/sources.ts apps/improvement/tests/kpi-postventa.test.ts apps/improvement/tests/e2e/erp.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E1-T10 (step 10): pantalla de Postventa y KPI postventa"
git tag step-10-si-postventa-pagina
git ls-files --error-unmatch apps/improvement/tests/kpi-postventa.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e erp.spec.ts` corre completo **THE SYSTEM SHALL** salir con código 0, con `/[org]/proyectos`, `/[org]/postventa` y `/[org]/clientes/pipeline` auditadas por axe sin violaciones serious o critical.
2. **WHEN** un empleado sin las secciones `proyectos` y `postventa` abre `/[org]/proyectos` o `/[org]/postventa` **THE SYSTEM SHALL** responder 404 en cada una.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e erp.spec.ts
```

## Pitfalls

- **Editar `server/projects/mutations.ts`** — es el camino manual del avance y lo usa la recepción; el avance por etapas vive en `server/erp/projects.ts`.
- **Cambiar la aserción equivocada** — en `direccion-permissions.test.ts` solo la línea del `toEqual` de `SECTION_SLUGS` pasa a `slice(0, 10)`.
- **Fechas del mes con la hora del servidor** — `mxMonthStart` usa `Intl` en America/Mexico_City; nunca `getMonth()`.
- **Llamar a la IA real en una prueba** — siempre un `FakeProvider`; `ANTHROPIC_API_KEY` no hace falta.
- **Un servidor ya levantado en el puerto 3200** — Playwright lo reusa fuera de CI; apaga cualquier `pnpm dev:improvement` de otra rama.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-si-*'` los lista (10 de este epic; 42 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` sin cambios — este cambio no agrega variables.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Cada migración de este epic se aplicó solo después de un "sí" explícito de Jose Carlos.
