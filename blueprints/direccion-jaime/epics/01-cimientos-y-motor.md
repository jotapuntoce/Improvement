# Epic 01: Cimientos y motor de Dirección

> Al terminar existen la rama `direccion-jaime`, las cinco tablas de Dirección con su RLS en el
> Supabase compartido, las cuatro secciones nuevas de permisos, la V/TO (servidor y pantalla) y el motor
> del Scorecard semanal.

| | |
|---|---|
| **Epic id** | `01-cimientos-y-motor` |
| **Tasks** | `E1-T1` … `E1-T6` |
| **Depends on** | nothing — start here |
| **Unlocks** | `02-pantallas-y-junta` |
| **Parallel with** | nada: `02` necesita la rama, el esquema, las secciones y `week.ts` de este epic |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16.3.3 App Router · TypeScript 6 · Tailwind CSS v4 sobre tokens de `packages/ui/src/tokens.css`
(tema oscuro fijo) · Postgres del **Supabase compartido** (sin base local, sin Docker) · Drizzle ORM
0.45 (`packages/db`) · Supabase Auth + `apps/improvement/server/auth/guard.ts` · Vercel.
Package manager: `pnpm` 11.24.0. Runtime pinned in `.nvmrc` (24.19.0). Dependency versions are in
the lockfile — read it, never guess one. **Este cambio no agrega ni actualiza dependencias.**

| Task | Command |
|---|---|
| Dev | `pnpm dev:improvement` — http://localhost:3200 |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (todo) | `pnpm test` |
| Test (un archivo) | `pnpm --filter improvement test tests/<archivo>.test.ts` |
| E2E (un spec) | `pnpm --filter improvement test:e2e direccion.spec.ts` |
| DB — generar migración | `pnpm db:generate` · RLS: `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=direccion_rls` |
| DB — aplicar | `pnpm db:migrate` — **solo con un "sí" explícito de Jose Carlos**; la herramienta pide confirmación (`permissions.ask`) |
| Local services | NOT APPLICABLE — no hay servicios locales: la base es el Supabase compartido, con las llaves en `apps/improvement/.env.test` y el `.env.local` de la raíz |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

Las pruebas de integración hablan con el Supabase compartido. Sin `apps/improvement/.env.test` y el
`.env.local` de la raíz con valores reales no corren: es esperado; detente y repórtalo, nunca uses una
base falsa. **Nunca `git add -A`**: el árbol trae WIP del usuario (`apps/admin/*`, `.claude/launch.json`,
`projects/`, `blueprints/summum-improvement/`) que no es de este cambio. Cada Checkpoint nombra sus rutas.

## Directory subtree

Only the parts this epic touches:

