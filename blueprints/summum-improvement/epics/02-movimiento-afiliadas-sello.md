# Epic 02: Siguiente movimiento, afiliadas especialistas y Sello Cénit

> Al terminar, el dueño ve su siguiente mejor movimiento, los socios dan de alta afiliadas especialistas con su cuestionario, el Sello se calcula desde el expediente, se aprueba con dos firmas, vigila su vigencia por cron y se publica en un directorio.

| | |
|---|---|
| **Epic id** | `02-movimiento-afiliadas-sello` |
| **Tasks** | `E2-T1` … `E2-T10` |
| **Depends on** | `01-operacion` |
| **Unlocks** | `03-sinapsis-premios-pacto` |
| **Parallel with** | nada: comparte `packages/db/src/schema.ts` y el layout del muelle con los epics vecinos |

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
  src/schema.ts                                  # exists, you will edit it (E2-T3, E2-T5)
  migrations/                                    # afiliadas_rls, sello_rls
apps/improvement/
  server/ai/nextMove.ts, ai/prompts/nextMove.ts  # NEW (E2-T1)
  server/tasks/loadOwnerTasks.ts                 # exists, read-only (loadOwnerTasks, paretoCut)
  server/seal/score.ts                           # NEW (E2-T6)
  server/seal/vigencia.ts                        # NEW (E2-T9)
  app/api/cron/sello/route.ts                    # NEW (E2-T9)
  app/api/cron/reminders/route.ts                # exists, read-only — patrón del bearer
  vercel.json                                    # exists, you will edit it (E2-T9)
  app/empresas/PendingList.tsx, page.tsx, [orgId]/page.tsx   # exist, you will edit them (E2-T2)
  tests/next-move, afiliadas-schema, sello-schema, seal-score, seal-vigencia (.test.ts), e2e/movimiento.spec.ts   # NEW
apps/summum/
  server/auth/guard.ts                           # exists, read-only here
  server/result.ts, server/error-codes.ts        # exist, read-only
  server/affiliates/affiliates.ts                # NEW (E2-T4)
  server/seal/requirements.ts, seal/approvals.ts # NEW (E2-T7)
  server/directory/directory.ts                  # NEW (E2-T10)
  app/muelle/[muelleId]/layout.tsx               # exists, you will edit it (E2-T8)
  app/muelle/[muelleId]/afiliadas/page.tsx       # NEW (E2-T8)
  app/muelle/[muelleId]/sello/page.tsx           # NEW (E2-T8)
  app/red/[muelleId]/afiliada/page.tsx           # NEW (E2-T8)
  app/directorio/page.tsx, directorio/[slug]/page.tsx  # NEW (E2-T10)
  app/barco/[orgId]/page.tsx                     # exists, you will edit it (E2-T10)
  tests/affiliates, seal-approvals (.test.ts)   # NEW
  tests/e2e/red.spec.ts                          # NEW (E2-T8), grows in E2-T10
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `specialty` | `muelle_org_id`, `key`, `label`; unique (muelle, key) | Red |
| `affiliate` | `profile_id`, `muelle_org_id`, `barco_org_id`, `display_name`, `specialty_keys` text[], `status`, `public_slug` unique, `public_bio`, `directory_opt_in` | Una por perfil y muelle |
| `personality_profile` | `profile_id`, `subject_kind` (`afiliada`\|`dueno`), `org_id`, `answers`, `questionnaire_version` | RLS: solo su dueño |
| `area` (existente) | + `specialty_key` text null | Dato |
| `muelle_settings` | `muelle_org_id` unique, `min_seal_score` null, `grace_days` 30, `proposal_min_severity` 3 | El mínimo vive aquí |
| `seal_requirement` | `muelle_org_id`, `code`, `title`, `description`, `points`, `source` (`manual`\|`kpi`), `config`, `active` | Cero o muchas filas |
| `seal_requirement_result` | `requirement_id`, sujeto, `met`, `evidence_note`, `decided_by` | Solo requisitos manuales |
| `seal_evaluation` | sujeto, `score`, `min_score`, `approval_status`, `first_approver_id` ≠ `second_approver_id`, `vigencia`, `risk_since` | Dos firmas en la base |
| `barco_listing` | `barco_org_id` unique, `public_slug` unique, `public_bio`, `opt_in` | Opt-in del barco |
| `specialist_proposal` | ver epic 03 | Nace en `sello_rls` |

Columnas completas, checks e índices: en el **Do** de cada tarea de esquema y en el apéndice de abajo,
copiado literal de `blueprint.md` §4 (incluye el SQL de RLS que cada tarea pega en su archivo `--custom`).

### Apéndice de esquema (copia de blueprint.md §4)

#### §4 · Cuestionario de personalidad y enfoque

Constante del producto (no del cliente) en `packages/db/src/schema.ts`, versión 1, para que Summum (alta
de afiliada) e Improvement (perfil del dueño) usen la misma. Cinco preguntas de valores al estilo People
Analyzer y cuatro de enfoque. Se copia literal en el paso 13:

```ts
const FRECUENCIA = [
  { value: "siempre", label: "Siempre" },
  { value: "casi_siempre", label: "Casi siempre" },
  { value: "a_veces", label: "A veces" },
] as const;

export const PERSONALITY_VERSION = 1;

export const PERSONALITY_QUESTIONS = [
  { key: "valor_cumplir", question: "Cumplo lo que prometo, en tiempo y forma.", options: FRECUENCIA },
  { key: "valor_venta_pull", question: "Vendo sin presionar: el cliente llega porque ve el valor.", options: FRECUENCIA },
  { key: "valor_relacion", question: "Conozco a fondo a cada cliente y personalizo lo que le doy.", options: FRECUENCIA },
  { key: "valor_retorno", question: "Reinvierto en experiencias para mis clientes, no en descuentos.", options: FRECUENCIA },
  { key: "valor_transformacion", question: "Trabajo en mi propia transformación: cuerpo, mente y orden.", options: FRECUENCIA },
  {
    key: "ritmo",
    question: "¿A qué ritmo trabajas mejor?",
    options: [
      { value: "rapido_iterativo", label: "Rápido, probando y corrigiendo" },
      { value: "constante_planeado", label: "Constante y planeado" },
      { value: "por_proyectos", label: "Por proyectos, con picos de trabajo" },
    ],
  },
  {
    key: "comunicacion",
    question: "¿Cómo prefieres comunicarte?",
    options: [
      { value: "directo_breve", label: "Directo y breve" },
      { value: "detallado_escrito", label: "Detallado y por escrito" },
      { value: "conversado", label: "Conversado, en persona o llamada" },
    ],
  },
  {
    key: "decision",
    question: "¿Cómo tomas decisiones?",
    options: [
      { value: "datos", label: "Con datos" },
      { value: "experiencia", label: "Con experiencia e intuición" },
      { value: "consenso", label: "En consenso con el equipo" },
    ],
  },
  {
    key: "tipo_negocio",
    question: "¿Con qué tipo de negocio trabajas mejor?",
    options: [
      { value: "servicios", label: "Servicios" },
      { value: "productos", label: "Productos" },
      { value: "proyectos_obra", label: "Proyectos y obra" },
    ],
  },
] as const;
```

`personalityAnswersValid(answers)` es `true` solo con exactamente estas nueve llaves y valores dentro de
sus `options`; `personalityMatch(a, b) = Math.round(iguales / 9 × 100)` (6 de 9 → `67`, comprobado en
Node 24.19.0, §19.6 *Byte-exact*). La redacción es v1: cambiarla es editar la constante y subir
`PERSONALITY_VERSION`.

#### §4 · Sello Cénit y sinapsis

