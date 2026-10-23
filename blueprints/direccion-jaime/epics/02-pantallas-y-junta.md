# Epic 02: Pantallas, Issues y Junta L10

> Al terminar existen las pantallas del Scorecard y de Issues, el motor y la pantalla de la Junta L10,
> la tarjeta `Junta pendiente` en la recepción, el hub `/[org]/direccion` y su entrada de navegación,
> con el gate completo en verde.

| | |
|---|---|
| **Epic id** | `02-pantallas-y-junta` |
| **Tasks** | `E2-T1` … `E2-T6` |
| **Depends on** | `01-cimientos-y-motor` |
| **Unlocks** | nada — es el último |
| **Parallel with** | nada |

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
| E2E (un spec / todo) | `pnpm --filter improvement test:e2e direccion.spec.ts` · `pnpm --filter improvement test:e2e` |
| Build | `pnpm build` |
| Local services | NOT APPLICABLE — no hay servicios locales: la base es el Supabase compartido, con las llaves en `apps/improvement/.env.test` y el `.env.local` de la raíz |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

Este epic **no migra nada**: el esquema completo llegó en `E1-T2`. **Nunca `git add -A`**: el árbol trae
WIP del usuario (`apps/admin/*`, `.claude/launch.json`, `projects/`, `blueprints/summum-improvement/`).
Cada Checkpoint nombra sus rutas; las que tienen corchetes van con `":(literal)…"`.

## Directory subtree

Only the parts this epic touches:

```
apps/improvement/
  app/
    globals.css                               # exists, you will edit it (E2-T1): 3 clases, solo var(--token)
    [org]/
      layout.tsx                              # exists, you will edit it (E2-T6)
      direccion/page.tsx                      # NEW (E2-T6) — hub
      direccion/vision/page.tsx               # exists from E1-T5, read-only
      direccion/scorecard/page.tsx            # NEW (E2-T1)
      direccion/issues/page.tsx               # NEW (E2-T3)
      direccion/junta/page.tsx                # NEW (E2-T5)
      necesidades/page.tsx                    # exists, read-only — patrón de Server Actions; debe seguir en 200
    empresas/[orgId]/page.tsx                 # exists, you will edit it (E2-T5): tarjeta "Junta pendiente"
    empresas/[orgId]/BuildingExperience.tsx   # exists, read-only (enlaza sueltas como /${orgId}/${slug})
  server/
    direccion/nav.ts                          # exists from E1-T3, read-only
    direccion/scorecard/{week,measurables}.ts # exist from E1-T6, read-only
    direccion/issues/issues.ts                # NEW (E2-T2)
    direccion/meetings/agenda.ts              # NEW (E2-T4)
    direccion/meetings/meetings.ts            # NEW (E2-T4)
    lobby/loadLobby.ts                        # exists, you will edit it (E2-T6)
    needs/mutations.ts                        # exists, read-only (createNeed, listNeeds, referNeedToSummum)
    objectives/mutations.ts                   # exists, read-only (createObjective, listObjectives)
    employees/teammates.ts                    # exists, read-only (listTeammates)
    areas/listAreas.ts                        # exists, read-only (listAreasByOrg)
  tests/
    direccion-issues.test.ts                  # NEW (E2-T2)
    direccion-meetings.test.ts                # NEW (E2-T4)
    direccion-lobby.test.ts                   # NEW (E2-T6)
    lobby.test.ts, objectives.test.ts         # exist, read-only — deben seguir pasando
    e2e/direccion.spec.ts                     # exists from E1-T5, you will extend it (E2-T1, T3, T5, T6)
    e2e/a11y.spec.ts                          # exists, read-only — debe seguir pasando
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `org_measurable`, `measurable_value` | lectura/escritura vía `measurables.ts` | Ya migradas en E1-T2 |
| `org_need` | `owner_profile_id`, `priority_week` (nuevas, nulas), `status` (`abierta`\|`en_progreso`\|`resuelta`; `derivada` fuera de Dirección), `title`, `detail`, `severity`, `area_id` | `status` ES el flujo IDS: Identificar / Discutir / Resolver |
| `objective` | inserción solo vía `createObjective()`; lectura vía `listObjectives()` | Un pendiente es un objetivo con `need_id` |
| `meeting` | `scheduled_for`, `started_at`, `ended_at`, `facilitator_profile_id`, `current_block`, `notes`, `created_by` | Un solo dispositivo |
| `meeting_rating` | `meeting_id`, `profile_id`, `rating` 1-10, unique (`meeting_id`,`profile_id`) | Upsert |

`MEETING_BLOCKS` (de `@jotapuntoce/db/schema`): `segue`, `scorecard`, `rocks`, `headlines`, `todos`,
`ids`, `conclude`.

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/auth/guard.ts` → `requireSection(orgId, section)`, `requireOrgMembership(orgId)`, `resolveSection`, `findOwnerMembership`, `getSessionUserId` | 404 nunca 403; `resolveSection` devuelve `{ membership, scope }` |
| repo | `server/objectives/mutations.ts` → `createObjective(userId, orgId, input)` | Solo dueño (`FORBIDDEN`); valida área, necesidad y persona contra el org |
| repo | `server/objectives/mutations.ts` → `listObjectives(userId, orgId, { limit })` | Respeta el alcance `objetivos` de la persona; máx. 100 |
| repo | `server/needs/mutations.ts` → `createNeed(userId, orgId, input)`, `listNeeds`, `referNeedToSummum`, `summumBrief` | Solo dueño; **no se editan** |
| `01-cimientos-y-motor` | `server/direccion/scorecard/week.ts` → `weekStart(now)`, `recentWeeks`, `SCORECARD_WEEKS`, `isOnTrack` | Lunes en America/Mexico_City, `YYYY-MM-DD` |
| `01-cimientos-y-motor` | `server/direccion/scorecard/measurables.ts` → `listScorecard(userId, orgId, now?)`, `createMeasurable`, `archiveMeasurable`, `enterValue(userId, orgId, measurableId, { weekStart, value }, now?)` | `ScorecardView = { currentWeek, weeks, rows[{ id, title, ownerProfileId, ownerName, goal, goalDirection, unit, values: Record<week, { value, onTrack }>, canEnter }], canDefine }` |
| `01-cimientos-y-motor` | `server/direccion/nav.ts` → `loadDireccionNav(userId, orgId)` | `VisibleSection[]` de Dirección; nunca lanza |
| `01-cimientos-y-motor` | `server/permissions/sections.ts` → `DIRECCION_SLUGS` | `["vision","scorecard","issues","junta"]` |
| `01-cimientos-y-motor` | `tests/e2e/direccion.spec.ts` | serial; dueño + empleado sin tipo + org; helper de cookie `imp-access-token` |