```
CLAUDE.md, AGENTS.md, .claude/settings.json   # fusionados por el Bootstrap — se commitean en E1-T1
.claude/rules/direccion.md                    # NUEVO (Bootstrap) — se commitea en E1-T1
blueprints/direccion-jaime/                   # este bundle — se commitea en E1-T1
packages/db/
  src/schema.ts                               # exists, you will edit it (E1-T2)
  migrations/                                 # E1-T2: lo que emiten `pnpm db:generate` y `--custom --name=direccion_rls`
  drizzle.config.ts                           # exists, read-only (carga <raíz>/.env.local)
apps/improvement/
  server/
    auth/guard.ts                             # exists, read-only (resolveSection, findOwnerMembership, findMembership)
    permissions/sections.ts                   # exists, you will edit it (E1-T3)
    permissions/loadSections.ts               # exists, read-only (loadVisibleSections)
    lobby/loadLobby.ts                        # exists, you will edit it (E1-T3)
    direccion/nav.ts                          # NEW in this epic (E1-T3)
    direccion/vision/vision.ts                # NEW (E1-T4)
    direccion/scorecard/week.ts               # NEW (E1-T6)
    direccion/scorecard/measurables.ts        # NEW (E1-T6)
    employees/teammates.ts                    # exists, read-only (listTeammates)
  app/[org]/direccion/vision/page.tsx         # NEW (E1-T5)
  tests/
    setup.ts                                  # exists, read-only (carga .env.test)
    muelle-schema.test.ts                     # exists, read-only — patrón de asUser() para RLS
    direccion-schema.test.ts                  # NEW (E1-T2)
    direccion-permissions.test.ts             # NEW (E1-T3)
    direccion-vision.test.ts                  # NEW (E1-T4)
    direccion-week.test.ts                    # NEW (E1-T6)
    direccion-scorecard.test.ts               # NEW (E1-T6)
    e2e/global-setup.ts                       # exists, read-only (carga .env.test y ../../.env.local)
    e2e/a11y.spec.ts                          # exists, read-only — patrón de sesión e2e
    e2e/direccion.spec.ts                     # NEW (E1-T5); el epic 02 lo extiende
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `org_vision` | `id`, `org_id` (unique, cascade), `core_values` jsonb `'[]'`, `core_focus`, `ten_year_target`, `marketing_strategy`, `three_year_picture`, `one_year_plan` jsonb `'{}'`, `updated_by` (set null), `created_at`, `updated_at` | Una por org |
| `org_measurable` | `id`, `org_id` (cascade), `title`, `owner_profile_id` (not null, no action), `goal` numeric(14,2) `mode:"number"`, `goal_direction` `gte`\|`lte`, `unit` `numero`\|`porcentaje`\|`dinero` (default `numero`), `position`, `archived_at`, timestamps | Archivar, nunca borrar |
| `measurable_value` | `id`, `measurable_id` (cascade), `week_start` date (check lunes), `value` numeric(14,2), `entered_by` (no action), `entered_at`, `created_at`; unique (`measurable_id`, `week_start`) | Upsert por semana |
| `meeting` | `id`, `org_id`, `scheduled_for`, `started_at`, `ended_at`, `facilitator_profile_id`, `current_block` (check `MEETING_BLOCKS`), `notes` jsonb, `created_by`, timestamps | La usa el epic 02 |
| `meeting_rating` | `id`, `meeting_id` (cascade), `profile_id` (no action), `rating` 1-10, `created_at`; unique (`meeting_id`, `profile_id`) | La usa el epic 02 |
| `org_need` (existente) | + `owner_profile_id` uuid null (set null), + `priority_week` date null, + índice `idx_org_need_org_priority` | Nada se quita; `status` intacto |
| `membership`, `permission_type`, `organization`, `profile` | lectura | Para alcances y pruebas |

Constantes nuevas en `packages/db/src/schema.ts`: `MEASURABLE_DIRECTIONS = ["gte","lte"]`,
`MEASURABLE_UNITS = ["numero","porcentaje","dinero"]`,
`MEETING_BLOCKS = ["segue","scorecard","rocks","headlines","todos","ids","conclude"]`.

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/auth/guard.ts` → `resolveSection(userId, orgId, section)` | `{ membership, scope }`; lanza `notFound()` si no es miembro; `scope` `ninguno` sin lanzar |
| repo | `server/auth/guard.ts` → `findOwnerMembership(userId, orgId)` | la fila si es dueño, `null` si es miembro no dueño, `notFound()` si no es miembro |
| repo | `server/auth/guard.ts` → `findMembership(userId, orgId)` | la fila o `null`, nunca lanza (salvo un `orgId` que no es uuid: por eso `nav.ts` valida antes) |
| repo | `server/auth/guard.ts` → `requireSection(orgId, section)` | 404 sin sesión, sin membresía o con `ninguno`; para páginas |
| repo | `server/permissions/loadSections.ts` → `loadVisibleSections(userId, orgId)` | `VisibleSection[]` en el orden de `SECTIONS`, sin las apagadas ni las `ninguno` |
| repo | `server/employees/teammates.ts` → `listTeammates(userId, orgId)` | compañeros visibles sin `responsibility_level` |
| repo | `@jotapuntoce/db/test-fixtures` → `createTestAuthUser`, `deleteTestAuthUser`, `signInTestUser` | usuarios reales de Supabase Auth para e2e |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `packages/db/src/schema.ts` → `orgVision`, `orgMeasurable`, `measurableValue`, `meeting`, `meetingRating`, `MEASURABLE_DIRECTIONS`, `MEASURABLE_UNITS`, `MEETING_BLOCKS` | tablas Drizzle / `as const` | `02` |
| `server/permissions/sections.ts` → `DIRECCION_SLUGS`, `DireccionSlug` | `readonly ["vision","scorecard","issues","junta"]` | `02` |
| `server/direccion/nav.ts` → `loadDireccionNav` | `(userId: string, orgId: string) => Promise<VisibleSection[]>` | `02` (hub, layout) |
| `server/direccion/scorecard/week.ts` → `SCORECARD_WEEKS`, `weekStart`, `recentWeeks`, `isOnTrack` | `13` · `(now: Date) => string` · `(ws: string, n: number) => string[]` · `(value, goal, direction) => boolean` | `02` (issues, junta, e2e) |
| `server/direccion/scorecard/measurables.ts` → `listScorecard`, `createMeasurable`, `archiveMeasurable`, `enterValue` | ver E1-T6 | `02` (pantalla del scorecard, junta) |
| `server/direccion/vision/vision.ts` → `VISION_SECTIONS`, `getVision`, `updateVisionSection` | ver E1-T4 | E1-T5 |
| `tests/e2e/direccion.spec.ts` | spec serial con dueño + empleado sin tipo + org sembrado | `02` lo extiende |