**`muelle_settings`** — los parámetros de la red, como datos: `id`, `muelle_org_id` (FK organization
cascade, not null, **unique**), `min_seal_score` integer **null** (null = sin mínimo → nadie se
certifica), `grace_days` integer not null default 30 check 1-365, `proposal_min_severity` integer not null
default 3 check 1-3, `catalog_mode` (paso 23: check in `CATALOG_MODES`, default `'global'`), `created_at`,
`updated_at`.

**`seal_requirement`** — `id`, `muelle_org_id` (cascade, not null), `code` text not null, `title` text
not null, `description` text not null default `''`, `points` integer not null check 1-100, `source` (check
in `SEAL_SOURCES`: `manual`\|`kpi`), `config` jsonb not null default `'{}'` (para `kpi`:
`{ source, config, op: "gte"|"lte", threshold }`), `active` boolean not null default true, `created_at`,
`updated_at`; unique `uq_seal_requirement_code` (`muelle_org_id`, `code`).

**`seal_requirement_result`** — la marca de un requisito manual para un sujeto: `id`, `muelle_org_id`
(cascade, not null), `requirement_id` (FK `seal_requirement.id` cascade, not null), `subject_kind` (check
in `SEAL_SUBJECTS`), `barco_org_id` (FK organization cascade), `affiliate_id` (FK affiliate cascade),
`met` boolean not null, `evidence_note` text null, `decided_by` (FK profile set null), `decided_at`
timestamptz not null default `now()`; check `seal_result_subject` (exactamente uno de los dos ids según
`subject_kind`); uniques parciales (`requirement_id`, `barco_org_id`) where `barco_org_id is not null` y
(`requirement_id`, `affiliate_id`) where `affiliate_id is not null`.

**`seal_evaluation`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `muelle_org_id` | uuid | FK organization cascade, not null | |
| `subject_kind` | text | check in `SEAL_SUBJECTS` | `barco`\|`afiliada` |
| `barco_org_id` | uuid | FK organization cascade | |
| `affiliate_id` | uuid | FK `affiliate.id` cascade | check `seal_evaluation_subject`: `(subject_kind = 'barco' and barco_org_id is not null and affiliate_id is null) or (subject_kind = 'afiliada' and affiliate_id is not null and barco_org_id is null)` |
| `score` | integer | not null | |
| `min_score` | integer | null | El mínimo vigente al calcular |
| `approval_status` | text | not null, default `'pendiente'`, check in `SEAL_APPROVAL` | |
| `first_approver_id` | uuid | FK profile | |
| `second_approver_id` | uuid | FK profile; check `seal_evaluation_otra_firma`: `second_approver_id is null or second_approver_id <> first_approver_id` | |
| `approved_at` | timestamptz | null | |
| `vigencia` | text | null, check `vigencia is null or vigencia in ('vigente','en_riesgo','reevaluacion','suspendido')` | |
| `risk_since` | timestamptz | null | |
| `last_computed_at` | timestamptz | not null, default `now()` | |
| `created_at`, `updated_at` | timestamptz | not null | uniques parciales `uq_seal_eval_pending_barco` (`barco_org_id`) y `uq_seal_eval_pending_affiliate` (`affiliate_id`) where `approval_status = 'pendiente'` |

**`barco_listing`** — opt-in del barco al directorio: `id`, `barco_org_id` (FK organization cascade, not
null, **unique**), `public_slug` text not null **unique**, `public_bio` text null, `opt_in` boolean not
null default false, `created_at`, `updated_at`.

**`specialist_proposal`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `muelle_org_id` | uuid | FK organization cascade, not null | |
| `org_id` | uuid | FK organization cascade, not null | El barco |
| `org_need_id` | uuid | FK `org_need.id` cascade, not null | |
| `affiliate_id` | uuid | FK `affiliate.id` cascade, not null | |
| `seal_score` | integer | null | Puntaje del Sello al proponer |
| `match_score` | integer | not null, check 0-100 | `personalityMatch` |
| `status` | text | not null, default `'propuesta'`, check in `PROPOSAL_STATUSES` | `propuesta`\|`aprobada_socios`\|`activa`\|`rechazada` |
| `first_partner_id` | uuid | FK profile | |
| `second_partner_id` | uuid | FK profile; check `specialist_proposal_otra_firma` (distinto del primero) | |
| `partners_approved_at` | timestamptz | null | |
| `owner_decided_by` | uuid | FK profile | |
| `owner_decided_at` | timestamptz | null | |
| `created_at`, `updated_at` | timestamptz | not null | unique (`org_need_id`, `affiliate_id`); unique parcial `uq_proposal_open_need` (`org_need_id`) where `status in ('propuesta','aprobada_socios','activa')` |

**`powerup_partner`** (existente, catálogo global) — + `network_org_id` (FK organization set null),
`affiliate_id` (FK affiliate set null), `barco_org_id` (FK organization set null), `published_by` (FK
profile set null); índice `idx_powerup_partner_network` (`network_org_id`, `is_active`). Ninguna fila
existente cambia.

#### §4 · Migración `afiliadas_rls`

```sql
-- Funciones de la red (security definer: leen membership/affiliate/organization sin pasar por su RLS,
-- igual que public.org_parent_id de 0028). Las reusan las migraciones siguientes.
create or replace function public.is_dock_owner(muelle uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (
    select 1 from membership m where m.org_id = muelle and m.user_id = auth.uid() and m.role = 'owner') $$;

create or replace function public.is_network_member(muelle uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.is_dock_owner(muelle) or exists (
    select 1 from affiliate a
    where a.muelle_org_id = muelle and a.profile_id = auth.uid() and a.status = 'activa') $$;

create or replace function public.in_muelle_network(muelle uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.is_network_member(muelle) or exists (
    select 1 from membership m join organization o on o.id = m.org_id
    where m.user_id = auth.uid() and o.parent_org_id = muelle) $$;

revoke all on function public.is_dock_owner(uuid), public.is_network_member(uuid), public.in_muelle_network(uuid) from public;
grant execute on function public.is_dock_owner(uuid), public.is_network_member(uuid), public.in_muelle_network(uuid) to authenticated;

alter table specialty enable row level security;
create policy "network reads its specialties"
  on specialty for select
  using (public.in_muelle_network(specialty.muelle_org_id));

alter table affiliate enable row level security;
create policy "affiliate reads itself, dock owners read their network"
  on affiliate for select
  using (affiliate.profile_id = auth.uid() or public.is_dock_owner(affiliate.muelle_org_id));

-- El cuestionario es de la persona: ni los socios lo leen por PostgREST (el ranking lo calcula el servidor).
alter table personality_profile enable row level security;
create policy "people read only their own personality profile"
  on personality_profile for select
  using (personality_profile.profile_id = auth.uid());

grant select on specialty, affiliate, personality_profile to authenticated;
```

#### §4 · Migración `sello_rls`