**Produced** — later work depends on exactly these signatures:

| Export | Signature | Used by |
|---|---|---|
| `server/direccion/issues/issues.ts` → `ISSUE_TRANSITIONS` | `{ abierta: ["en_progreso"], en_progreso: ["abierta","resuelta"], resuelta: [], derivada: [] }` | E2-T3 |
| … → `listIssues` | `(userId, orgId, now?: Date) => Promise<IssuesView>` | E2-T3, E2-T4 |
| … → `createIssue`, `setIssueOwner`, `setIssuePriority`, `moveIssue`, `createTodoFromIssue` | ver E2-T2 | E2-T3, E2-T4 |
| `server/direccion/meetings/agenda.ts` → `AGENDA`, `AGENDA_TOTAL_MINUTES`, `nextBlock`, `MeetingBlock` | ver E2-T4 | E2-T5 |
| `server/direccion/meetings/meetings.ts` → `listMeetings`, `createMeeting`, `startMeeting`, `advanceBlock`, `saveBlockNotes`, `rateMeeting`, `closeMeeting`, `addMeetingTodo`, `loadMeetingView`, `isMeetingPending` | ver E2-T4 | E2-T5 |

## Conventions that bite in this area

- **Página → `requireSection(orgId, slug)` primero.** Server Actions inline (`"use server"`) que
  resuelven el actor con `getSessionUserId()`, llaman a `server/direccion/**`, y hacen `redirect` con
  `?error=` en falla o `revalidatePath` + `redirect` en éxito — el patrón de `necesidades/page.tsx`.
- **Un pendiente se crea SOLO con `createObjective()`.** Nunca `db.insert(objective)` en Dirección.
- **On-track con texto:** `En meta` / `Fuera de meta` además de `var(--success)` / `var(--danger)`.
- **Ningún hex nuevo** en `globals.css` ni en ningún `.tsx`.
- **Contenedores desplazables con foco:** `tabIndex={0}`, `role="region"` y `aria-label`, o axe reporta
  `scrollable-region-focusable` (serious).
- **El spec e2e corre en serie** y sus pruebas mutan lo que siembra: agrega las pruebas nuevas en el
  orden en que se usan los datos (la tarjeta antes del cierre de la junta).