## Conventions that bite in this area

- **Dos puertas.** El cliente `db` conecta como dueño de las tablas: RLS **no** corre en el camino de la
  app. La única autorización ahí es `resolveSection`/`findOwnerMembership` + `eq(tabla.orgId, orgId)`.
  La política RLS cierra la otra puerta (PostgREST). Ninguna respalda a la otra.
- **Import relativo con `.ts` explícito** (`../../auth/guard.ts`); `@/` solo en páginas; sin barrels.
- **Una sola semana:** `weekStart()` de `week.ts`. Nunca `getDay()` sobre la hora del servidor.
- **Resultados tipados** `{ ok: true, data } | { ok: false, error: { code, message } }`, el tipo
  `Result<T>` repetido por archivo como en `server/needs/mutations.ts`.
- **Las migraciones generadas no se editan.** El único archivo de `packages/db/migrations/` escrito a
  mano es el que crea `--custom --name=direccion_rls`, igual que `0018` y `0027`.
- **Motor genérico:** ningún uuid, slug ni nombre de cliente literal en `server/direccion/**` (lo
  comprueba un `grep` en E1-T4 y E1-T6).

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/direccion.md`,
`.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`. All sit in the project root.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick.

### `E1-T1` — Abrir la rama direccion-jaime con la línea base verde

**Depends on:** nothing · **Priority:** p0 — metadata for scope cuts, not a running order

El Bootstrap del blueprint (§10) ya cambió a `direccion-jaime` (desde `chequeos`), corrió
`pnpm install --frozen-lockfile`, instaló Chromium y fusionó `workspace/`. Aquí no se escribe código:
confirma que las exclusiones de `blueprints/**` ya están en los cuatro configs (no se edita nada),
corre la línea base completa y commitea solo el bundle y los archivos fusionados. Si la línea base sale
roja antes de tocar nada — probablemente por el WIP de `apps/admin/` — detente y reporta qué paquete
falla; no arregles WIP ajeno.

**Files**
- `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json` — edit (ya fusionados por el Bootstrap; se commitean)
- `.claude/rules/direccion.md` — new (ya copiado por el Bootstrap; se commitea)
- `blueprints/direccion-jaime/**` — new (el bundle; se commitea)

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `git branch --show-current` corre en la raíz del repo **THE SYSTEM SHALL** imprimir `direccion-jaime`.
2. **WHEN** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` corren en la rama **THE SYSTEM SHALL** salir con código 0 en los cuatro.
3. **WHEN** `pnpm db:generate` corre sobre `packages/db/src/schema.ts` sin cambios **THE SYSTEM SHALL** no agregar ningún archivo `.sql` a `packages/db/migrations/`.
4. **WHEN** se buscan las exclusiones del bundle **THE SYSTEM SHALL** encontrar `"blueprints/**"` en `eslint.config.mjs` y `"../../blueprints/**"` en `apps/improvement/tsconfig.json`, `apps/improvement/vitest.config.ts` y `packages/db/tsconfig.json`.
5. **WHEN** se lee el `CLAUDE.md` fusionado **THE SYSTEM SHALL** contener un encabezado que empieza con `## Direcci` y tener menos de 200 líneas.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
test "$(git branch --show-current)" = direccion-jaime
grep -qF '"blueprints/**"' eslint.config.mjs
grep -qF '"../../blueprints/**"' apps/improvement/tsconfig.json
grep -qF '"../../blueprints/**"' apps/improvement/vitest.config.ts
grep -qF '"../../blueprints/**"' packages/db/tsconfig.json
grep -q '^## Direcci' CLAUDE.md
test "$(wc -l < CLAUDE.md)" -lt 200
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**Checkpoint**

```bash
git add -- blueprints/direccion-jaime CLAUDE.md AGENTS.md .claude/settings.json .claude/rules/direccion.md
git commit -m "E1-T1 (step 1): rama direccion-jaime, bundle y workspace fusionado"
git tag step-01-direccion-base
git ls-files --error-unmatch blueprints/direccion-jaime/blueprint.md   # expect: exit 0 — el bundle quedó commiteado
git ls-files --error-unmatch .claude/rules/direccion.md                # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects blueprints/summum-improvement   # expect: exit 0 — el WIP del usuario no entró
```

Run them after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target. Never invent the tag: copy the `checkpoint` field.

### `E1-T2` — Agregar el esquema de Dirección con su RLS

**Depends on:** `E1-T1` · **Priority:** p0

1. Edita `packages/db/src/schema.ts`: agrega `date` al import de `drizzle-orm/pg-core`; en `orgNeed`,
   después de `referralNote`, `ownerProfileId: uuid("owner_profile_id").references(() => profile.id, { onDelete: "set null" })`
   y `priorityWeek: date("priority_week")`, y en su arreglo de índices
   `index("idx_org_need_org_priority").on(t.orgId, t.priorityWeek)`; al final del archivo las tres
   constantes y las cinco tablas tal como están en `blueprint.md` §4 *Schema* (si lo abres para copiar el
   bloque, cópialo literal: nombres de columna, `mode: "number"`, `unique(...)`, los `check`).
2. `pnpm db:generate` — no edites el archivo que emite.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=direccion_rls` y pega en el
   `*_direccion_rls.sql` vacío el SQL de RLS de `blueprint.md` §4, completo: una política SELECT por
   tabla que sigue los grants (`pt.grants->>'vision'`, `'scorecard'` con su rama `propio` por
   `owner_profile_id = auth.uid()`, `'junta'`; `meeting_rating` vía `exists (select 1 from meeting …)`),
   con `left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id`, y
   `grant select on … to authenticated`.
4. Escribe `apps/improvement/tests/direccion-schema.test.ts` copiando el patrón de
   `tests/muelle-schema.test.ts` (`asUser(userId, query)` con `set_config('role','authenticated', true)`
   y `request.jwt.claims`). Cada prueba crea su org y profiles y los borra en `afterEach`: primero el org
   (cascade), después los profiles (las FK `no action` a `profile` lo exigen). Para la rama `propio`,
   crea un `permission_type` con `grants: { scorecard: "propio" }` y dos medibles (uno del empleado, uno
   del dueño).
5. **Aprobación:** muestra a Jose Carlos los dos SQL nuevos y pídele un "sí" explícito en el chat. Sin
   "sí", detente y reporta. `pnpm db:migrate` te pedirá confirmación de todos modos (`permissions.ask`).
6. `pnpm db:migrate`. No lo repitas en el Verify: la prueba de esquema ya demuestra que se aplicó.

**Files**
- `packages/db/src/schema.ts` — edit
- `packages/db/migrations/**` — new: la migración que emite `pnpm db:generate`, el `*_direccion_rls.sql` de `--custom` y su `meta/`
- `apps/improvement/tests/direccion-schema.test.ts` — new

**Acceptance**

1. **WHEN** `pnpm --filter improvement test tests/direccion-schema.test.ts` corre **THE SYSTEM SHALL** insertar y leer de vuelta una fila en `org_vision`, `org_measurable`, `measurable_value`, `meeting` y `meeting_rating`, y una fila de `org_need` con `owner_profile_id` y `priority_week` llenos.
2. **WHEN** se inserta una segunda `org_vision` del mismo org, un segundo `measurable_value` de la misma (medible, semana), un `meeting_rating` con `rating` 11, o un `measurable_value` cuyo `week_start` no es lunes **THE SYSTEM SHALL** rechazar cada insert en la base.
3. **WHEN** un empleado sin tipo de permiso consulta `org_vision`, `org_measurable`, `measurable_value`, `meeting` y `meeting_rating` como rol `authenticated` **THE SYSTEM SHALL** devolver 0 filas en cada una, y **WHEN** el dueño del org consulta **THE SYSTEM SHALL** devolver las filas de su org.
4. **WHEN** un empleado con grants `{"scorecard":"propio"}` consulta `org_measurable` y `measurable_value` como rol `authenticated` **THE SYSTEM SHALL** devolver solo las filas de los medibles cuyo `owner_profile_id` es él.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**

```bash
pnpm --filter improvement test tests/direccion-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/direccion-schema.test.ts
git commit -m "E1-T2 (step 2): esquema de Dirección con RLS en el mismo cambio"
git tag step-02-direccion-esquema
git ls-files --error-unmatch apps/improvement/tests/direccion-schema.test.ts   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

### `E1-T3` — Registrar las cuatro secciones de Dirección

**Depends on:** `E1-T2` — no empieza mientras el paso 2 espera el "sí" de la migración · **Priority:** p0

En `sections.ts`, agrega los cuatro slugs **al final** de `SECTION_SLUGS` y cuatro entradas al final de
`SECTIONS`: `vision` "Visión" (`["empresa"]`), `scorecard` "Scorecard semanal" (`["empresa","propio"]`),
`issues` "Issues" (`["empresa","propio"]`), `junta` "Junta semanal" (`["empresa"]`), cada una con un
`hint` corto en español; exporta `DIRECCION_SLUGS = ["vision","scorecard","issues","junta"] as const` y
`type DireccionSlug`. `scopeFor` y las seis entradas existentes no se tocan; la pantalla de permisos y
Configuración ya iteran `SECTIONS`. En `nav.ts`, `loadDireccionNav` valida `orgId` con `z.uuid()` y
llama `findMembership`; cualquier falla → `[]`; si no, `loadVisibleSections` filtrado a
`DIRECCION_SLUGS`. Nunca lanza: lo usará el layout de **todas** las rutas `[org]`, incluidas las de
platform admin sin membresía. En `loadLobby.ts`, salta esos cuatro slugs al llenar `sueltas` (si no, la
recepción enlazaría `/[org]/vision`, que no existe); el epic 02 los reemplaza por una sola puerta.

**Files**
- `apps/improvement/server/permissions/sections.ts` — edit: 4 secciones + `DIRECCION_SLUGS`
- `apps/improvement/server/direccion/nav.ts` — new
- `apps/improvement/server/lobby/loadLobby.ts` — edit: omitir los 4 slugs de `sueltas`
- `apps/improvement/tests/direccion-permissions.test.ts` — new

**Acceptance**

1. **WHEN** `scopeFor("owner", null, slug)` corre para `vision`, `scorecard`, `issues` y `junta` **THE SYSTEM SHALL** devolver `empresa` en las cuatro, y **WHEN** `scopeFor("employee", null, slug)` corre para las mismas **THE SYSTEM SHALL** devolver `ninguno`.
2. **WHEN** `grantsSchema` valida `{"vision":"propio"}` o `{"junta":"area"}` **THE SYSTEM SHALL** rechazarlo, y **WHEN** valida `{"vision":"empresa","scorecard":"propio","issues":"propio","junta":"empresa"}` **THE SYSTEM SHALL** aceptarlo.
3. **WHEN** se lee `SECTION_SLUGS` **THE SYSTEM SHALL** ser exactamente `mapa`, `objetivos`, `equipo`, `clientes`, `powerups`, `cobros`, `vision`, `scorecard`, `issues`, `junta`, en ese orden, y `DIRECCION_SLUGS` SHALL ser `vision`, `scorecard`, `issues`, `junta`.
4. **WHEN** `loadDireccionNav` corre para el dueño **THE SYSTEM SHALL** devolver las cuatro secciones en el orden de `DIRECCION_SLUGS`, y **WHEN** corre para alguien sin membresía en el org o con un `orgId` que no es uuid **THE SYSTEM SHALL** devolver `[]` sin lanzar.
5. **WHEN** `loadLobby` corre para el dueño **THE SYSTEM SHALL** no incluir `vision`, `scorecard`, `issues` ni `junta` en `sueltas` ni en `puertas`.
6. **WHEN** `pnpm --filter improvement test tests/permissions.test.ts tests/lobby.test.ts` corre **THE SYSTEM SHALL** salir con código 0 — las pruebas existentes de permisos y recepción sin cambios.

**Verify**

```bash
pnpm --filter improvement test tests/direccion-permissions.test.ts
pnpm --filter improvement test tests/permissions.test.ts tests/lobby.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/permissions/sections.ts apps/improvement/server/direccion/nav.ts apps/improvement/server/lobby/loadLobby.ts apps/improvement/tests/direccion-permissions.test.ts
git commit -m "E1-T3 (step 3): secciones vision, scorecard, issues y junta"
git tag step-03-direccion-secciones
git ls-files --error-unmatch apps/improvement/server/direccion/nav.ts   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

### `E1-T4` — Leer y editar la V/TO en el servidor

**Depends on:** `E1-T2`, `E1-T3` · **Priority:** p0

`vision.ts` exporta `VISION_SECTIONS = ["core_values","core_focus","ten_year_target","marketing_strategy","three_year_picture","one_year_plan"] as const`,
`getVision(userId, orgId): Promise<VisionView | null>` y
`updateVisionSection(userId, orgId, section: unknown, input: unknown): Promise<Result<VisionView>>`.
`getVision` empieza con `resolveSection(userId, orgId, "vision")` (`ninguno` → `null`) y devuelve
`{ coreValues, coreFocus, tenYearTarget, marketingStrategy, threeYearPicture, oneYearPlan, updatedAt, canEdit }`,
cada sección pasada por su esquema con `safeParse` (lo que no pasa se lee vacío; una lectura nunca
lanza). `updateVisionSection` empieza con `findOwnerMembership` (no dueño → `FORBIDDEN`), valida la
sección con `z.enum(VISION_SECTIONS)` y el contenido con su esquema:
`core_values` `z.array(z.string().trim().min(1).max(120)).min(1).max(7)`; `core_focus` `{ purpose, niche }` (1-280);
`ten_year_target` `{ goal (1-280), year (int 2000-2100, nullable) }`;
`marketing_strategy` `{ target_market (1-500), uniques (1-3 de 1-200), proven_process (≤500), guarantee (≤280) }`;
`three_year_picture` `{ date (z.iso.date() nullable), revenue (≤120), profit (≤120), looks_like (≤15 de 1-200) }`;
`one_year_plan` `{ date, revenue, profit, goals (≤7 de 1-200) }`. Escribe con
`db.insert(orgVision).values(...).onConflictDoUpdate({ target: orgVision.orgId, set: { <columna>, updatedBy, updatedAt } })`.

**Files**
- `apps/improvement/server/direccion/vision/vision.ts` — new
- `apps/improvement/tests/direccion-vision.test.ts` — new

**Acceptance**

1. **WHEN** el dueño llama `updateVisionSection` con la sección `core_values` y `["Servir","Cumplir"]` en un org sin visión **THE SYSTEM SHALL** crear exactamente una fila `org_vision` con esos valores y `updated_by` igual al dueño, y **WHEN** después la llama con `core_focus` **THE SYSTEM SHALL** actualizar esa misma fila sin crear otra.
2. **WHEN** un empleado, aun con grants `{"vision":"empresa"}`, llama `updateVisionSection` **THE SYSTEM SHALL** devolver `{ ok: false, error: { code: "FORBIDDEN" } }` y no escribir ninguna fila.
3. **WHEN** `updateVisionSection` recibe `core_values` con 8 elementos o una sección que no está en `VISION_SECTIONS` **THE SYSTEM SHALL** devolver `code: "VALIDATION_ERROR"` sin escribir.
4. **WHEN** un empleado con grants `{"vision":"empresa"}` llama `getVision` **THE SYSTEM SHALL** devolver la visión de su org, y **WHEN** la llama un empleado sin la sección `vision` **THE SYSTEM SHALL** devolver `null`.
5. **WHEN** alguien sin membresía en el org llama `getVision` **THE SYSTEM SHALL** lanzar el 404 de `assertMembership` (`notFound()`).
6. **WHEN** se busca un uuid literal en `apps/improvement/server/direccion/` **THE SYSTEM SHALL** no encontrar ninguno.

**Verify**

```bash
pnpm --filter improvement test tests/direccion-vision.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/direccion || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/direccion/vision/vision.ts apps/improvement/tests/direccion-vision.test.ts
git commit -m "E1-T4 (step 4): V/TO en el servidor"
git tag step-04-direccion-vision-server
git ls-files --error-unmatch apps/improvement/server/direccion/vision/vision.ts   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

### `E1-T5` — Pantalla de la V/TO y spec E2E de Dirección

**Depends on:** `E1-T4` · **Priority:** p0

`app/[org]/direccion/vision/page.tsx` es un Server Component: `const { membership } = await requireSection(orgId, "vision")`
primero, luego `getVision(membership.userId, orgId)`, `h1.config-title` "Visión", una `config-card` por
sección. Si `canEdit`, cada tarjeta es un `form` con su Server Action inline (`"use server"`,
`getSessionUserId()`, `updateVisionSection(actor, orgId, "<sección>", {...})`, `redirect` con
`?error=` en falla, `revalidatePath` + `redirect` en éxito — el patrón de `necesidades/page.tsx`); las
listas van en un `textarea` una por línea (`split("\n")`, sin vacías). Cada control con `label`.

`tests/e2e/direccion.spec.ts` es un spec nuevo (no toques `a11y.spec.ts`) en
`test.describe.configure({ mode: "serial" })`:

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, orgVision } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });
// beforeAll: createTestAuthUser para OWNER y EMPLOYEE (password crypto.randomUUID()), un organization
// con slug `direccion-e2e-${Date.now()}`, sus profile, membership (owner; employee SIN permissionTypeId),
// una fila org_vision con coreValues ["Servir","Cumplir"], y los dos tokens con signInTestUser.
// afterAll: delete organization (cascade), delete de los dos profile, deleteTestAuthUser de los dos.
// helper `as(context, token, baseURL)` → context.addCookies([{ name: "imp-access-token", value: token, url }]).
// axe: new AxeBuilder({ page }).analyze() y filtrar impact serious|critical === [] (como a11y.spec.ts).
```

Pruebas de esta tarea: dueño → `page.goto(`/${orgId}/direccion/vision`)` con `response.status()` 200,
`h1` "Visión", texto "Servir"; axe sin serious/critical; dueño llena el `textarea` de valores con
`Honestidad\nServicio`, envía y ve ambos; empleado → status 404.

**Files**
- `apps/improvement/app/[org]/direccion/vision/page.tsx` — new
- `apps/improvement/tests/e2e/direccion.spec.ts` — new

**Acceptance**

1. **WHEN** el dueño abre `/[org]/direccion/vision` **THE SYSTEM SHALL** responder 200 con un `h1` `Visión` y mostrar los valores centrales sembrados en `org_vision`.
2. **WHEN** axe-core audita `/[org]/direccion/vision` con la sesión del dueño **THE SYSTEM SHALL** reportar 0 violaciones de impacto serious o critical.
3. **WHEN** un empleado sin la sección `vision` abre `/[org]/direccion/vision` **THE SYSTEM SHALL** responder 404.
4. **WHEN** el dueño envía el formulario de valores centrales con dos líneas **THE SYSTEM SHALL** mostrar los dos valores después de la redirección.

**Verify**

```bash
pnpm --filter improvement test:e2e direccion.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/direccion/vision/page.tsx" apps/improvement/tests/e2e/direccion.spec.ts
git commit -m "E1-T5 (step 5): pantalla de la V/TO"
git tag step-05-direccion-vision-pagina
git ls-files --error-unmatch apps/improvement/tests/e2e/direccion.spec.ts   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

### `E1-T6` — Motor del Scorecard semanal

**Depends on:** `E1-T2`, `E1-T3` · **Priority:** p0

`week.ts` es puro (sin base, sin `next/*`): `SCORECARD_WEEKS = 13`; `weekStart(now)` con esta
implementación exacta (ejecutada en Node 24.19.0 contra los cuatro casos de abajo):

```ts
const OFFSET: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
});
export function weekStart(now: Date): string {
  const p = Object.fromEntries(FMT.formatToParts(now).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  d.setUTCDate(d.getUTCDate() - (OFFSET[p.weekday ?? "Mon"] ?? 0));
  return d.toISOString().slice(0, 10);
}
```

`recentWeeks(ws, n)` resta 7 días n-1 veces (más reciente primero); `isOnTrack(value, goal, dir)` =
`dir === "gte" ? value >= goal : value <= goal`.

`measurables.ts`: `listScorecard(userId, orgId, now = new Date())` empieza con
`resolveSection(…, "scorecard")`; `ninguno` → `{ currentWeek, weeks, rows: [], canDefine: false }`;
`propio` → solo `owner_profile_id = userId`; excluye `archived_at` no nulo; ordena por `position`; trae
los valores de las 13 semanas en una consulta (`inArray(measurableValue.weekStart, weeks)`); `canEnter`
= `empresa` o responsable; `canDefine` = rol dueño. `createMeasurable` y `archiveMeasurable` empiezan
con `findOwnerMembership` (`FORBIDDEN`); el responsable debe ser miembro del org (`NOT_FOUND`);
`position` = máximo + 1. `enterValue(userId, orgId, measurableId, input, now = new Date())`: medible del
org y no archivado (`NOT_FOUND`), alcance (`propio` sin ser responsable → `FORBIDDEN`), `weekStart` lunes
(`weekStart(new Date(`${ws}T12:00:00Z`)) === ws`) y `<= weekStart(now)` (`VALIDATION_ERROR`), `value`
`z.coerce.number().finite()`; upsert por (`measurableId`, `weekStart`) que reescribe `value`,
`enteredBy`, `enteredAt`. Las pruebas de integración inyectan `now`.

**Files**
- `apps/improvement/server/direccion/scorecard/week.ts` — new
- `apps/improvement/server/direccion/scorecard/measurables.ts` — new
- `apps/improvement/tests/direccion-week.test.ts` — new
- `apps/improvement/tests/direccion-scorecard.test.ts` — new

**Acceptance**

1. **WHEN** `weekStart` recibe `2026-10-26T05:59:00Z` (domingo 23:59 en Ciudad de México) **THE SYSTEM SHALL** devolver `2026-10-19`; con `2026-10-26T06:00:00Z` SHALL devolver `2026-10-26`; con `2026-04-06T05:59:00Z` (el antiguo horario de verano) SHALL devolver `2026-03-30`; con `2027-01-01T03:00:00Z` SHALL devolver `2026-12-28`.
2. **WHEN** `recentWeeks("2026-10-19", 13)` se evalúa **THE SYSTEM SHALL** devolver 13 lunes de `2026-10-19` a `2026-07-27`, del más reciente al más viejo, y `isOnTrack` SHALL dar `true` para (10, 10, `gte`) y (10, 10, `lte`) y `false` para (9, 10, `gte`) y (11, 10, `lte`).
3. **WHEN** un empleado con grants `{"scorecard":"propio"}` llama `enterValue` sobre un medible de otra persona **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"` sin escribir, sobre el suyo SHALL guardar el valor, y **WHEN** un empleado con `{"scorecard":"empresa"}` captura en cualquier medible SHALL guardarlo.
4. **WHEN** se captura dos veces la misma (medible, semana) **THE SYSTEM SHALL** dejar una sola fila `measurable_value` con el último valor.
5. **WHEN** `enterValue` recibe un `weekStart` que no es lunes o que es posterior a la semana actual **THE SYSTEM SHALL** devolver `code: "VALIDATION_ERROR"`, y **WHEN** un empleado llama `createMeasurable` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`.
6. **WHEN** el dueño archiva un medible **THE SYSTEM SHALL** conservar sus filas `measurable_value` y `listScorecard` SHALL dejar de incluirlo, y **WHEN** un empleado con `{"scorecard":"propio"}` llama `listScorecard` **THE SYSTEM SHALL** devolver solo sus medibles, con 13 semanas en `weeks`.

**Verify**

```bash
pnpm --filter improvement test tests/direccion-week.test.ts tests/direccion-scorecard.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/direccion || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/direccion/scorecard apps/improvement/tests/direccion-week.test.ts apps/improvement/tests/direccion-scorecard.test.ts
git commit -m "E1-T6 (step 6): motor del Scorecard semanal"
git tag step-06-direccion-scorecard-server
git ls-files --error-unmatch apps/improvement/server/direccion/scorecard/week.ts   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test tests/direccion-schema.test.ts tests/direccion-permissions.test.ts tests/direccion-vision.test.ts tests/direccion-week.test.ts tests/direccion-scorecard.test.ts` corre **THE SYSTEM SHALL** salir con código 0 contra el Supabase compartido ya migrado.
2. **WHEN** un empleado sin tipo de permiso abre `/[org]/direccion/vision` **THE SYSTEM SHALL** responder 404, aunque la tabla `org_vision` de su org tenga fila.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e direccion.spec.ts
```

## Pitfalls

- **Tratar RLS como respaldo del guard** — en el camino de la app RLS no corre; una función sin
  `resolveSection` fuga aunque la política exista.
- **Borrar el profile antes que el org en una prueba** — las FK `no action` de `org_measurable`,
  `measurable_value` y `meeting_rating` lo rechazan; borra primero el org (cascade).
- **Editar la migración generada** — solo el `*_direccion_rls.sql` de `--custom` se escribe a mano.
- **Correr `db:migrate` sin el "sí"** — es una base compartida con datos reales.
- **Un servidor ya levantado en el puerto 3200** — Playwright lo reusa (`reuseExistingServer` fuera de
  CI); si es un `pnpm dev:improvement` de otra rama, el e2e prueba código ajeno. Apágalo antes del e2e.
- **`getDay()`** — cualquier lunes calculado fuera de `weekStart()` rompe la semana del domingo en la noche.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-direccion-*'` lista de `step-01-direccion-base` a `step-06-direccion-scorecard-server`.
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` sin cambios — este cambio no agrega variables.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