```sql
-- RLS del Sello y de la sinapsis. Los socios ven todo su muelle; un barco ve lo suyo (solo su dueño, un
-- empleado no ve dinero ni evaluaciones); una afiliada ve lo suyo.
alter table muelle_settings enable row level security;
create policy "dock owners read their settings"
  on muelle_settings for select using (public.is_dock_owner(muelle_settings.muelle_org_id));

alter table seal_requirement enable row level security;
create policy "network reads the seal requirements"
  on seal_requirement for select using (public.in_muelle_network(seal_requirement.muelle_org_id));

alter table seal_requirement_result enable row level security;
create policy "dock owners and the subject read seal results"
  on seal_requirement_result for select
  using (
    public.is_dock_owner(seal_requirement_result.muelle_org_id)
    or (seal_requirement_result.barco_org_id is not null and exists (
      select 1 from membership m where m.org_id = seal_requirement_result.barco_org_id
        and m.user_id = auth.uid() and m.role = 'owner'))
    or (seal_requirement_result.affiliate_id is not null and exists (
      select 1 from affiliate a where a.id = seal_requirement_result.affiliate_id and a.profile_id = auth.uid()))
  );

alter table seal_evaluation enable row level security;
create policy "dock owners and the subject read seal evaluations"
  on seal_evaluation for select
  using (
    public.is_dock_owner(seal_evaluation.muelle_org_id)
    or (seal_evaluation.barco_org_id is not null and exists (
      select 1 from membership m where m.org_id = seal_evaluation.barco_org_id
        and m.user_id = auth.uid() and m.role = 'owner'))
    or (seal_evaluation.affiliate_id is not null and exists (
      select 1 from affiliate a where a.id = seal_evaluation.affiliate_id and a.profile_id = auth.uid()))
  );

alter table barco_listing enable row level security;
create policy "boat owner and its dock owners read the listing"
  on barco_listing for select
  using (exists (
    select 1 from membership m where m.user_id = auth.uid() and m.role = 'owner'
      and m.org_id in (barco_listing.barco_org_id, public.org_parent_id(barco_listing.barco_org_id))));

alter table specialist_proposal enable row level security;
create policy "dock owners and the boat owner read proposals"
  on specialist_proposal for select
  using (
    public.is_dock_owner(specialist_proposal.muelle_org_id)
    or exists (select 1 from membership m where m.org_id = specialist_proposal.org_id
      and m.user_id = auth.uid() and m.role = 'owner')
  );

grant select on muelle_settings, seal_requirement, seal_requirement_result, seal_evaluation, barco_listing, specialist_proposal to authenticated;
```

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| `01` | `server/ai/gateway.ts` → `generateStructured` | Límite por hora antes del proveedor, un reintento, `ai_suggestion` + `llm_calls` |
| repo | `server/tasks/loadOwnerTasks.ts` → `loadOwnerTasks`, `paretoCut` | Tareas del dueño ya ordenadas |
| repo | `server/kpis/sources.ts` → `kpiSource`, `computeKpiValues` | Requisitos `kpi` del Sello |
| repo | `apps/summum/server/auth/guard.ts` → `assertDockOwner`, `assertBarcoOwner`, `requireDockOwnership`, `getSessionUserId`, `listMyBarcos` | 404 nunca 403 |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `packages/db/src/schema.ts` → `PERSONALITY_QUESTIONS`, `PERSONALITY_VERSION`, `personalityAnswersValid`, `personalityMatch` | nueve preguntas; `(a, b) => number` | `03` |
| `apps/improvement/server/seal/score.ts` → `computeSealScore` | `(subject, muelleId) => Promise<SealScore>` | E2-T9, `03` |
| `apps/improvement/server/seal/vigencia.ts` → `nextVigencia`, `runSealCycle` | ver E2-T9 | `03` (la ruta del cron) |
| `apps/improvement/server/ai/nextMove.ts` → `refreshNextMove`, `getPortfolioNextMove` | ver E2-T1 | E2-T2 |
| `apps/summum/server/affiliates/affiliates.ts` → `getMyAffiliate` y demás | ver E2-T4 | E2-T8, `03`, `04` |

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
- **El puntaje vive en Improvement.** `computeSealScore` usa los adaptadores de KPI de esta app; Summum solo lee
  `seal_evaluation` y firma.
- **Nada del Sello en código.** Requisitos, puntos, mínimo y días de gracia son filas; con cero requisitos el puntaje es 0.
- **Rutas públicas** (`/directorio`) con columnas explícitas: nunca un id, un monto ni una nota.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/summum-improvement.md`,
`.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`, `.claude/rules/ia-gateway.md`.
All sit in the project root.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom and do
not re-rank by priority or by what looks quick.

### `E2-T1` — Siguiente mejor movimiento en el servidor

**Depends on:** `E1-T7` · **Priority:** p1 — metadata for scope cuts, not a running order

- `server/ai/prompts/nextMove.ts`: `NEXT_MOVE_SYSTEM_PROMPT` (director general de la empresa; una sola jugada
  concreta para esta semana, con su impacto estimado; responde solo JSON), `nextMoveSchema =
  z.object({ jugada: z.string().min(1).max(400), impacto: z.string().min(1).max(300) })` y
  `buildNextMovePrompt({ kpis: { label, value }[], needs: { title, severity, status }[], memory: string[] })`.
- `server/ai/nextMove.ts`:
  - `refreshNextMove(userId, orgId, provider?)` — `findOwnerMembership` (si no: `FORBIDDEN`, sin llamar al
    proveedor). Contexto del org: las filas de `org_kpi` con su valor (`computeKpiValues`), las `org_need`
    con `status` en `abierta`/`en_progreso` y las últimas 20 respuestas de `owner_memory` del dueño. Llama
    `generateStructured({ purpose: "siguiente_movimiento", category: "siguiente_movimiento", schema:
    nextMoveSchema, toText: (p) => `${p.jugada} — Impacto: ${p.impacto}`, basedOn: { kpiIds, needIds,
    memoryIds } })`. Devuelve el `Result` del gateway.
  - `getPortfolioNextMove(userId, now = new Date()): Promise<NextMove | null>` — sin llamar al proveedor:
    1) la `ai_suggestion` `siguiente_movimiento` más reciente de los orgs donde `userId` es dueño, generada en
    los últimos 7 días → `{ fuente: "ia", orgId, text, generatedAt }`; 2) si no hay, `loadOwnerTasks(userId,
    now)` y, si `paretoCut(tasks) ≥ 1`, la primera tarea → `{ fuente: "pareto", text: title, context, href }`;
    3) si no hay tareas, `null`.
- `tests/next-move.test.ts`: `FakeProvider`; el dueño se siembra sin otros orgs.

**Files**
- `apps/improvement/server/ai/nextMove.ts` — new: `refreshNextMove`, `getPortfolioNextMove`
- `apps/improvement/server/ai/prompts/nextMove.ts` — new: prompt y esquema
- `apps/improvement/tests/next-move.test.ts` — new: con proveedor simulado

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `refreshNextMove` corre para el dueño con un proveedor simulado y un org con una necesidad `abierta` **THE SYSTEM SHALL** insertar una `ai_suggestion` con `category` `siguiente_movimiento` cuyo `based_on.needIds` contiene esa necesidad, y una fila `llm_calls` con `purpose` `siguiente_movimiento`.
2. **WHEN** existe una sugerencia `siguiente_movimiento` de hace 2 días en un org del dueño **THE SYSTEM SHALL** hacer que `getPortfolioNextMove` devuelva `fuente` `ia` con su texto.
3. **WHEN** no hay sugerencia y el dueño tiene objetivos abiertos **THE SYSTEM SHALL** hacer que `getPortfolioNextMove` devuelva `fuente` `pareto` con el título de la primera tarea de `loadOwnerTasks`.
4. **WHEN** la única sugerencia tiene 8 días **THE SYSTEM SHALL** ignorarla y devolver `fuente` `pareto`, y WHEN el dueño no tiene ni sugerencias ni tareas THE SYSTEM SHALL devolver `null`.
5. **WHEN** un empleado llama `refreshNextMove` **THE SYSTEM SHALL** devolver `code: "FORBIDDEN"` sin llamar al proveedor.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/next-move.test.ts tests/ai-gateway.test.ts
test "$(grep -rl '@anthropic-ai/sdk' apps/improvement/server apps/improvement/app apps/improvement/lib apps/improvement/components)" = apps/improvement/server/ai/gateway.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/ai/nextMove.ts apps/improvement/server/ai/prompts/nextMove.ts apps/improvement/tests/next-move.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T1 (step 11): siguiente mejor movimiento con respaldo de Pareto"
git tag step-11-si-movimiento-motor
git ls-files --error-unmatch apps/improvement/server/ai/nextMove.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T2` — Tarjeta del siguiente movimiento en el inicio del dueño