- **Import relativo con `.ts` explícito; `@/` solo en páginas; el spec e2e nunca importa `@/` ni un
  módulo que use `next/*`** — solo paquetes y el módulo puro `week.ts`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/direccion.md`,
`.claude/rules/tokens-de-diseno.md`, `.claude/rules/motor-generico.md`. All sit in the project root.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick.

### `E2-T1` — Pantalla del Scorecard semanal

**Depends on:** `E1-T5`, `E1-T6` · **Priority:** p0

`scorecard/page.tsx`: `requireSection(orgId, "scorecard")`, `listScorecard(userId, orgId)`. `h1`
"Scorecard semanal". La tabla `table.config-table` va dentro de
`<div className="scorecard-scroll" tabIndex={0} role="region" aria-label="Scorecard, 13 semanas">`, con
`caption`, `thead` (`th scope="col"` Medible, Responsable, Meta y 13 `th scope="col" data-week={ws}` en
el orden de `weeks`, la actual primero) y una fila por medible (`th scope="row"` con el título). Cada
celda con valor muestra el número con `Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 })`
(`$` delante si `dinero`, `%` detrás si `porcentaje`) y un `span.scorecard-ok` `En meta` o
`span.scorecard-off` `Fuera de meta`; sin valor, "—". Formularios: "Capturar valor" por fila con
`canEnter` (select de las 13 semanas, `input type="number" step="0.01"`); si `canDefine`, "Nuevo
medible" (título, responsable de `listTeammates`, meta, dirección, unidad) y "Archivar" por fila. En
`globals.css` agrega solo:

```css
/* Dirección — scorecard (blueprint direccion-jaime §7). Solo tokens. */
.scorecard-scroll { overflow-x: auto; }
.scorecard-ok { color: var(--success); font-weight: 600; }
.scorecard-off { color: var(--danger); font-weight: 600; }
```

En el spec: `import { weekStart } from "../../server/direccion/scorecard/week.ts";` y, en `beforeAll`,
siembra `Ventas cerradas` (`gte`, meta 10, responsable el dueño, valor 12 en `weekStart(new Date())`) y
`Quejas` (`lte`, meta 2, responsable el dueño, valor 5, misma semana). Pruebas: 200 + 13
`th[data-week]` con el primero igual a `weekStart(new Date())`; `En meta` en la fila de Ventas y
`Fuera de meta` en la de Quejas; axe; captura de 7 en Ventas para la semana actual → la celda muestra
`7`; empleado → 404.

**Files**
- `apps/improvement/app/[org]/direccion/scorecard/page.tsx` — new
- `apps/improvement/app/globals.css` — edit: 3 clases
- `apps/improvement/tests/e2e/direccion.spec.ts` — edit: siembra y pruebas del scorecard

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el dueño abre `/[org]/direccion/scorecard` **THE SYSTEM SHALL** responder 200 con una tabla de 13 encabezados `th[data-week]`, el primero con `data-week` igual a `weekStart(new Date())`.
2. **WHEN** un medible `gte` con meta 10 tiene valor 12 en la semana actual **THE SYSTEM SHALL** mostrar el texto `En meta` en esa celda, y **WHEN** un medible `lte` con meta 2 tiene valor 5 **THE SYSTEM SHALL** mostrar `Fuera de meta`.
3. **WHEN** axe-core audita `/[org]/direccion/scorecard` con la sesión del dueño **THE SYSTEM SHALL** reportar 0 violaciones de impacto serious o critical.
4. **WHEN** un empleado sin la sección `scorecard` abre `/[org]/direccion/scorecard` **THE SYSTEM SHALL** responder 404.
5. **WHEN** el dueño captura 7 en el medible `Ventas cerradas` para la semana actual con el formulario **THE SYSTEM SHALL** mostrar `7` en la celda de esa semana después de la redirección.
6. **WHEN** se revisan las líneas agregadas a `apps/improvement/app/globals.css` **THE SYSTEM SHALL** no encontrar ningún valor hex nuevo — solo `var(--token)`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test:e2e direccion.spec.ts
d="$(git diff HEAD -- apps/improvement/app/globals.css)" && { status=0; printf '%s\n' "$d" | grep -E '^\+.*#[0-9a-fA-F]{3,8}' || status=$?; test "$status" -eq 1; }
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/direccion/scorecard/page.tsx" apps/improvement/app/globals.css apps/improvement/tests/e2e/direccion.spec.ts
git commit -m "E2-T1 (step 7): pantalla del Scorecard semanal"
git tag step-07-direccion-scorecard-pagina
git ls-files --error-unmatch -- ":(literal)apps/improvement/app/[org]/direccion/scorecard/page.tsx"   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

Run them after the last `Verify` command exits 0, before starting the next task. The tag is this
task's rollback target. Never invent the tag: copy the `checkpoint` field.

### `E2-T2` — Motor de Issues e IDS sobre org_need

**Depends on:** `E1-T2`, `E1-T3`, `E1-T6` · **Priority:** p0

`issues.ts` sobre `org_need`, sin tabla nueva y sin editar `server/needs/mutations.ts`:

- `listIssues(userId, orgId, now = new Date())`: `resolveSection(…, "issues")`; `ninguno` →
  `issues: []`; `propio` → `owner_profile_id = userId`; siempre `eq(orgNeed.orgId, orgId)` y
  `status <> 'derivada'`; left join a `area` y `profile` para `areaName`/`ownerName`; ordena por
  `onPriorityList` primero y luego `severity` desc. `onPriorityList = priorityWeek === weekStart(now)`.
  `canManage` = dueño o `empresa`; `canCreate` = dueño.
- `createIssue(userId, orgId, input)`: zod `{ title, detail, areaId, severity, ownerProfileId }`; llama
  `createNeed(userId, orgId, { title, detail, areaId, severity, source: "dueno" })` (ya exige dueño y
  valida el área) y, si viene `ownerProfileId` miembro del org, lo fija con un `update`.
- `setIssueOwner`, `setIssuePriority(userId, orgId, issueId, onList, now = new Date())`: dueño o
  `empresa` (`FORBIDDEN`); `priority_week = onList ? weekStart(now) : null`.
- `moveIssue(userId, orgId, issueId, to)`: `to` en `z.enum(["abierta","en_progreso","resuelta"])`; lee
  el issue del org (`NOT_FOUND`); alcance (`propio` sin ser responsable → `FORBIDDEN`); si
  `!ISSUE_TRANSITIONS[actual].includes(to)` → `INVALID_TRANSITION`; `update` de `status` y `updatedAt`.
- `createTodoFromIssue(userId, orgId, issueId, input)`: zod `{ title, assignedEmployeeId, dueDate,
  impactWeight }`; lee el área del issue; llama `createObjective(userId, orgId, { title,
  description: null, impactWeight, dueDate, areaId, assignedEmployeeId, needId: issueId,
  kind: "non_ipa", evidenceType: "ninguna" })` y devuelve `{ objectiveId }`. El `FORBIDDEN` del
  empleado sale de `createObjective` mismo.

**Files**
- `apps/improvement/server/direccion/issues/issues.ts` — new
- `apps/improvement/tests/direccion-issues.test.ts` — new

**Acceptance**

1. **WHEN** `moveIssue` lleva un issue de `abierta` a `en_progreso` y luego a `resuelta` **THE SYSTEM SHALL** guardar cada estado, y **WHEN** intenta `abierta` → `resuelta` o mover un issue `derivada` **THE SYSTEM SHALL** devolver `code: "INVALID_TRANSITION"` sin escribir.
2. **WHEN** un empleado con grants `{"issues":"propio"}` mueve un issue del que no es responsable **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`, uno del que sí es responsable SHALL moverse, y **WHEN** un empleado sin la sección `issues` llama `listIssues` **THE SYSTEM SHALL** devolver `issues: []`.
3. **WHEN** `setIssuePriority` corre con `true` **THE SYSTEM SHALL** guardar `priority_week` igual a `weekStart(now)` y `listIssues` SHALL marcar ese issue con `onPriorityList: true`, y **WHEN** corre con `false` SHALL dejar `priority_week` en null.
4. **WHEN** el dueño llama `createTodoFromIssue` **THE SYSTEM SHALL** crear exactamente un `objective` con `need_id` igual al issue y `status` `pending`, y **WHEN** lo llama un empleado **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"` sin crear nada.
5. **WHEN** `referNeedToSummum` corre sobre un issue creado con `createIssue` **THE SYSTEM SHALL** dejarlo con `status` `derivada` y `referred_at` no nulo, y `listNeeds` SHALL seguir devolviéndolo con el mismo `title`, `detail` y `severity` y con `source` `dueno`.
6. **WHEN** se busca un uuid literal en `apps/improvement/server/direccion/` **THE SYSTEM SHALL** no encontrar ninguno.