**Depends on:** `E2-T1` · **Priority:** p1 — metadata for scope cuts, not a running order

- `PendingList.tsx`: nueva prop `move: NextMove | null`. Si hay `move`, arriba de la lista va una
  `section` con `h2` "Siguiente mejor movimiento", el texto y la etiqueta de su fuente: `Sugerido por
  Improvement` (fuente `ia`) o `Lo más urgente (80/20)` (fuente `pareto`). Ocupa uno de los tres lugares
  visibles: con fuente `pareto` la lista visible es `tasks.slice(1, VISIBLE)` (la tarea ya está en la
  tarjeta); con fuente `ia`, `tasks.slice(0, VISIBLE - 1)`. El resto sigue en el `details`. Sin `move`, la
  lista queda como hoy. `paretoCut` sigue marcando las vitales. Sigue siendo Server Component.
- `app/empresas/page.tsx`: carga `getPortfolioNextMove(userId)` junto a `loadOwnerTasks` y pasa `move`.
- `app/empresas/[orgId]/page.tsx`: si la persona es dueña, un `form` con el botón `Pedir siguiente
  movimiento` → Server Action que llama `refreshNextMove(userId, orgId)` dentro de `try` (sin
  `ANTHROPIC_API_KEY`, `requireEnv` lanza) y redirige a `/empresas`; un fallo o `ok: false` redirige con
  `?error=` y el texto "Improvement no pudo pensar la jugada ahora; ves la más urgente.".
- `tests/e2e/movimiento.spec.ts`: dueño nuevo con un org y un objetivo abierto "Llamar al proveedor" con
  vencimiento mañana; luego una `ai_suggestion` `siguiente_movimiento` sembrada con texto "Cerrar la venta
  grande"; un empleado del mismo org. Mismo mecanismo de sesión que `direccion.spec.ts`; borra todo al final.

**Files**
- `apps/improvement/app/empresas/PendingList.tsx` — edit: prop `move` y la tarjeta en el primer lugar
- `apps/improvement/app/empresas/page.tsx` — edit: carga `getPortfolioNextMove`
- `apps/improvement/app/empresas/[orgId]/page.tsx` — edit: botón del dueño `Pedir siguiente movimiento`
- `apps/improvement/tests/e2e/movimiento.spec.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el dueño sin sugerencias de IA abre `/empresas` **THE SYSTEM SHALL** mostrar un `h2` `Siguiente mejor movimiento` con `Llamar al proveedor` y la etiqueta `Lo más urgente (80/20)`, y axe-core SHALL reportar 0 violaciones serious o critical.
2. **WHEN** existe una `ai_suggestion` `siguiente_movimiento` reciente del org del dueño **THE SYSTEM SHALL** mostrar en esa tarjeta `Cerrar la venta grande` con la etiqueta `Sugerido por Improvement`.
3. **WHEN** el dueño abre `/empresas/[orgId]` **THE SYSTEM SHALL** mostrar el botón `Pedir siguiente movimiento`, y WHEN lo abre el empleado THE SYSTEM SHALL no mostrarlo.
4. **WHEN** `pnpm --filter improvement test tests/company-list.test.ts tests/owner-panel.test.ts` corre **THE SYSTEM SHALL** salir con código 0 — el panel del dueño existente sin cambios.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test:e2e movimiento.spec.ts
pnpm --filter improvement test tests/company-list.test.ts tests/owner-panel.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/app/empresas/PendingList.tsx apps/improvement/app/empresas/page.tsx ":(literal)apps/improvement/app/empresas/[orgId]/page.tsx" apps/improvement/tests/e2e/movimiento.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T2 (step 12): tarjeta del siguiente mejor movimiento"
git tag step-12-si-movimiento-tarjeta
git ls-files --error-unmatch apps/improvement/tests/e2e/movimiento.spec.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T3` — Esquema de afiliadas, especialidades y personalidad

**Depends on:** `E1-T9` · **Priority:** p0 — metadata for scope cuts, not a running order

1. `packages/db/src/schema.ts`:
   - Constantes: `AFFILIATE_STATUSES = ["activa", "suspendida"] as const`, `PERSONALITY_SUBJECTS =
     ["afiliada", "dueno"] as const`, `PERSONALITY_VERSION = 1` y `PERSONALITY_QUESTIONS` — **la** lista de
     §4 *Cuestionario de personalidad y enfoque*, copiada literal (nueve `{ key, question, options: { value,
     label }[] }`). Producto, no cliente: una sola constante para Summum e Improvement.
   - Funciones puras junto a esa constante (sin base, sin zod, para que ambas apps las usen):
     `personalityAnswersValid(answers: unknown): answers is Record<string, string>` — `true` solo si trae
     exactamente las nueve llaves y cada valor está en sus `options`; `personalityMatch(a, b): number` —
     `Math.round(iguales / 9 × 100)`.
   - `area`: + `specialty_key` text null (la especialidad de la red que atiende esa área; dato, no FK).
   - Tabla `specialty`: `id`, `muelle_org_id` (→ organization, cascade, not null), `key` text not null,
     `label` text not null, `created_at`; unique `uq_specialty_muelle_key` (`muelle_org_id`, `key`).
   - Tabla `affiliate`: `id`, `profile_id` (→ profile, cascade, not null), `muelle_org_id` (→ organization,
     cascade, not null), `barco_org_id` (→ organization, set null), `display_name` text not null,
     `specialty_keys` `text[]` not null default `'{}'`, `status` (`AFFILIATE_STATUSES`, default `"activa"`),
     `public_slug` text not null **unique**, `public_bio` text null, `directory_opt_in` boolean not null
     default false, `created_at`, `updated_at`; unique `uq_affiliate_profile_muelle` (`profile_id`,
     `muelle_org_id`); check `affiliate_status_check`.
   - Tabla `personality_profile`: `id`, `profile_id` (→ profile, cascade, not null), `subject_kind`
     (`PERSONALITY_SUBJECTS`), `org_id` (→ organization, set null; el org donde contestó el dueño),
     `answers` jsonb not null, `questionnaire_version` integer not null, `created_at`, `updated_at`; unique
     `uq_personality_profile_subject` (`profile_id`, `subject_kind`); check `personality_subject_check`.
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=afiliadas_rls`
   con el SQL de §4 *Migración `afiliadas_rls`* (crea la función `public.is_network_member` que reusan las
   migraciones siguientes).
3. `apps/improvement/tests/afiliadas-schema.test.ts` (patrón `asUser()`), que además prueba las dos
   funciones puras.
4. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: `specialty`, `affiliate`, `personality_profile`, `area.specialty_key`, `PERSONALITY_QUESTIONS` y sus dos funciones puras
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_afiliadas_rls.sql`
- `apps/improvement/tests/afiliadas-schema.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** se insertan un `specialty`, un `affiliate` y un `personality_profile` y se actualiza el `specialty_key` de un `area` **THE SYSTEM SHALL** leerlos de vuelta con los mismos valores.
2. **WHEN** se inserta un segundo `affiliate` del mismo perfil en el mismo muelle, un `affiliate` con un `public_slug` repetido, una `specialty` con `key` repetida en el mismo muelle o un `personality_profile` con `subject_kind` `otro` **THE SYSTEM SHALL** rechazar cada insert en la base.
3. **WHEN** la afiliada consulta `affiliate` y `personality_profile` como rol `authenticated` **THE SYSTEM SHALL** ver solo sus filas, y WHEN consulta un dueño del muelle THE SYSTEM SHALL ver las filas `affiliate` del muelle y 0 filas de `personality_profile` ajenas.
4. **WHEN** un perfil sin relación con el muelle consulta `specialty` como rol `authenticated` **THE SYSTEM SHALL** devolver 0 filas, y WHEN consulta una afiliada `activa` del muelle THE SYSTEM SHALL devolver sus especialidades.
5. **WHEN** `personalityAnswersValid` recibe las nueve respuestas válidas **THE SYSTEM SHALL** devolver `true`, con una llave faltante o un valor fuera de `options` SHALL devolver `false`, y WHEN `personalityMatch` compara dos respuestas con 6 de 9 iguales THE SYSTEM SHALL devolver `67`.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/afiliadas-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/afiliadas-schema.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T3 (step 13): esquema de afiliadas y personalidad con RLS"
git tag step-13-si-afiliadas-esquema
git ls-files --error-unmatch apps/improvement/tests/afiliadas-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T4` — Motor de afiliadas especialistas y su cuestionario

**Depends on:** `E2-T3` · **Priority:** p0 — metadata for scope cuts, not a running order

Convenciones de `apps/summum`: `Result<T>` de `server/result.ts` (`{ ok: false; error: string }`), los
mensajes de error son los de `server/error-codes.ts` (`"Revisa los datos del formulario."`,
`"No se pudo completar. Inténtalo de nuevo."`) — no se agregan códigos; páginas con `?error=<código>`
pintadas con `errorMessage()`. Imports relativos con `.ts`; `@/` en páginas.

- `server/affiliates/affiliates.ts`:
  - `createSpecialty(userId, muelleId, input)` — `assertDockOwner`; `{ key: /^[a-z0-9-]{2,40}$/, label
    (2-80) }`; `listSpecialties(muelleId)`.
  - `registerAffiliate(userId, muelleId, input)` — `assertDockOwner`; `{ email, displayName (2-120),
    specialtyKeys (1-5, cada una existente en el muelle) }`; el perfil se busca por correo en `profile` y
    debe existir; `public_slug` = slug ASCII de `displayName` + `-` + 6 caracteres de `crypto.randomUUID()`;
    `status` `activa`. Perfil inexistente, llave inexistente o afiliada repetida → `"Revisa los datos del
    formulario."`.
  - `setAffiliateStatus(userId, affiliateId, status)` — dueño del muelle de esa afiliada.
  - `listAffiliates(userId, muelleId)` — `assertDockOwner`.
  - `getMyAffiliate(userId, muelleId)` — la fila de `userId` en ese muelle o `null`.
  - `saveAffiliateProfile(userId, muelleId, input)` — solo la propia afiliada; `{ publicBio (≤1000 | null),
    directoryOptIn (boolean), barcoOrgId (uuid | null) }`; `barcoOrgId` debe ser un barco donde `userId` es
    dueño (si no, error y no escribe).
  - `answerQuestionnaire(userId, muelleId, answers: unknown)` — afiliada `activa` del muelle;
    `personalityAnswersValid` (si no: `"Revisa los datos del formulario."`); upsert de `personality_profile`
    (`profile_id = userId`, `subject_kind = "afiliada"`, `questionnaire_version = PERSONALITY_VERSION`).
- Las dos pantallas que usan este motor llegan en el paso 18, junto con la del Sello y el e2e que las abre.
- `tests/affiliates.test.ts`: patrón `dockWithOwners` de `tests/fee-changes.test.ts`.

**Files**
- `apps/summum/server/affiliates/affiliates.ts` — new: especialidades, alta, estado, perfil y cuestionario
- `apps/summum/tests/affiliates.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** un dueño del muelle registra con `registerAffiliate` el correo de un perfil existente con una especialidad del muelle **THE SYSTEM SHALL** crear una fila `affiliate` `activa` con un `public_slug` único, y WHEN registra otra vez el mismo perfil THE SYSTEM SHALL devolver `{ ok: false, error: "Revisa los datos del formulario." }`.
2. **WHEN** un perfil que no es dueño del muelle llama `registerAffiliate` o `listAffiliates` **THE SYSTEM SHALL** lanzar el 404 de `assertDockOwner`.
3. **WHEN** la afiliada activa contesta el cuestionario con las nueve respuestas válidas **THE SYSTEM SHALL** guardar un `personality_profile` con `subject_kind` `afiliada` y `questionnaire_version` 1, y WHEN falta una respuesta THE SYSTEM SHALL devolver `{ ok: false, error: "Revisa los datos del formulario." }` sin escribir.
4. **WHEN** una afiliada `suspendida` contesta el cuestionario **THE SYSTEM SHALL** devolver `ok: false` sin escribir.
5. **WHEN** `saveAffiliateProfile` recibe un `barcoOrgId` de un barco donde la afiliada no es dueña **THE SYSTEM SHALL** devolver `ok: false` y dejar `barco_org_id` sin cambio.
6. **WHEN** `createSpecialty` recibe la llave `Ventas Top` **THE SYSTEM SHALL** devolver `{ ok: false, error: "Revisa los datos del formulario." }`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/affiliates.test.ts
pnpm --filter @jotapuntoce/summum test tests/guard.test.ts tests/fee-changes.test.ts tests/error-codes.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/affiliates || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/affiliates/affiliates.ts apps/summum/tests/affiliates.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T4 (step 14): motor de afiliadas y cuestionario en Summum"
git tag step-14-si-afiliadas-summum
git ls-files --error-unmatch apps/summum/server/affiliates/affiliates.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T5` — Esquema del Sello Cénit y de la sinapsis con su RLS

**Depends on:** `E2-T3` · **Priority:** p0 — metadata for scope cuts, not a running order

1. `packages/db/src/schema.ts` — constantes `SEAL_SOURCES = ["manual", "kpi"]`, `SEAL_SUBJECTS = ["barco",
   "afiliada"]`, `SEAL_APPROVAL = ["pendiente", "aprobada", "rechazada"]`, `SEAL_VIGENCIA = ["vigente",
   "en_riesgo", "reevaluacion", "suspendido"]`, `PROPOSAL_STATUSES = ["propuesta", "aprobada_socios",
   "activa", "rechazada"]` (todas `as const`) y las seis tablas de §4 *Sello Cénit y sinapsis*, con sus
   checks, índices y uniques tal como están ahí. Puntos de requisitos y puntajes son enteros.
2. `pnpm db:generate`; `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=sello_rls`
   con el SQL de §4 *Migración `sello_rls`*.
3. `apps/improvement/tests/sello-schema.test.ts` (patrón `asUser()`).
4. **Aprobación obligatoria** de los dos SQL por Jose Carlos; sin un "sí" explícito, detente. Luego
   `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts` — edit: `muelle_settings`, `seal_requirement`, `seal_requirement_result`, `seal_evaluation`, `barco_listing`, `specialist_proposal` y sus constantes
- `packages/db/migrations/**` — new: la de `pnpm db:generate` y la `*_sello_rls.sql`
- `apps/improvement/tests/sello-schema.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** se insertan un `muelle_settings`, un `seal_requirement` de cada fuente, un `seal_requirement_result`, una `seal_evaluation` de un barco, un `barco_listing` y un `specialist_proposal` **THE SYSTEM SHALL** leerlos de vuelta, con `min_seal_score` null, `grace_days` 30 y `proposal_min_severity` 3 por defecto en `muelle_settings`.
2. **WHEN** se inserta una `seal_evaluation` con `second_approver_id` igual a `first_approver_id`, una `seal_evaluation` `barco` sin `barco_org_id`, o una segunda `seal_evaluation` `pendiente` del mismo barco **THE SYSTEM SHALL** rechazar cada insert en la base.
3. **WHEN** se inserta un `specialist_proposal` con `second_partner_id` igual a `first_partner_id`, o un segundo `specialist_proposal` `propuesta` para la misma necesidad **THE SYSTEM SHALL** rechazar cada insert en la base.
4. **WHEN** el dueño del barco consulta `seal_evaluation` como rol `authenticated` **THE SYSTEM SHALL** ver las de su barco y 0 de otro barco del mismo muelle, y WHEN consulta un empleado de ese barco THE SYSTEM SHALL devolver 0 filas.
5. **WHEN** un dueño del muelle consulta `seal_evaluation`, `seal_requirement` y `specialist_proposal` como rol `authenticated` **THE SYSTEM SHALL** ver las filas de su muelle, y WHEN consulta una afiliada THE SYSTEM SHALL ver solo sus propias evaluaciones.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/sello-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/sello-schema.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T5 (step 15): esquema del Sello y de la sinapsis con RLS"
git tag step-15-si-sello-esquema
git ls-files --error-unmatch apps/improvement/tests/sello-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T6` — Motor de puntaje del Sello desde el expediente