**Verify**

```bash
pnpm --filter improvement test tests/direccion-issues.test.ts
pnpm --filter improvement test tests/objectives.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/direccion || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/direccion/issues/issues.ts apps/improvement/tests/direccion-issues.test.ts
git commit -m "E2-T2 (step 8): Issues e IDS sobre org_need"
git tag step-08-direccion-issues-server
git ls-files --error-unmatch apps/improvement/server/direccion/issues/issues.ts   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

### `E2-T3` — Pantalla de Issues

**Depends on:** `E2-T1`, `E2-T2` · **Priority:** p0

`issues/page.tsx`: `requireSection(orgId, "issues")`, `listIssues`. Tres `section` con `h2`
`Identificar` (`abierta`), `Discutir` (`en_progreso`), `Resolver` (`resuelta`); cada issue en una
`config-card` con título, severidad (`SEVERITY_LABEL` de `server/needs/mutations.ts`), área, responsable
y un botón de transición según `ISSUE_TRANSITIONS` (`Pasar a discutir`, `Marcar resuelto`,
`Volver a identificar`). Si `canManage`: selector de responsable (`listTeammates`) y
`Agregar a la lista de la semana` / `Quitar de la lista`. Si `canCreate`: formulario "Nuevo issue" y, por
issue, "Pendiente nuevo" (título, responsable, fecha `type="date"`, peso 0-100). En el spec: siembra un
`org_need` `abierta`, `source: "dueno"`, `ownerProfileId` el dueño; pruebas: columnas + issue bajo
Identificar; axe; `Pasar a discutir` → bajo Discutir; "Pendiente nuevo" → `db.select().from(objective).where(eq(objective.needId, issueId))`
tiene longitud 1; `/${orgId}/necesidades` status 200; empleado → 404.

**Files**
- `apps/improvement/app/[org]/direccion/issues/page.tsx` — new
- `apps/improvement/tests/e2e/direccion.spec.ts` — edit

**Acceptance**

1. **WHEN** el dueño abre `/[org]/direccion/issues` **THE SYSTEM SHALL** responder 200 con las columnas `Identificar`, `Discutir` y `Resolver`, y el issue sembrado bajo `Identificar`.
2. **WHEN** axe-core audita `/[org]/direccion/issues` con la sesión del dueño **THE SYSTEM SHALL** reportar 0 violaciones de impacto serious o critical.
3. **WHEN** un empleado sin la sección `issues` abre `/[org]/direccion/issues` **THE SYSTEM SHALL** responder 404.
4. **WHEN** el dueño pulsa `Pasar a discutir` en el issue sembrado **THE SYSTEM SHALL** mostrarlo bajo `Discutir` después de la redirección.
5. **WHEN** el dueño crea un pendiente desde ese issue con el formulario **THE SYSTEM SHALL** dejar exactamente un `objective` con `need_id` igual al issue.
6. **WHEN** el dueño abre `/[org]/necesidades` **THE SYSTEM SHALL** responder 200 — la pantalla existente sigue en pie con las columnas nuevas de `org_need`.

**Verify**

```bash
pnpm --filter improvement test:e2e direccion.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/direccion/issues/page.tsx" apps/improvement/tests/e2e/direccion.spec.ts
git commit -m "E2-T3 (step 9): pantalla de Issues"
git tag step-09-direccion-issues-pagina
git ls-files --error-unmatch -- ":(literal)apps/improvement/app/[org]/direccion/issues/page.tsx"   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