**Depends on:** `E2-T5` · **Priority:** p0 — metadata for scope cuts, not a running order

El puntaje vive en `apps/improvement` porque se calcula desde el expediente (los adaptadores de
`server/kpis/sources.ts` son de esta app y `apps/summum` no puede importarlos). No corre en nombre de
nadie: lo llaman el cron del paso 19 y las pruebas, igual que `reviewPendingObjectives`.

- `sealKpiConfigSchema = z.object({ source: z.string(), config: z.unknown().default({}), op: z.enum(["gte",
  "lte"]), threshold: z.number().finite() })`.
- `computeSealScore(subject: { kind: "barco"; orgId: string } | { kind: "afiliada"; affiliateId: string },
  muelleId: string): Promise<SealScore>` donde `SealScore = { score: number; minScore: number | null; meets:
  boolean; detail: { requirementId: string; met: boolean; points: number }[] }`:
  - requisitos `active = true` del muelle, por `code`; **cero filas → `score` 0**.
  - `manual`: `met` = existe un `seal_requirement_result` del sujeto con `met = true`.
  - `kpi`: `config` pasa `sealKpiConfigSchema` y `kpiSource(source)?.load` existe (si no — config inválida,
    fuente desconocida o `manual` — `met = false`, nunca lanza); el org es el barco, o el
    `affiliate.barco_org_id` (null → `met = false`); el valor sale de `computeKpiValues([{ id, orgId, label:
    "", hint: null, source, config, manualValue: null, format: "numero" }])`; `met` = `valor >= threshold`
    (`gte`) o `valor <= threshold` (`lte`).
  - `score` = suma de `points` de los cumplidos; `minScore` = `muelle_settings.min_seal_score` (sin fila o
    null → `null`); `meets = minScore !== null && score >= minScore`.
- Ninguna lista de requisitos, mínimo ni peso en código: todo sale de las filas.

**Files**
- `apps/improvement/server/seal/score.ts` — new: `sealKpiConfigSchema`, `computeSealScore`
- `apps/improvement/tests/seal-score.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** un muelle no tiene requisitos ni `muelle_settings` **THE SYSTEM SHALL** devolver `score` 0, `minScore` null y `meets` false.
2. **WHEN** un barco cumple un requisito manual de 10 puntos, no cumple otro manual de 5 y cumple un requisito `kpi` de 20 puntos con `{"source":"proyectos","config":{"estado":"en_obra"},"op":"gte","threshold":1}`, con `min_seal_score` 25 **THE SYSTEM SHALL** devolver `score` 30 y `meets` true.
3. **WHEN** el mismo barco se evalúa con `min_seal_score` 40 **THE SYSTEM SHALL** devolver `score` 30 y `meets` false.
4. **WHEN** un requisito `kpi` trae `source` `manual`, una fuente inexistente o una config sin `threshold` **THE SYSTEM SHALL** contarlo como no cumplido sin lanzar.
5. **WHEN** se evalúa una afiliada sin `barco_org_id` **THE SYSTEM SHALL** contar como no cumplidos sus requisitos `kpi` y sumar sus requisitos manuales cumplidos.
6. **WHEN** un requisito tiene `active` false **THE SYSTEM SHALL** dejarlo fuera de `detail` y de `score`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/seal-score.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/seal || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/seal/score.ts apps/improvement/tests/seal-score.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T6 (step 16): motor de puntaje del Sello"
git tag step-16-si-sello-puntaje
git ls-files --error-unmatch apps/improvement/server/seal/score.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T7` — Requisitos, mínimo y aprobación de dos socios en Summum

**Depends on:** `E2-T5`, `E2-T4` · **Priority:** p0 — metadata for scope cuts, not a running order

Todo con `assertDockOwner` del muelle de la fila. Mismo patrón de dos firmas que
`server/fees/changes.ts` (la base lo exige con su check; aquí se valida antes para dar el mensaje).

- `server/seal/requirements.ts`: `upsertSettings(userId, muelleId, input)` — `{ minSealScore (entero ≥ 0 |
  null), graceDays (1-365), proposalMinSeverity (1-3) }`; `createRequirement(userId, muelleId, input)` —
  `{ code: /^[a-z0-9-]{2,40}$/, title (3-160), description (≤2000), points (1-100), source (SEAL_SOURCES),
  config }` donde `kpi` exige `{ source: string, config: object, op: "gte"|"lte", threshold: number }` y
  `manual` exige `{}`; `setRequirementActive(userId, requirementId, active)`; `markManualResult(userId,
  requirementId, subject, met, evidenceNote)` — el requisito debe ser `manual` y el sujeto del mismo muelle
  (barco con `parent_org_id = muelle`, afiliada con `muelle_org_id = muelle`); upsert; `listRequirements`,
  `getSettings`.
- `server/seal/approvals.ts`: `approveEvaluation(userId, evaluationId)` — evaluación `pendiente`; sin
  primera firma → la fija; con primera firma del mismo `userId` → `"Necesita la firma del otro dueño."`; con
  la de otro → `second_approver_id`, `approval_status = 'aprobada'`, `approved_at = now`, `vigencia =
  'vigente'`, `risk_since = null` (update condicionado a `approval_status = 'pendiente'` como en
  `decideFeeChange`); ya decidida → `"Este cambio ya se decidió."`. `rejectEvaluation(userId,
  evaluationId)` → `rechazada`. `listEvaluations(userId, muelleId)` con nombre del sujeto.
- La pantalla del Sello llega en el paso 18.

**Files**
- `apps/summum/server/seal/requirements.ts` — new: ajustes del muelle, requisitos y marcas manuales
- `apps/summum/server/seal/approvals.ts` — new: aprobar y rechazar evaluaciones (dos firmas)
- `apps/summum/tests/seal-approvals.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** el primer socio aprueba una evaluación `pendiente` **THE SYSTEM SHALL** guardar `first_approver_id` y dejarla `pendiente`, WHEN el mismo socio aprueba otra vez THE SYSTEM SHALL devolver `{ ok: false, error: "Necesita la firma del otro dueño." }`, y WHEN aprueba el otro socio THE SYSTEM SHALL dejarla `aprobada` con `vigencia` `vigente` y `approved_at` no nulo.
2. **WHEN** se aprueba o rechaza una evaluación ya `aprobada` o `rechazada` **THE SYSTEM SHALL** devolver `{ ok: false, error: "Este cambio ya se decidió." }`.
3. **WHEN** un perfil que no es dueño del muelle llama `approveEvaluation`, `createRequirement` o `upsertSettings` **THE SYSTEM SHALL** lanzar el 404 de `assertDockOwner`.
4. **WHEN** `createRequirement` corre en un muelle sin requisitos **THE SYSTEM SHALL** crear la fila, y WHEN recibe un `code` inválido o un `kpi` sin `threshold` THE SYSTEM SHALL devolver `{ ok: false, error: "Revisa los datos del formulario." }`.
5. **WHEN** `markManualResult` recibe un barco de otro muelle o un requisito `kpi` **THE SYSTEM SHALL** devolver `ok: false` sin escribir.
6. **WHEN** `upsertSettings` recibe `minSealScore` null **THE SYSTEM SHALL** guardarlo, y WHEN recibe `graceDays` 0 THE SYSTEM SHALL devolver `ok: false`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test tests/seal-approvals.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/seal || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/seal/requirements.ts apps/summum/server/seal/approvals.ts apps/summum/tests/seal-approvals.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T7 (step 17): requisitos del Sello y aprobación de dos socios"
git tag step-17-si-sello-socios
git ls-files --error-unmatch apps/summum/server/seal/approvals.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T8` — Pantallas de afiliadas y del Sello en Summum