### `E2-T4` — Motor de la Junta L10

**Depends on:** `E1-T6`, `E2-T2` · **Priority:** p0

`agenda.ts` (puro): `import { MEETING_BLOCKS } from "@jotapuntoce/db/schema";`,
`type MeetingBlock = (typeof MEETING_BLOCKS)[number]`, un `Record<MeetingBlock, { label: string; minutes: number }>`
con `segue` "Buenas noticias" 5, `scorecard` "Scorecard" 5, `rocks` "Rocas" 5, `headlines` "Titulares" 5,
`todos` "Pendientes" 5, `ids` "IDS" 60, `conclude` "Cierre" 5; `AGENDA = MEETING_BLOCKS.map((block) => ({ block, ...BLOQUES[block] }))`;
`AGENDA_TOTAL_MINUTES = AGENDA.reduce((s, b) => s + b.minutes, 0)` (nunca un literal); `nextBlock(b)` =
el siguiente o `null`.

`meetings.ts`: cada función empieza con `resolveSection(userId, orgId, "junta")` y trata `ninguno` como
`FORBIDDEN` (escrituras) o vacío (lecturas). `createMeeting({ scheduledFor })` con `scheduledFor`
`YYYY-MM-DDTHH:mm` → `new Date(`${v}:00-06:00`)` y un comentario
`// ponytail: Ciudad de México fija (sin horario de verano desde 2022); zona por org cuando llegue otro huso`;
facilitador y creador = actor. `startMeeting` (`ALREADY_STARTED`) fija `started_at` y `current_block =
"segue"`. `advanceBlock` (`NOT_STARTED`, `ALREADY_ENDED`, `LAST_BLOCK` en `conclude`). `saveBlockNotes`
(bloque en `z.enum(MEETING_BLOCKS)`, texto ≤ 4000; `notes = { ...notes, [bloque]: texto }`).
`rateMeeting` (rating `z.coerce.number().int().min(1).max(10)`; `profileId` miembro del org o
`NOT_FOUND`; upsert por `uq_meeting_rating_person`). `closeMeeting` (`NOT_READY` sin `started_at`, fuera
de `conclude` o sin calificaciones; fija `ended_at`; `averageRating = Math.round(promedio * 10) / 10`).
`addMeetingTodo({ title, assignedEmployeeId, dueDate, impactWeight, issueId })` → con `issueId`,
`createTodoFromIssue`; sin él, `createObjective` con `needId: null`. `loadMeetingView` (null si la junta
no es del org) = `{ meeting, agenda: AGENDA, scorecard: await listScorecard(...), rocks, todos, issues,
ratings, averageRating }` con los objetivos abiertos de `listObjectives(…, { limit: 100 })` partidos en
`todos` (`dueDate <= now + 7 días`) y `rocks` (el resto), e `issues` = `listIssues` sin `resuelta`.
`isMeetingPending(userId, orgId, now = new Date())`: `ninguno` → `false`; última junta del org con
`ended_at` no nulo; pendiente = no hay o `weekStart(endedAt) !== weekStart(now)`. `listMeetings`: las
últimas 10 por `scheduled_for` desc con su promedio.

**Files**
- `apps/improvement/server/direccion/meetings/agenda.ts` — new
- `apps/improvement/server/direccion/meetings/meetings.ts` — new
- `apps/improvement/tests/direccion-meetings.test.ts` — new

**Acceptance**

1. **WHEN** se lee `AGENDA` **THE SYSTEM SHALL** listar `segue`, `scorecard`, `rocks`, `headlines`, `todos`, `ids` y `conclude` en ese orden con 5, 5, 5, 5, 5, 60 y 5 minutos — `AGENDA_TOTAL_MINUTES` igual a 90 — y `nextBlock("conclude")` SHALL ser `null`.
2. **WHEN** un empleado sin la sección `junta` llama `createMeeting` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"`, y **WHEN** el dueño crea, inicia y avanza una junta seis veces **THE SYSTEM SHALL** dejar `current_block` en `conclude` y una séptima vez SHALL devolver `code: "LAST_BLOCK"`.
3. **WHEN** `closeMeeting` corre sin calificaciones o antes de `conclude` **THE SYSTEM SHALL** devolver `code: "NOT_READY"` y dejar `ended_at` en null, y **WHEN** corre con calificaciones 8 y 10 **THE SYSTEM SHALL** fijar `ended_at` y devolver `averageRating` 9.
4. **WHEN** `rateMeeting` recibe 0, 11 o un `profileId` de otro org **THE SYSTEM SHALL** rechazarlo sin escribir, y **WHEN** la misma persona califica dos veces **THE SYSTEM SHALL** dejar una sola fila con la última calificación.
5. **WHEN** `addMeetingTodo` corre con un `issueId` **THE SYSTEM SHALL** crear un `objective` con ese `need_id`, y **WHEN** `loadMeetingView` corre **THE SYSTEM SHALL** incluir el medible del org con su valor de la semana actual, los objetivos abiertos y los issues abiertos.
6. **WHEN** no hay junta terminada en la semana actual **THE SYSTEM SHALL** que `isMeetingPending` devuelva `true`, y **WHEN** hay una con `ended_at` en la semana actual **THE SYSTEM SHALL** devolver `false`.

**Verify**