**Depends on:** `E2-T7` · **Priority:** p0 — metadata for scope cuts, not a running order

Las tres pantallas sobre los motores de los pasos 14 y 17, abiertas en el e2e en el mismo paso.

- `app/muelle/[muelleId]/afiliadas/page.tsx`: `requireDockOwnership(muelleId, path)`; `h1` "Afiliadas";
  formulario de especialidades, formulario de alta (correo, nombre, casillas de especialidad), lista con su
  estado y botón para suspender/reactivar.
- `app/red/[muelleId]/afiliada/page.tsx`: sesión (`getSessionUserId`; sin sesión → `/login?returnTo=`);
  `getMyAffiliate` (null → `notFound()`); `h1` "Mi perfil de afiliada"; perfil público (bio, opt-in al
  directorio, mi negocio en Improvement de `listMyBarcos`) y el cuestionario de `PERSONALITY_QUESTIONS`
  (un `fieldset` con `legend` por pregunta, radios con `label`).
- `app/muelle/[muelleId]/sello/page.tsx`: `requireDockOwnership`; `h1` "Sello Cénit"; ajustes (mínimo,
  días de gracia, severidad para proponer especialistas), requisitos (lista con puntos, fuente y activo;
  formulario nuevo), marcas manuales por sujeto, evaluaciones pendientes con `Aprobar`/`Rechazar` y quién
  ya firmó, y las aprobadas con su vigencia en texto. Si no hay mínimo: "Sin mínimo definido: nadie se
  puede certificar todavía."
- `layout.tsx` del muelle: agrega los enlaces `Afiliadas` y `Sello` a la navegación.
- `tests/e2e/red.spec.ts` — spec nuevo, `test.describe.configure({ mode: "serial" })`; sesión con la cookie
  `sum-access-token` (de `server/auth/guard.ts`) y el token de `signInTestUser`; siembra con
  `@jotapuntoce/db` como `tests/e2e/cobro.spec.ts`. `beforeAll`: un muelle con un dueño con sesión y sin
  `muelle_settings`, la especialidad `comercial`, una afiliada `activa` con sesión y un perfil sin relación
  con el muelle. `afterAll` borra el muelle (cascade), luego los profiles y los usuarios de Auth. Los pasos
  siguientes que agregan pantallas de Summum extienden este mismo archivo.