```bash
pnpm --filter improvement test tests/direccion-meetings.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/direccion || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/direccion/meetings apps/improvement/tests/direccion-meetings.test.ts
git commit -m "E2-T4 (step 10): motor de la Junta L10"
git tag step-10-direccion-junta-server
git ls-files --error-unmatch apps/improvement/server/direccion/meetings/agenda.ts   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

### `E2-T5` — Pantalla de la Junta y tarjeta de junta pendiente

**Depends on:** `E2-T3`, `E2-T4` · **Priority:** p0

`junta/page.tsx`: `requireSection(orgId, "junta")`; lee `searchParams.id`. Sin `id`: `h1` "Junta
semanal", `listMeetings` (enlaces `?id=`) y el formulario "Nueva junta" (`input type="datetime-local"`).
Con `id`: `loadMeetingView` (null → `notFound()`), `ol` con los siete bloques de `AGENDA` (label y
minutos) y `aria-current="step"` en el actual, el contenido del bloque actual (scorecard de la semana,
rocas, pendientes, issues, notas con `textarea`), y los formularios `Iniciar junta` (si no empezó),
`Siguiente bloque`, `Guardar notas`, `Pendiente nuevo`, `Calificar` (persona de `listTeammates` + la
propia, número 1-10) y `Cerrar junta` (solo en `conclude`). Terminada, muestra
`Promedio ${averageRating.toFixed(1)}`.

En `app/empresas/[orgId]/page.tsx` agrega `isMeetingPending(memberRow.userId, orgId)` al `Promise.all`
existente y, si es `true`, `<aside className="config-card" aria-label="Junta pendiente">` con el texto
`Junta pendiente` y un `Link` a `/${orgId}/direccion/junta`, antes de `<BuildingExperience>`; nada más
cambia en el archivo.

En el spec: siembra una `meeting` con `scheduledFor` y `startedAt` = ahora, `currentBlock: "segue"`,
`facilitatorProfileId` y `createdBy` = dueño. Pruebas en este orden: `/junta` 200 con "Nueva junta";
`/junta?id=` con 7 `li` y `aria-current="step"` en "Buenas noticias"; axe en las dos; `/empresas/${orgId}`
muestra `Junta pendiente` con el enlace; pulsar `Siguiente bloque` 6 veces, `Calificar` con 9, `Cerrar
junta` → `Promedio 9.0` y `/empresas/${orgId}` ya sin `Junta pendiente`; empleado → 404 en `/junta`.

**Files**
- `apps/improvement/app/[org]/direccion/junta/page.tsx` — new
- `apps/improvement/app/empresas/[orgId]/page.tsx` — edit: tarjeta
- `apps/improvement/tests/e2e/direccion.spec.ts` — edit

**Acceptance**

1. **WHEN** el dueño abre `/[org]/direccion/junta` **THE SYSTEM SHALL** responder 200 con el formulario `Nueva junta`, y **WHEN** abre `/[org]/direccion/junta?id=<id de la junta sembrada>` **THE SYSTEM SHALL** listar los siete bloques en el orden de `AGENDA` con el bloque actual marcado `aria-current="step"`.
2. **WHEN** axe-core audita `/[org]/direccion/junta` y `/[org]/direccion/junta?id=<id de la junta sembrada>` con la sesión del dueño **THE SYSTEM SHALL** reportar 0 violaciones de impacto serious o critical en las dos.
3. **WHEN** un empleado sin la sección `junta` abre `/[org]/direccion/junta` **THE SYSTEM SHALL** responder 404.
4. **WHEN** el dueño abre `/empresas/[org]` sin junta terminada en la semana actual **THE SYSTEM SHALL** mostrar el texto `Junta pendiente` con un enlace a `/[org]/direccion/junta`.
5. **WHEN** el dueño avanza la junta sembrada hasta `conclude`, la califica con 9 y la cierra **THE SYSTEM SHALL** mostrar `Promedio 9.0`, y `/empresas/[org]` SHALL dejar de mostrar `Junta pendiente`.
6. **WHEN** `pnpm --filter improvement test:e2e a11y.spec.ts` corre **THE SYSTEM SHALL** salir con código 0 — el edificio y la recepción siguen sin violaciones serious o critical con la tarjeta nueva.

**Verify**

```bash
pnpm --filter improvement test:e2e direccion.spec.ts
pnpm --filter improvement test:e2e a11y.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/direccion/junta/page.tsx" ":(literal)apps/improvement/app/empresas/[orgId]/page.tsx" apps/improvement/tests/e2e/direccion.spec.ts
git commit -m "E2-T5 (step 11): pantalla de la Junta y tarjeta de junta pendiente"
git tag step-11-direccion-junta-pagina
git ls-files --error-unmatch -- ":(literal)apps/improvement/app/[org]/direccion/junta/page.tsx"   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

### `E2-T6` — Hub, entrada de navegación y gate completo

**Depends on:** `E1-T3`, `E2-T5` · **Priority:** p0

Hub `app/[org]/direccion/page.tsx`: `const m = await requireOrgMembership(orgId)`,
`loadDireccionNav(m.userId, orgId)`; vacío → `notFound()`; si no, `h1` "Dirección" y una `config-card`
por sección (`label`, `hint`, `Link` a `/${orgId}/direccion/${slug}`). `app/[org]/layout.tsx`:
`getSessionUserId()`; con sesión, `loadDireccionNav`; si devuelve algo, `<nav aria-label="Dirección">`
con un `Link` "Dirección" a `/${org}/direccion` junto al `BackLink` — sigue sin autenticar nada.
`loadLobby.ts`: después del ciclo de `sueltas`, si alguna sección visible está en `DIRECCION_SLUGS`,
`sueltas.push({ slug: "direccion", label: "Dirección" })` una sola vez (`BuildingExperience.tsx` ya lo
enlaza como `/${orgId}/direccion`). `tests/direccion-lobby.test.ts`: dueño → exactamente una suelta
`direccion`; empleado con `{ objetivos: "propio" }` → ninguna. En el spec: hub 200 con los 4 enlaces +
axe; empleado → 404 en el hub; `/${orgId}/objetivos` muestra `getByRole("navigation", { name: "Dirección" })`
con el enlace.