**Files**
- `apps/summum/app/muelle/[muelleId]/afiliadas/page.tsx` — new: panel de los socios
- `apps/summum/app/red/[muelleId]/afiliada/page.tsx` — new: la afiliada ve su perfil y contesta
- `apps/summum/app/muelle/[muelleId]/sello/page.tsx` — new: panel del Sello de los socios
- `apps/summum/app/muelle/[muelleId]/layout.tsx` — edit: enlaces `Afiliadas` y `Sello`
- `apps/summum/tests/e2e/red.spec.ts` — new: spec serial de la red (este paso y los que agregan pantallas de Summum)

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** un dueño del muelle abre `/muelle/[muelleId]/afiliadas` **THE SYSTEM SHALL** responder 200 con un `h1` `Afiliadas` y la afiliada sembrada en la lista.
2. **WHEN** un dueño del muelle abre `/muelle/[muelleId]/sello` en un muelle sin `muelle_settings` **THE SYSTEM SHALL** responder 200 con un `h1` `Sello Cénit` y el texto `Sin mínimo definido: nadie se puede certificar todavía.`
3. **WHEN** la afiliada abre `/red/[muelleId]/afiliada` **THE SYSTEM SHALL** responder 200 con un `h1` `Mi perfil de afiliada` y un `fieldset` por cada pregunta de `PERSONALITY_QUESTIONS`.
4. **WHEN** el perfil sin relación con el muelle abre `/red/[muelleId]/afiliada` o `/muelle/[muelleId]/afiliadas` **THE SYSTEM SHALL** responder 404 en las dos.

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
git add -- ":(literal)apps/summum/app/muelle/[muelleId]/afiliadas/page.tsx" ":(literal)apps/summum/app/red/[muelleId]/afiliada/page.tsx" ":(literal)apps/summum/app/muelle/[muelleId]/sello/page.tsx" ":(literal)apps/summum/app/muelle/[muelleId]/layout.tsx" apps/summum/tests/e2e/red.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T8 (step 18): pantallas de afiliadas y del Sello"
git tag step-18-si-afiliadas-sello-pantallas
git ls-files --error-unmatch apps/summum/tests/e2e/red.spec.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T9` — Vigencia continua del Sello con cron protegido

**Depends on:** `E2-T6` · **Priority:** p0 — metadata for scope cuts, not a running order

- `server/seal/vigencia.ts`:
  - `nextVigencia({ vigencia, meets, riskSince, now, graceDays })` — puro. `dias = (now − riskSince) /
    86 400 000`. `vigente`: cumple → `vigente`/`riskSince = null`; no cumple → `en_riesgo`/`riskSince = now`.
    `en_riesgo`: cumple → `vigente`/null; no cumple y `dias >= graceDays` → `reevaluacion` (conserva
    `riskSince`); si no, `en_riesgo`. `reevaluacion`: `dias >= 2 × graceDays` → `suspendido`; si no,
    `reevaluacion` (aunque cumpla: volver exige una aprobación nueva de los socios). `suspendido` se queda.
  - `runSealCycle({ now = new Date(), muelleId }: { now?: Date; muelleId?: string } = {})` — por cada
    `muelle_settings` (o solo la de `muelleId` cuando viene: las pruebas siempre pasan el muelle de su fixture,
    porque el Supabase es el compartido con producción): sujetos = barcos con `parent_org_id = muelle`
    y afiliadas `activa`; `computeSealScore`; la última evaluación `aprobada` del sujeto con vigencia
    `vigente`/`en_riesgo`/`reevaluacion` recibe `score`, `min_score`, `last_computed_at` y la transición de
    `nextVigencia`; si el sujeto no tiene esa evaluación (o está `suspendido`) y `meets`, se crea o actualiza
    **una** evaluación `pendiente` con su puntaje (nunca dos: el índice parcial lo impide). Devuelve
    `{ evaluated, transitions, pending }`.
- `app/api/cron/sello/route.ts`: mismo patrón que `app/api/cron/reminders/route.ts` — sin `CRON_SECRET` o
  sin `Authorization: Bearer <CRON_SECRET>` → 401 `UNAUTHENTICATED` sin tocar nada; si no,
  `runSealCycle()` sin alcance (todos los muelles) y `{ ok: true, data }`. El paso 21 le agrega `generateProposals`.
- `tests/seal-vigencia.test.ts`: cada llamada a `runSealCycle` pasa `{ now, muelleId }` del muelle que crea la prueba.
- `vercel.json`: agrega `{ "path": "/api/cron/sello", "schedule": "0 12 * * *" }` al arreglo `crons`; el de
  `revisiones` se queda igual.

**Files**
- `apps/improvement/server/seal/vigencia.ts` — new: `nextVigencia` (puro) y `runSealCycle`
- `apps/improvement/app/api/cron/sello/route.ts` — new: `GET` con bearer `CRON_SECRET`
- `apps/improvement/vercel.json` — edit: el cron `/api/cron/sello`
- `apps/improvement/tests/seal-vigencia.test.ts` — new

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** `nextVigencia` recibe `vigente` sin cumplir **THE SYSTEM SHALL** devolver `en_riesgo` con `riskSince` igual a `now`, y WHEN recibe `en_riesgo` cumpliendo THE SYSTEM SHALL devolver `vigente` con `riskSince` null.
2. **WHEN** `nextVigencia` recibe `en_riesgo` sin cumplir con `riskSince` `2026-09-01T00:00:00Z`, `graceDays` 30 y `now` `2026-10-01T00:00:00Z` **THE SYSTEM SHALL** devolver `reevaluacion`; con `now` `2026-09-30T23:59:00Z` SHALL devolver `en_riesgo`; y con `reevaluacion` y `now` `2026-10-31T00:00:00Z` SHALL devolver `suspendido`.
3. **WHEN** `runSealCycle` corre dos veces sobre un barco que cumple el mínimo y no tiene evaluaciones **THE SYSTEM SHALL** dejar exactamente una `seal_evaluation` `pendiente` con su puntaje.
4. **WHEN** un barco con evaluación `aprobada` `vigente` baja del mínimo y corre `runSealCycle` **THE SYSTEM SHALL** dejarla `en_riesgo` con `risk_since` igual a `now`.
5. **WHEN** `GET /api/cron/sello` llega con `Authorization: Bearer incorrecto` **THE SYSTEM SHALL** responder 401 sin escribir ninguna `seal_evaluation`.
6. **WHEN** se lee `apps/improvement/vercel.json` **THE SYSTEM SHALL** contener un cron con `path` `/api/cron/sello`.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter improvement test tests/seal-vigencia.test.ts tests/seal-score.test.ts
grep -qF '"/api/cron/sello"' apps/improvement/vercel.json
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/improvement/server/seal/vigencia.ts apps/improvement/app/api/cron/sello/route.ts apps/improvement/vercel.json apps/improvement/tests/seal-vigencia.test.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T9 (step 19): vigencia del Sello por cron"
git tag step-19-si-sello-vigencia
git ls-files --error-unmatch apps/improvement/app/api/cron/sello/route.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

### `E2-T10` — Directorio público con perfil y Sello

**Depends on:** `E2-T8`, `E2-T9` · **Priority:** p1 — metadata for scope cuts, not a running order

- `server/directory/directory.ts` (rutas sin sesión: solo columnas explícitas, nunca un id interno, un monto
  ni una nota):
  - `listDirectory()` — sujetos con opt-in (`affiliate.directory_opt_in` o `barco_listing.opt_in`) cuya
    evaluación `aprobada` más reciente tiene `vigencia` `vigente` o `en_riesgo`; devuelve `{ kind,
    displayName, slug, publicBio, score, vigencia, approvedAt }` por nombre.
  - `getDirectoryEntry(slug)` — lo mismo para un `slug` (`affiliate.public_slug` o `barco_listing.public_slug`)
    o `null`.
  - `saveBarcoListing(userId, barcoId, input)` — `assertBarcoOwner`; `{ publicSlug: /^[a-z0-9-]{3,60}$/,
    publicBio (≤1000 | null), optIn }`; el slug no puede existir ya en `affiliate.public_slug` ni en otro
    `barco_listing` (si no: `"Revisa los datos del formulario."`).
- `app/directorio/page.tsx`: sin guard; `h1` "Directorio Summum"; una tarjeta por entrada con nombre, tipo
  (`Negocio`/`Afiliada`), estado en texto (`Vigente` / `En riesgo`) y `Puntaje N`; enlace a
  `/directorio/[slug]`. `metadata` con título.
- `app/directorio/[slug]/page.tsx`: `getDirectoryEntry` (null → `notFound()`); nombre, bio, `Puntaje N`,
  estado y "Certificado desde <fecha es-MX>".
- `app/barco/[orgId]/page.tsx`: sin quitar nada, agrega una sección "Directorio" con el estado de su Sello
  (texto) y el formulario de `saveBarcoListing`.
- `tests/e2e/red.spec.ts` (lo creó el paso 18): agrega a `beforeAll` el opt-in y una evaluación aprobada
  `vigente` de 30 puntos para la afiliada sembrada, otra afiliada con opt-in y solo evaluación `pendiente`,
  y un barco con dueño de prueba y evaluación aprobada `en_riesgo` sin listing. `afterAll` sigue borrando
  todo.

**Files**
- `apps/summum/server/directory/directory.ts` — new: listado, ficha y opt-in del barco
- `apps/summum/app/directorio/page.tsx` — new: directorio público
- `apps/summum/app/directorio/[slug]/page.tsx` — new: perfil público
- `apps/summum/app/barco/[orgId]/page.tsx` — edit: su Sello y el opt-in al directorio
- `apps/summum/tests/e2e/red.spec.ts` — edit: el directorio público

**Acceptance**

Copied from this task's `acceptance` array in `tasks.json` — identical after the emphasis normalization defined in `agents/blueprint-writer.md` *Acceptance strings*. Each one is decidable by a
command below, on this machine, during the build.

1. **WHEN** un visitante sin sesión abre `/directorio` **THE SYSTEM SHALL** responder 200 con la afiliada aprobada y `Vigente`, sin la afiliada que solo tiene una evaluación `pendiente` y sin el barco que no dio opt-in.
2. **WHEN** un visitante abre `/directorio/<slug de la afiliada>` **THE SYSTEM SHALL** responder 200 con su nombre y `Puntaje 30`, y WHEN abre `/directorio/no-existe` THE SYSTEM SHALL responder 404.
3. **WHEN** el dueño del barco guarda el opt-in con un slug en `/barco/[orgId]` **THE SYSTEM SHALL** hacer que `/directorio` muestre ese barco con el texto `En riesgo`.
4. **WHEN** se descarga el HTML de `/directorio` **THE SYSTEM SHALL** no contener el id del barco ni el id de ninguna afiliada.

**Verify** — every command, in order, run from the project root. Each one exits 0 when this task is
correct; the last one exiting 0 is what makes the task done.

```bash
pnpm --filter @jotapuntoce/summum test:e2e red.spec.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/summum/server/directory || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint**

```bash
git add -- apps/summum/server/directory/directory.ts apps/summum/app/directorio/page.tsx ":(literal)apps/summum/app/directorio/[slug]/page.tsx" ":(literal)apps/summum/app/barco/[orgId]/page.tsx" apps/summum/tests/e2e/red.spec.ts blueprints/summum-improvement/tasks.json
git commit -m "E2-T10 (step 20): directorio público con Sello"
git tag step-20-si-directorio
git ls-files --error-unmatch apps/summum/tests/e2e/red.spec.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

Run the commit and tag after the last `Verify` command exits 0, before starting the next task. The tag
is this task's rollback target and the thing the build's final gate counts. Never invent the tag: copy
the `checkpoint` field from `tasks.json`.

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** un visitante sin sesión abre `/directorio` **THE SYSTEM SHALL** listar solo sujetos con opt-in propio y una evaluación aprobada con vigencia `vigente` o `en_riesgo`.
2. **WHEN** `GET /api/cron/sello` llega sin el bearer correcto **THE SYSTEM SHALL** responder 401 sin escribir nada.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @jotapuntoce/summum test:e2e red.spec.ts
```

## Pitfalls

- **Importar `apps/improvement` desde `apps/summum`** (o al revés) — no son dependencias entre sí; lo compartido vive en `packages/db`.
- **Dos evaluaciones `pendiente`** — el índice parcial lo impide; actualiza la existente.
- **Mensajes de error nuevos en Summum** — usa los de `server/error-codes.ts`; un código desconocido se pinta como "no-se-pudo".
- **El e2e de Summum** usa `pnpm dev` en el puerto 3300 y la cookie `sum-access-token`; apaga otro servidor en ese puerto.

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