**Files**
- `apps/improvement/app/[org]/direccion/page.tsx` — new
- `apps/improvement/app/[org]/layout.tsx` — edit
- `apps/improvement/server/lobby/loadLobby.ts` — edit
- `apps/improvement/tests/direccion-lobby.test.ts` — new
- `apps/improvement/tests/e2e/direccion.spec.ts` — edit

**Acceptance**

1. **WHEN** el dueño abre `/[org]/direccion` **THE SYSTEM SHALL** responder 200 con enlaces a `/[org]/direccion/vision`, `/[org]/direccion/scorecard`, `/[org]/direccion/issues` y `/[org]/direccion/junta`, y axe-core SHALL reportar 0 violaciones de impacto serious o critical.
2. **WHEN** un empleado sin ninguna de las cuatro secciones abre `/[org]/direccion` **THE SYSTEM SHALL** responder 404.
3. **WHEN** el dueño abre `/[org]/objetivos` **THE SYSTEM SHALL** mostrar un enlace `Dirección` a `/[org]/direccion` dentro de un `nav` con nombre accesible `Dirección`.
4. **WHEN** `loadLobby` corre para el dueño **THE SYSTEM SHALL** incluir exactamente una entrada de `sueltas` con slug `direccion` y etiqueta `Dirección`, y **WHEN** corre para un empleado sin las cuatro secciones **THE SYSTEM SHALL** no incluirla.
5. **WHEN** `pnpm --filter improvement test:e2e` corre completo **THE SYSTEM SHALL** salir con código 0 con `a11y.spec.ts` y `direccion.spec.ts`.
6. **WHEN** `pnpm build` corre **THE SYSTEM SHALL** salir con código 0 para todas las apps del monorepo.

**Verify**

```bash
pnpm --filter improvement test tests/direccion-lobby.test.ts tests/lobby.test.ts
pnpm --filter improvement test:e2e
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- ":(literal)apps/improvement/app/[org]/direccion/page.tsx" ":(literal)apps/improvement/app/[org]/layout.tsx" apps/improvement/server/lobby/loadLobby.ts apps/improvement/tests/direccion-lobby.test.ts apps/improvement/tests/e2e/direccion.spec.ts
git commit -m "E2-T6 (step 12): hub de Dirección, navegación y gate completo"
git tag step-12-direccion-navegacion
git ls-files --error-unmatch apps/improvement/tests/direccion-lobby.test.ts   # expect: exit 0
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum   # expect: exit 0 — este commit no tocó apps/admin ni apps/summum (WIP y non-goals intactos)
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e` corre completo **THE SYSTEM SHALL** salir con código 0, con las cinco rutas de Dirección auditadas por axe sin violaciones serious o critical.
2. **WHEN** un empleado sin ninguna sección de Dirección abre `/[org]/direccion`, `/[org]/direccion/scorecard`, `/[org]/direccion/issues` o `/[org]/direccion/junta` **THE SYSTEM SHALL** responder 404 en cada una.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e
```

## Pitfalls

- **Crear un pendiente con un insert propio** — duplica la regla de quién emite trabajo y se salta la
  validación de `createObjective`; siempre esa función.
- **Mostrar on-track solo con color** — axe no lo detecta y es una falla de WCAG 1.4.1; el texto va siempre.
- **El layout que lanza** — `app/[org]/layout.tsx` envuelve también `planos`, donde el platform admin no
  es miembro: usa solo `loadDireccionNav`, que nunca lanza.
- **Olvidar el orden serial del spec** — la tarjeta `Junta pendiente` se prueba antes de cerrar la junta.
- **Un servidor ya levantado en el puerto 3200** — Playwright lo reusa fuera de CI; apaga cualquier
  `pnpm dev:improvement` de otra rama antes del e2e.
- **`git add` de rutas con corchetes** — `[org]` es un glob para git; usa `":(literal)…"` como en los Checkpoints.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-direccion-*'` lista 12 en total.
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` sin cambios — este cambio no agrega variables.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
