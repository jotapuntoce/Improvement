# Epic 02: Oficina 2D por giro

> Al terminar, el dueño sube hasta 6 fotos de su espacio a un bucket privado, la IA propone un borrador (áreas, puestos, tema, logo) validado con zod, el dueño lo revisa y lo confirma en `/[org]/oficina`, y la empresa se ve como una oficina pixel-art 2D con una zona por área — sin reemplazar el Lobby.

| | |
|---|---|
| **Epic id** | `02-oficina` |
| **Tasks** | `E2-T1` … `E2-T9` |
| **Depends on** | `01-base` |
| **Unlocks** | `03-agentes` (el esquema de agentes cuelga de las áreas confirmadas) |
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
  src/schema.ts                                    # exists, you will edit it (E2-T1)
  migrations/                                      # db:generate + --custom oficina_rls
packages/ui/
  package.json                                     # exists, you will edit it (E2-T5, E2-T7: exports)
  src/building/officeLayout.ts                     # NEW (E2-T5) — puro
  src/building/officeScene.ts                      # NEW (E2-T7) — puro
  src/building/Office.tsx                          # NEW (E2-T7) — SVG, sin estado
  src/building/Lobby.tsx                           # exists, read-only (convive)
apps/improvement/
  server/office/photos.ts                          # NEW (E2-T2)
  server/office/proposal.ts, analyze.ts            # NEW (E2-T4)
  server/office/confirm.ts, loadOffice.ts          # NEW (E2-T6)
  server/lobby/loadLobby.ts                        # exists, you will edit it (E2-T6: OFICINAS_DIGITALES fuera de las puertas)
  server/ai/gateway.ts                             # exists, you will edit it (E2-T3: imágenes, propósitos, tope diario)
  server/ai/prompts/office.ts                      # NEW (E2-T4)
  server/permissions/sections.ts                   # exists, you will edit it (E2-T8: `oficina`, OFICINAS_SLUGS)
  server/companies/theme.ts                        # exists (epic 01), read-only
  app/[org]/oficina/page.tsx, actions.ts           # NEW (E2-T8)
  app/[org]/layout.tsx                             # exists, you will edit it (E2-T8: nav "Oficinas digitales")
  app/empresas/[orgId]/page.tsx,
       BuildingExperience.tsx                      # exist, you will edit them (E2-T9: Office si hay plano confirmado)
  tests/oficina-schema, office-photos, ai-gateway-vision, office-analyze,
        office-layout, office-confirm, office-scene, lobby-oficinas (.test.ts)   # NEW
  tests/ai-gateway.test.ts, a11y spec              # exist, read-only (deben seguir pasando)
  tests/e2e/oficina.spec.ts                        # NEW (E2-T8), grows in E2-T9
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not listed
here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `office_plan` | `org_id`, `status` (`draft`\|`confirmed`), `source_photos` text[] ≤ 6, `proposal` jsonb, `logo` jsonb, `confirmed_at`, `confirmed_by`, `created_by` | Único (`org_id`, `status`): un borrador y un confirmado por org |
| `office_zone` | `org_id`, `plan_id`, `area_id` (solo `kind = 'area'`), `kind`, `label`, `x`, `y`, `w`, `h` | Cabe en 40×24 (check) |
| `area`, `seat` (existentes) | se leen y se crean al confirmar | `seat` = Accountability Chart, sin cambio de significado |
| `organization.theme` (epic 01) | se escribe al confirmar si la propuesta pasa AA | |
| `storage.buckets` `espacios` | privado; carpeta `<orgId>/` | Políticas solo-dueño en `oficina_rls` |

Columnas completas, checks e índices: en el **Do** de E2-T1 y en el apéndice de abajo, copiado literal de
`blueprint.md` §4.

### Apéndice de esquema (copia de blueprint.md §4)

#### `oficina_rls`

```sql
-- Custom SQL migration file, put your code below! --
-- Oficina 2D. El plano confirmado y sus zonas los lee cualquier miembro del org; el borrador (fotos y
-- propuesta de la IA) solo el dueño. Solo lectura para `authenticated`: toda escritura pasa por
-- apps/improvement/server/office/** con el cliente `db` (rol dueño de las tablas, RLS no aplica).
alter table office_plan enable row level security;
create policy "members read the confirmed office plan, owners read drafts too"
  on office_plan for select
  using (exists (
    select 1 from membership m
    where m.org_id = office_plan.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or office_plan.status = 'confirmed')));

alter table office_zone enable row level security;
create policy "members read zones of their org's confirmed office plan"
  on office_zone for select
  using (exists (
    select 1 from office_plan p
    join membership m on m.org_id = p.org_id
    where p.id = office_zone.plan_id and m.user_id = auth.uid()
      and (m.role = 'owner' or p.status = 'confirmed')));

grant select on office_plan, office_zone to authenticated;

-- Bucket PRIVADO `espacios`: fotos del local, con datos personales posibles. Ruta `{orgId}/{uuid}.{ext}`;
-- el primer segmento es el org y solo su dueño lee, sube o borra. Sin política de update: las fotos no
-- se reemplazan, se suben de nuevo. on conflict do nothing: el bucket podría existir.
insert into storage.buckets (id, name, public)
values ('espacios', 'espacios', false)
on conflict (id) do nothing;

drop policy if exists "owners read their org's space photos" on storage.objects;
create policy "owners read their org's space photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'espacios' and exists (
    select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));

drop policy if exists "owners upload their org's space photos" on storage.objects;
create policy "owners upload their org's space photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'espacios' and exists (
    select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));

drop policy if exists "owners delete their org's space photos" on storage.objects;
create policy "owners delete their org's space photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'espacios' and exists (
    select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));
```

## Propuesta de oficina (copia de blueprint.md §4)

`apps/improvement/server/office/proposal.ts` — lo que la IA devuelve y lo único que se guarda en
`office_plan.proposal`. `orgThemeSchema` es el de `server/companies/theme.ts` (paso 4).

```ts
export const officeProposalSchema = z.object({
  areas: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        seats: z.array(z.object({ title: z.string().trim().min(1).max(40) })).max(6),
      }),
    )
    .min(1)
    .max(12),
  theme: orgThemeSchema.nullable(),
  logo: z.object({ present: z.boolean(), description: z.string().max(200) }),
  notes: z.string().max(300),
});
export type OfficeProposal = z.infer<typeof officeProposalSchema>;
```

- `areas[].color` pinta el piso de la zona en la escena; no es un token de diseño y no pasa por el tema.
- `theme` es una sugerencia: al confirmar se aplica solo si `themeIssues(theme)` es `[]`; si no, el plano se
  confirma igual y la respuesta trae `themeSkipped: true`.
- Nunca hay un campo para personas, rostros ni nombres de empleados.

## Acomodo de la oficina (copia de blueprint.md §4)

`packages/ui/src/building/officeLayout.ts` — función pura; la cuadrícula es de 40 columnas × 24 filas y
cada zona es `{ kind, label, areaId?, x, y, w, h }` en celdas (x, y desde 1).

| Zona fija | `kind` | `label` | x | y | w | h |
|---|---|---|---|---|---|---|
| Dirección | `direccion` | Dirección | 1 | 1 | 12 | 6 |
| Sala de juntas | `sala` | Sala de juntas | 27 | 1 | 12 | 6 |
| Recepción | `recepcion` | Recepción | 14 | 18 | 12 | 5 |

Áreas (1 a 12; 13 o más → `RangeError("officeLayout: máximo 12 áreas")`), en la franja de las filas 8-17:

1. **Orden.** Primero las áreas cuyo nombre normalizado (minúsculas, sin acentos, sin espacios a los lados)
   está en la plantilla del giro, en el orden de la plantilla; después el resto, por nombre con
   `localeCompare(…, "es")`.
2. **Rejilla.** `n` = número de áreas; `r = ceil(n / 4)` filas; `c = ceil(n / r)` columnas;
   `cellW = floor(38 / c)`; `cellH = floor(10 / r)`.
3. **Zona i** (`row = floor(i / c)`, `col = i % c`): `x = 1 + col·cellW`, `y = 8 + row·cellH`,
   `w = cellW − 1`, `h = cellH − 1`.

Resultado: las zonas de área en ese orden, seguidas de las tres fijas. Ejemplo verificado a mano (plantilla
de `restaurante`, áreas Ventas, Cocina y Caja → `n = 3`, `r = 1`, `c = 3`, `cellW = 12`, `cellH = 10`):

| Área | x | y | w | h |
|---|---|---|---|---|
| Cocina | 1 | 8 | 11 | 9 |
| Caja | 13 | 8 | 11 | 9 |
| Ventas | 25 | 8 | 11 | 9 |

Con 12 áreas (`r = 3`, `c = 4`, `cellW = 9`, `cellH = 3`) la última zona termina en la columna 35 y la fila
15: ninguna toca Dirección/Sala (filas 1-6) ni Recepción (filas 18-22), y todas cumplen el check
`office_zone_grid_check` (`x + w <= 40`, `y + h <= 24`).

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/auth/guard.ts` → `findMembership`, `findOwnerMembership`, `resolveSection`, `requireSection` | 404 nunca 403 |
| repo | `server/ai/gateway.ts` → `generateStructured`, `SuggestionProvider`, `MODEL_ID` | Único import de `@anthropic-ai/sdk`; `MODEL_ID` no cambia |
| repo | `packages/ui/src/building/Lobby.tsx`, `BuildingExperience.tsx`, `server/lobby/loadLobby.ts` | El Lobby sigue igual sin plano confirmado: las cinco secciones nuevas nunca son puertas (E2-T6) |
| `01-base` | `industryAreas`, `baseIndustry`, `orgThemeSchema`, `themeIssues` | Ver epic 01 |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `server/ai/gateway.ts` → `generateStructured` (extendido) | `+ images?: GatewayImage[]`, `+ maxOutputTokens?`, `purpose` + `oficina`\|`agente`\|`reporte`, `category` + `oficina`\|`agente`; `MAX_IMAGES_PER_CALL = 6`, `MAX_CALLS_PER_ORG_PER_DAY = 100` | `03` (encargos y reporte) |
| `packages/ui/src/building/officeLayout.ts` → `OFFICE_GRID`, `FIXED_ZONES`, `officeLayout` | `officeLayout(template, areas): OfficeZone[]` | E2-T6, E2-T7 |
| `server/office/loadOffice.ts` → `loadOffice`, `loadOfficeDraft` | `loadOffice(userId, orgId): Promise<OfficeView \| null>` | E2-T9, `03` (canal muestra la oficina) |
| `server/permissions/sections.ts` → `OFICINAS_SLUGS` | `readonly SectionSlug[]`, empieza con `["oficina"]` | `03`, `04`, `05`, `06` agregan el suyo |

## Conventions that bite in this area

- **Dos puertas.** El cliente `db` conecta como dueño de las tablas: RLS **no** corre en el camino de la
  app. Las fotos se leen y escriben con el cliente de Storage **del usuario** (su JWT), así que ahí sí
  aplican las políticas del bucket; nunca con la service-role key.
- **La IA solo propone.** `analyzeSpace` escribe un `draft`; nada cambia en `area`, `seat` ni
  `organization` hasta `confirmOfficePlan`. Nunca reconocimiento facial ni descripción de personas.
- **Import relativo con `.ts` explícito**; `@/` solo en páginas; sin barrels.
- **Las migraciones generadas no se editan.** Lo único escrito a mano en `packages/db/migrations/` es el
  archivo que crea `--custom --name=oficina_rls`, con el SQL de este epic.
- **Motor genérico:** ningún uuid, slug ni nombre de cliente literal en `server/**` (lo comprueba un `grep`).
- **`git add` de rutas con corchetes** (`[org]`, `[orgId]`) usa `":(literal)…"`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/oficinas-digitales.md`,
`.claude/rules/ia-gateway.md`, `.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`.

---

## Tasks

### `E2-T1` — Esquema de la oficina 2D, bucket privado y su RLS

**Depends on:** `E1-T3` · **Priority:** p0 · **Step:** 6

1. `packages/db/src/schema.ts`, junto a `seat`:
   - `OFFICE_PLAN_STATUSES = ["draft", "confirmed"] as const`, `OFFICE_ZONE_KINDS = ["area", "recepcion", "direccion", "sala"] as const`.
   - `office_plan`: `id`, `org_id` (→ organization, cascade, not null), `status` (`OFFICE_PLAN_STATUSES`, not null,
     default `"draft"`), `source_photos` (`text().array()`, not null, default `sql\`'{}'::text[]\``), `proposal`
     (jsonb, not null), `logo` (jsonb, null), `confirmed_at` (timestamptz, null), `confirmed_by` y `created_by`
     (uuid → profile, on delete set null), `created_at`, `updated_at`. Check `office_plan_status_check`, check
     `office_plan_photos_max` (`cardinality(source_photos) <= 6`), `uniqueIndex("uq_office_plan_org_status")`
     sobre (`org_id`, `status`): a lo más un borrador y un plano confirmado por org.
   - `office_zone`: `id`, `org_id` (cascade), `plan_id` (→ office_plan, cascade, not null), `area_id` (→ area,
     cascade, null), `kind` (`OFFICE_ZONE_KINDS`, not null), `label` text not null, `x`, `y`, `w`, `h` integer
     not null. Checks `office_zone_kind_check`, `office_zone_grid_check`
     (`x >= 0 and y >= 0 and w >= 1 and h >= 1 and x + w <= 40 and y + h <= 24`) y
     `office_zone_area_kind_check` (`(kind = 'area') = (area_id is not null)`). Índice `idx_office_zone_plan`.
2. `pnpm db:generate`.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=oficina_rls` y pega en el archivo
   `*_oficina_rls.sql` que crea, completo, el SQL de §4 *Migración `oficina_rls`*.
4. `apps/improvement/tests/oficina-schema.test.ts` con el patrón `asUser()` de `tests/muelle-schema.test.ts`.
5. **Aprobación obligatoria.** Muestra a Jose Carlos los dos SQL nuevos y espera un "sí" explícito en el
   chat. Sin "sí", detente y reporta.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts`
- `packages/db/migrations/**`
- `apps/improvement/tests/oficina-schema.test.ts`

**Acceptance**
1. **WHEN** se insertan un `office_plan` en `draft` y una `office_zone` `area` ligada a un área **THE SYSTEM SHALL** aceptarlos, y **WHEN** se inserta un segundo `draft` para el mismo org **THE SYSTEM SHALL** rechazarlo.
2. **WHEN** se inserta una `office_zone` con `x` 35 y `w` 6, o una zona `recepcion` con `area_id` **THE SYSTEM SHALL** rechazar cada insert en la base.
3. **WHEN** un empleado del org consulta `office_plan` como rol `authenticated` **THE SYSTEM SHALL** ver el plano `confirmed` y no ver el `draft`, y **WHEN** consulta el dueño **THE SYSTEM SHALL** ver los dos.
4. **WHEN** un perfil sin membresía consulta `office_plan` u `office_zone` como `authenticated` **THE SYSTEM SHALL** devolver 0 filas.
5. **WHEN** se consulta `storage.buckets` **THE SYSTEM SHALL** tener el bucket `espacios` con `public` en `false`.
6. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**
```bash
grep -q "values ('espacios', 'espacios', false)" packages/db/migrations/*.sql
pnpm --filter improvement test tests/oficina-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/oficina-schema.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T1 (step 6): esquema office_plan/office_zone, bucket espacios y RLS"
git tag step-06-od-oficina-esquema
git ls-files --error-unmatch apps/improvement/tests/oficina-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E2-T2` — Fotos del espacio en el bucket privado

**Depends on:** `E2-T1` · **Priority:** p0 · **Step:** 7

`apps/improvement/server/office/photos.ts`, mismo estilo que `server/storage/avatar.ts` (resultado tipado,
token del usuario, nunca service-role):
1. `MAX_SPACE_PHOTOS = 6`, `MAX_PHOTO_BYTES = 5 * 1024 * 1024`, tipos `image/jpeg`, `image/png`, `image/webp`
   (extensiones `jpg`, `png`, `webp`).
2. `interface SpaceStorage { upload(path, bytes: Uint8Array, contentType): Promise<{ error: string | null }>; download(path): Promise<{ data: { bytes: Uint8Array; contentType: string } | null; error: string | null }> }`
   y `userSpaceStorage(accessToken)`: `createClient(URL, ANON_KEY, { global: { headers: { Authorization: \`Bearer ${accessToken}\` } } })`
   sobre el bucket `espacios`. La política de storage (paso 6) es la que impide escribir en otro org.
3. `uploadSpacePhotos(userId, orgId, files: File[], storage?)`: `findOwnerMembership` primero (si no,
   `NOT_FOUND`); 1-6 archivos, tipo y tamaño válidos (`VALIDATION_ERROR` con mensaje en español, sin subir
   nada); ruta `${orgId}/${crypto.randomUUID()}.${ext}`; devuelve las rutas. Sin `storage`, usa
   `userSpaceStorage(await getSessionAccessToken())`.
4. `readSpacePhotos(userId, orgId, paths, storage?)`: dueño; toda ruta debe empezar con `${orgId}/`
   (`VALIDATION_ERROR` si no); devuelve `{ mediaType, data }` en base64 por foto.
5. `apps/improvement/tests/office-photos.test.ts` con un `SpaceStorage` falso en memoria.

**Files**
- `apps/improvement/server/office/photos.ts`
- `apps/improvement/tests/office-photos.test.ts`

**Acceptance**
1. **WHEN** el dueño sube 7 fotos, un `image/gif` o una foto de 6 MB **THE SYSTEM SHALL** devolver `ok: false` con `VALIDATION_ERROR` sin llamar a `upload`.
2. **WHEN** el dueño sube 2 fotos válidas **THE SYSTEM SHALL** devolver 2 rutas que empiezan con `<orgId>/` y terminan en la extensión de su tipo.
3. **WHEN** un empleado llama `uploadSpacePhotos` o `readSpacePhotos` **THE SYSTEM SHALL** devolver `ok: false` con `NOT_FOUND` sin tocar el storage.
4. **WHEN** `readSpacePhotos` recibe una ruta de otro org **THE SYSTEM SHALL** devolver `VALIDATION_ERROR` sin descargarla.

**Verify**
```bash
pnpm --filter improvement test tests/office-photos.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/office || status=$?; test "$status" -eq 1
status=0; grep -rn 'SUPABASE_SERVICE_ROLE_KEY' apps/improvement/server || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/office/photos.ts apps/improvement/tests/office-photos.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T2 (step 7): fotos del espacio en bucket privado con token del usuario"
git tag step-07-od-fotos
git ls-files --error-unmatch apps/improvement/server/office/photos.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E2-T3` — Gateway con imágenes, propósitos nuevos y tope diario

**Depends on:** `E1-T3` · **Priority:** p0 · **Step:** 8

`apps/improvement/server/ai/gateway.ts` sigue siendo el único import de `@anthropic-ai/sdk`. `MODEL_ID` y
`PRICING_USD_PER_MTOK` **no se tocan**.
1. `export interface GatewayImage { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }` (base64).
2. `SuggestionProvider.complete(system, prompt, options?: { images?: readonly GatewayImage[]; maxTokens?: number })`.
   `AnthropicSuggestionProvider`: sin imágenes, el mismo `messages` de hoy; con imágenes,
   `content: [...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.data } })), { type: "text", text: prompt }]`;
   `max_tokens: options?.maxTokens ?? MAX_OUTPUT_TOKENS`.
3. `generateStructured`: `purpose` agrega `"oficina" | "agente" | "reporte"`, `category` agrega
   `"oficina" | "agente"`, y acepta `images?` y `maxOutputTokens?` que pasa a `complete`.
4. `MAX_IMAGES_PER_CALL = 6` y `MAX_CALLS_PER_ORG_PER_DAY = 100`. En `generateStructured`, después del tope por
   hora y **antes** de resolver el proveedor: más de 6 imágenes → `{ ok: false, error: { code: "VALIDATION_ERROR", retryable: false, message: "Máximo 6 imágenes por análisis." } }`;
   `hasReachedDailyLimit(orgId)` (filas de `llm_calls` del org con `created_at` en las últimas 24 h, todos los
   propósitos, `>= 100`) → `{ ok: false, error: { code: "RATE_LIMITED", retryable: false, message: "Tope diario de IA alcanzado para esta empresa." } }`.
5. `apps/improvement/tests/ai-gateway-vision.test.ts` con un proveedor falso que registra sus argumentos (mismo
   estilo que el `FakeProvider` de `tests/ai-gateway.test.ts`); `tests/ai-gateway.test.ts` sigue pasando sin
   cambios.

**Files**
- `apps/improvement/server/ai/gateway.ts`
- `apps/improvement/tests/ai-gateway-vision.test.ts`

**Acceptance**
1. **WHEN** `generateStructured` recibe 2 imágenes **THE SYSTEM SHALL** pasar las 2 imágenes al proveedor y guardar una fila en `llm_calls` con `purpose` `oficina`.
2. **WHEN** `generateStructured` recibe 7 imágenes **THE SYSTEM SHALL** devolver `VALIDATION_ERROR` sin llamar al proveedor.
3. **WHEN** el org ya tiene 100 filas de `llm_calls` en las últimas 24 horas **THE SYSTEM SHALL** devolver `RATE_LIMITED` sin llamar al proveedor.
4. **WHEN** `pnpm --filter improvement test tests/ai-gateway.test.ts` corre **THE SYSTEM SHALL** pasar sin cambios en ese archivo.

**Verify**
```bash
pnpm --filter improvement test tests/ai-gateway-vision.test.ts
pnpm --filter improvement test tests/ai-gateway.test.ts
test "$(grep -rl '@anthropic-ai/sdk' apps/improvement/server apps/improvement/app)" = apps/improvement/server/ai/gateway.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/ai/gateway.ts apps/improvement/tests/ai-gateway-vision.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T3 (step 8): gateway con imágenes, propósitos oficina/agente/reporte y tope diario"
git tag step-08-od-gateway
git ls-files --error-unmatch apps/improvement/tests/ai-gateway-vision.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E2-T4` — Análisis de las fotos a un borrador validado

**Depends on:** `E2-T2`, `E2-T3` · **Priority:** p0 · **Step:** 9

1. `apps/improvement/server/office/proposal.ts`: `officeProposalSchema` exactamente como §4 *Propuesta de
   oficina* (áreas 1-12 con `name` 1-40, `color` hex y hasta 6 `seats` con `title` 1-40; `theme`
   `orgThemeSchema.nullable()` de `server/companies/theme.ts`; `logo` `{ present, description ≤ 200 }`;
   `notes ≤ 300`) y `type OfficeProposal`.
2. `apps/improvement/server/ai/prompts/office.ts`: `OFFICE_SYSTEM_PROMPT` (en español: describe solo lo que se
   ve; nunca identifica personas ni describe rostros; responde solo el JSON del esquema) y
   `buildOfficePrompt({ industryLabel, industryCustom, templateAreas, existingAreas })` — incluye la plantilla
   del giro (`industryAreas`) y las áreas que el org ya tiene para que la IA las reuse por nombre. Para `otro`
   sin plantilla, pide que proponga las áreas a partir de las fotos y de `industry_custom`.
3. `apps/improvement/server/office/analyze.ts`: `analyzeSpace(userId, orgId, paths, deps?: { storage?, provider? })`
   — dueño primero; `readSpacePhotos`; `generateStructured({ purpose: "oficina", category: "oficina", images, schema: officeProposalSchema, maxOutputTokens: 2048, toText: (p) => \`Propuesta de oficina con ${p.areas.length} áreas\`, basedOn: { fotos: paths } })`;
   con `ok`, en una transacción borra el `draft` previo del org e inserta uno nuevo (`source_photos`,
   `proposal`, `logo`, `created_by`). Devuelve `{ ok: true, data: { planId } }` o el error del gateway tal cual.
4. `apps/improvement/tests/office-analyze.test.ts` con proveedor falso (devuelve JSON fijo) y storage falso.

**Files**
- `apps/improvement/server/ai/prompts/office.ts`
- `apps/improvement/server/office/proposal.ts`
- `apps/improvement/server/office/analyze.ts`
- `apps/improvement/tests/office-analyze.test.ts`

**Acceptance**
1. **WHEN** el proveedor falso devuelve una propuesta válida **THE SYSTEM SHALL** guardar un `office_plan` en `draft` con las rutas en `source_photos` y la propuesta en `proposal`.
2. **WHEN** se analiza dos veces el mismo org **THE SYSTEM SHALL** dejar un solo `draft` para ese org, el de la segunda corrida.
3. **WHEN** el proveedor devuelve dos veces un JSON que no cumple `officeProposalSchema` **THE SYSTEM SHALL** devolver `ok: false` con `VALIDATION_ERROR` sin escribir ningún `office_plan`.
4. **WHEN** un empleado llama `analyzeSpace` **THE SYSTEM SHALL** devolver `ok: false` con `NOT_FOUND` sin llamar al proveedor.

**Verify**
```bash
pnpm --filter improvement test tests/office-analyze.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/office || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/ai/prompts/office.ts apps/improvement/server/office/proposal.ts apps/improvement/server/office/analyze.ts apps/improvement/tests/office-analyze.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T4 (step 9): análisis de fotos a borrador de oficina validado con zod"
git tag step-09-od-analisis
git ls-files --error-unmatch apps/improvement/server/office/analyze.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E2-T5` — Acomodo puro de zonas por plantilla de giro

**Depends on:** `E1-T2` · **Priority:** p0 · **Step:** 10

1. `packages/ui/src/building/officeLayout.ts` (puro, sin React): `OFFICE_GRID = { cols: 40, rows: 24 } as const`,
   `FIXED_ZONES` (`direccion` "Dirección" 1,1,12,6 · `sala` "Sala de juntas" 27,1,12,6 · `recepcion`
   "Recepción" 14,18,12,5) y `officeLayout(template: readonly string[], areas: { id: string; name: string }[])`
   con el algoritmo de §4 *Acomodo de la oficina* (orden: primero las áreas cuyo nombre normalizado está en la
   plantilla, en el orden de la plantilla; luego el resto por nombre con `localeCompare("es")`). Más de 12
   áreas → `RangeError("officeLayout: máximo 12 áreas")`. Devuelve las zonas de área seguidas de las fijas.
2. `packages/ui/package.json`: export `"./building/officeLayout.ts": "./src/building/officeLayout.ts"`.
3. `apps/improvement/tests/office-layout.test.ts`.

**Files**
- `packages/ui/src/building/officeLayout.ts`
- `packages/ui/package.json`
- `apps/improvement/tests/office-layout.test.ts`

**Acceptance**
1. **WHEN** `officeLayout` recibe la plantilla de `restaurante` y las áreas Ventas, Cocina y Caja **THE SYSTEM SHALL** devolver Cocina en (1,8,11,9), Caja en (13,8,11,9) y Ventas en (25,8,11,9).
2. **WHEN** `officeLayout` recibe de 1 a 12 áreas **THE SYSTEM SHALL** devolver zonas que caben en la cuadrícula de 40×24 y no se enciman entre sí ni con las tres zonas fijas.
3. **WHEN** `officeLayout` recibe 13 áreas **THE SYSTEM SHALL** lanzar `RangeError`.

**Verify**
```bash
pnpm --filter improvement test tests/office-layout.test.ts
grep -q '"./building/officeLayout.ts"' packages/ui/package.json
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/ui/src/building/officeLayout.ts packages/ui/package.json apps/improvement/tests/office-layout.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T5 (step 10): acomodo puro de zonas de la oficina en cuadrícula 40x24"
git tag step-10-od-acomodo
git ls-files --error-unmatch packages/ui/src/building/officeLayout.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E2-T6` — Confirmar el plano y mantener las puertas del Lobby

**Depends on:** `E2-T4`, `E2-T5`, `E1-T4` · **Priority:** p0 · **Step:** 11

1. `apps/improvement/server/office/confirm.ts`: `confirmOfficePlan(userId, orgId, planId, edited: unknown)` —
   `findOwnerMembership` (si no, `NOT_FOUND`); el plan debe ser el `draft` de ese org; `edited` se valida con
   `officeProposalSchema` (`VALIDATION_ERROR`). En **una** transacción:
   - cada área: reusa el `area` del org con el mismo nombre normalizado (minúsculas, sin acentos) o la crea
     (`name`, `color`);
   - cada puesto: crea un `seat` (`org_id`, `area_id`, `title`, `roles` `{}`, sin `holder_profile_id`,
     `position` = índice) solo si esa área no tiene ya un `seat` con ese `title`;
   - tema: si `edited.theme` no es null y `themeIssues` da `[]`, escribe `organization.theme`; si falla AA no lo
     escribe y devuelve `themeSkipped: true`;
   - borra el plano `confirmed` anterior del org (sus zonas caen en cascada) y pasa este a `confirmed`
     (`proposal = edited`, `confirmed_at`, `confirmed_by`);
   - inserta `office_zone` = `officeLayout(industryAreas(org.industry), áreas)` (zonas `area` con su `area_id`
     y las 3 fijas).
   Devuelve `{ ok: true, data: { planId, zones, themeSkipped } }`.
2. `apps/improvement/server/office/loadOffice.ts`: `loadOffice(userId, orgId)` — `findMembership` (si no,
   `null`); `null` si el org no tiene plano `confirmed`; si lo tiene, `{ zones: [{ kind, label, x, y, w, h, areaId, color }], people: [{ profileId, name, areaId }] }`
   con la gente de `seat.area_id` + `holder_profile_id` (sin `holder` no aparece). `loadOfficeDraft(userId, orgId)`:
   solo dueño, el `draft` o `null`.
3. `apps/improvement/tests/office-confirm.test.ts`.
4. `apps/improvement/server/lobby/loadLobby.ts` — **el Lobby no cambia** (decisión de Jose Carlos: la oficina
   convive con el Lobby tal cual). Hoy toda sección visible sin mueble se vuelve una puerta `sueltas`; las cinco
   secciones de este cambio (pasos 13, 21, 26, 37 y 41) se volverían puertas nuevas, dos de ellas a rutas que
   aún no existen. Agrega, junto a `DIRECCION`:
   `const OFICINAS_DIGITALES: ReadonlySet<string> = new Set(["oficina", "canal", "erp", "agenda", "butacas"]);`
   y, en el ciclo de `secciones`, `if (OFICINAS_DIGITALES.has(s.slug)) continue;` antes del `if` de `zona`.
   Nada más cambia. Su navegación es la de `OFICINAS_SLUGS` en el layout de `[org]` (paso 13). Entra aquí, antes
   de que exista el primer slug nuevo, para que ningún paso tenga una puerta de más.
5. `apps/improvement/tests/lobby-oficinas.test.ts` (patrón de `tests/lobby.test.ts`): siembra un org sin
   `section_labels` y su dueño; `loadLobby` del dueño. La prueba corre en cada `pnpm test` posterior, así que
   vuelve a comprobar la exclusión en los pasos 13, 21, 26, 37 y 41, cuando cada slug entra a `SECTION_SLUGS`.

**Files**
- `apps/improvement/server/office/confirm.ts`
- `apps/improvement/server/office/loadOffice.ts`
- `apps/improvement/tests/office-confirm.test.ts`
- `apps/improvement/server/lobby/loadLobby.ts`
- `apps/improvement/tests/lobby-oficinas.test.ts`

**Acceptance**
1. **WHEN** el dueño confirma un borrador con las áreas Cocina y Caja en un org de giro `restaurante` sin áreas **THE SYSTEM SHALL** crear 2 `area`, sus `seat` y 5 `office_zone` (2 de área y 3 fijas) y dejar el plano en `confirmed`.
2. **WHEN** el org ya tiene un área llamada `cocina` **THE SYSTEM SHALL** reusar esa área en lugar de crear `Cocina` otra vez.
3. **WHEN** el borrador trae un tema que falla AA **THE SYSTEM SHALL** confirmar el plano sin escribir `organization.theme` y devolver `themeSkipped` en `true`.
4. **WHEN** se confirma un segundo borrador **THE SYSTEM SHALL** dejar un solo plano `confirmed` para el org, con las zonas del segundo.
5. **WHEN** un empleado llama `confirmOfficePlan` **THE SYSTEM SHALL** devolver `NOT_FOUND` sin escribir, y **WHEN** un miembro sin plano confirmado llama `loadOffice` **THE SYSTEM SHALL** recibir `null`.
6. **WHEN** el dueño de un org sin `section_labels` corre `loadLobby` **THE SYSTEM SHALL** devolver `sueltas` con exactamente los slugs `mapa`, `cobros`, `proyectos`, `postventa` y `direccion`, y `puertas` con exactamente `objetivos`, `equipo`, `clientes` y `powerups` — los mismos de antes del cambio, sin `oficina`, `canal`, `erp`, `agenda` ni `butacas`.

**Verify**
```bash
pnpm --filter improvement test tests/office-confirm.test.ts
pnpm --filter improvement test tests/lobby-oficinas.test.ts
grep -q 'OFICINAS_DIGITALES.has(s.slug)' apps/improvement/server/lobby/loadLobby.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/office || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/office/confirm.ts apps/improvement/server/office/loadOffice.ts apps/improvement/tests/office-confirm.test.ts apps/improvement/server/lobby/loadLobby.ts apps/improvement/tests/lobby-oficinas.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T6 (step 11): confirmar plano de oficina y dejar las secciones nuevas fuera de las puertas del Lobby"
git tag step-11-od-confirmar
git ls-files --error-unmatch apps/improvement/server/office/confirm.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E2-T7` — Oficina pixel-art: modelo de escena y componente

**Depends on:** `E2-T5` · **Priority:** p1 · **Step:** 12

1. `packages/ui/src/building/officeScene.ts` (puro): `TILE = 16`; `officeScene(zones, people)` devuelve
   `{ rects: [{ kind, label, color, px, py, pw, ph, areaId }], avatars: [{ profileId, name, initials, tx, ty }], overflow: { [areaId]: number } }`.
   Rectángulos en píxeles (`x * 16` …). Gente de cada zona `area`, en orden de llegada:
   `cols = max(1, floor((w - 1) / 2))`, `rows = max(1, floor((h - 1) / 2))`, la persona `k` en
   `(x + 1 + 2 * (k % cols), y + 1 + 2 * floor(k / cols))`; las que no caben suman a `overflow[areaId]`.
2. `packages/ui/src/building/Office.tsx` (sin estado, sin `"use client"`): `<svg viewBox="0 0 640 384" shapeRendering="crispEdges" role="img" aria-label={…}>`;
   cada zona un `<rect data-zone={kind}>` (áreas con su `color`; fijas con `var(--bg-card)` y borde
   `var(--border)`), su etiqueta en `<text>`, cada persona un cuadro de 12 px con sus iniciales y `<title>`;
   "+N" si hay `overflow`. Debajo, `<ul className="sr-only">` con cada área y su gente. Sin animación: nada
   que reducir con `prefers-reduced-motion`. Sin hex nuevo: los colores vienen de `area.color` (datos) o tokens.
3. `packages/ui/package.json`: exports `"./building/officeScene.ts"` y `"./building/Office.tsx"`.
4. `apps/improvement/tests/office-scene.test.ts` (prueba el modelo puro; el `.tsx` lo cubre el e2e del paso 13).

**Files**
- `packages/ui/src/building/officeScene.ts`
- `packages/ui/src/building/Office.tsx`
- `packages/ui/package.json`
- `apps/improvement/tests/office-scene.test.ts`

**Acceptance**
1. **WHEN** `officeScene` recibe la zona (1,8,11,9) con 3 personas **THE SYSTEM SHALL** colocarlas en los tiles (2,9), (4,9) y (6,9).
2. **WHEN** una zona de alto 2 y ancho 8 recibe 4 personas **THE SYSTEM SHALL** colocar 3 en la fila `y + 1` y reportar `overflow` 1 para esa área.
3. **WHEN** `officeScene` recibe una zona **THE SYSTEM SHALL** devolver su rectángulo en píxeles multiplicando por 16.

**Verify**
```bash
pnpm --filter improvement test tests/office-scene.test.ts
grep -q '"./building/Office.tsx"' packages/ui/package.json
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/ui/src/building/officeScene.ts packages/ui/src/building/Office.tsx packages/ui/package.json apps/improvement/tests/office-scene.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T7 (step 12): escena pixel-art de la oficina y componente Office"
git tag step-12-od-escena
git ls-files --error-unmatch packages/ui/src/building/Office.tsx   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E2-T8` — Pantalla de la oficina: subir, revisar y confirmar

**Depends on:** `E2-T6`, `E2-T7`, `E1-T5` · **Priority:** p1 · **Step:** 13

1. `server/permissions/sections.ts`: agrega `"oficina"` al final de `SECTION_SLUGS` y su `Section`
   (`label: "Oficina"`, `hint: "El plano 2D de tu empresa con su gente."`, `scopes: ["empresa"]`); y
   `export const OFICINAS_SLUGS = ["oficina"] as const` (los pasos 21, 29, 37 y 45 agregan el suyo).
2. `app/[org]/layout.tsx`: un `<nav aria-label="Oficinas digitales">` con un enlace por cada slug de
   `OFICINAS_SLUGS` cuyo `resolveSection(...).scope` no es `ninguno`, más "Marca" si `findOwnerMembership`.
3. `app/[org]/oficina/actions.ts` (`"use server"`): `subirFotos(formData)` → `uploadSpacePhotos` y luego
   `analyzeSpace`; `confirmarOficina(formData)` → arma el objeto editado y llama `confirmOfficePlan`. Ambas
   `revalidatePath`.
4. `app/[org]/oficina/page.tsx`: `requireSection(org, "oficina")`. Con plano confirmado, `<Office>` con
   `loadOffice`. Si es el dueño: formulario de fotos (`<input type="file" multiple accept="image/jpeg,image/png,image/webp">`,
   "Analizar mi espacio") y, si hay `draft`, el formulario de revisión: por área, nombre, `<input type="color">`
   y puestos (uno por línea en un `<textarea>`); el tema propuesto; botón "Confirmar oficina". Errores en
   `role="alert"`. Cada control con `<label>`.
5. `tests/e2e/oficina.spec.ts` (`serial`): siembra un org `restaurante`, su dueño, un empleado con
   `oficina = empresa`, otro sin permiso, y un `office_plan` `draft` directo en la base con la propuesta
   Cocina (Chef, Ayudante) y Caja (Cajero) — el e2e no llama a la IA.

**Files**
- `apps/improvement/app/[org]/oficina/page.tsx`
- `apps/improvement/app/[org]/oficina/actions.ts`
- `apps/improvement/server/permissions/sections.ts`
- `apps/improvement/app/[org]/layout.tsx`
- `apps/improvement/tests/e2e/oficina.spec.ts`

**Acceptance**
1. **WHEN** el dueño abre `/[org]/oficina` con un borrador y pulsa "Confirmar oficina" **THE SYSTEM SHALL** mostrar el plano con 5 elementos `[data-zone]`.
2. **WHEN** un empleado con `oficina` = `empresa` abre `/[org]/oficina` **THE SYSTEM SHALL** mostrar el plano confirmado sin el formulario de fotos.
3. **WHEN** un empleado sin permiso de `oficina` abre `/[org]/oficina` **THE SYSTEM SHALL** responder 404.
4. **WHEN** AxeBuilder analiza `/[org]/oficina` del dueño **THE SYSTEM SHALL** reportar 0 violaciones.

**Verify**
```bash
pnpm --filter improvement test:e2e oficina.spec.ts
pnpm --filter improvement test tests/permissions.test.ts tests/direccion-permissions.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- ":(literal)apps/improvement/app/[org]/oficina/page.tsx" ":(literal)apps/improvement/app/[org]/oficina/actions.ts" apps/improvement/server/permissions/sections.ts ":(literal)apps/improvement/app/[org]/layout.tsx" apps/improvement/tests/e2e/oficina.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T8 (step 13): pantalla de la oficina digital con revisión del borrador"
git tag step-13-od-pantalla-oficina
git ls-files --error-unmatch ":(literal)apps/improvement/app/[org]/oficina/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E2-T9` — La oficina convive con el Lobby

**Depends on:** `E2-T8` · **Priority:** p1 · **Step:** 14

1. `app/empresas/[orgId]/page.tsx`: además de `loadLobby`, `const office = await loadOffice(userId, orgId)` y lo
   pasa a `BuildingExperience` como prop `office` (o `null`).
2. `BuildingExperience.tsx`: después de "entrar", si `office` no es `null` dibuja `<Office zones people>` en el
   lugar del `<Lobby>`; si es `null`, **exactamente** lo de hoy. `Lobby.tsx` no se toca.
3. `tests/e2e/oficina.spec.ts`: dos pruebas más — el dueño de un org sin plano confirmado (sin `section_labels`)
   entra a la recepción y la prueba junta el conjunto de `href` de `.jpc-reception-door` y lo compara con el
   literal de abajo (las puertas de antes del cambio: `sueltas` de `loadLobby` + las dos del dueño); el org del
   paso anterior muestra el `svg` de la oficina.

**Files**
- `apps/improvement/app/empresas/[orgId]/page.tsx`
- `apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx`
- `apps/improvement/tests/e2e/oficina.spec.ts`

**Acceptance**
1. **WHEN** el dueño de un org sin plano confirmado y sin `section_labels` entra a la recepción de `/empresas/<orgId>` **THE SYSTEM SHALL** mostrar `.jpc-reception-door` con exactamente los `href` `/<orgId>/mapa`, `/<orgId>/cobros`, `/<orgId>/proyectos`, `/<orgId>/postventa`, `/<orgId>/direccion`, `/<orgId>/necesidades` y `/<orgId>/improvement` — los mismos de antes del cambio.
2. **WHEN** un miembro entra a `/empresas/<orgId>` de un org con plano confirmado **THE SYSTEM SHALL** mostrar el `svg` de la oficina con sus zonas `[data-zone]`.
3. **WHEN** `pnpm --filter improvement test:e2e a11y.spec.ts` corre **THE SYSTEM SHALL** pasar sin cambios en ese archivo.

**Verify**
```bash
pnpm --filter improvement test:e2e oficina.spec.ts a11y.spec.ts
git diff --quiet HEAD -- packages/ui/src/building/Lobby.tsx
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- ":(literal)apps/improvement/app/empresas/[orgId]/page.tsx" ":(literal)apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx" apps/improvement/tests/e2e/oficina.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E2-T9 (step 14): la oficina confirmada reemplaza al Lobby solo en su org"
git tag step-14-od-convivencia
git ls-files --error-unmatch ":(literal)apps/improvement/app/empresas/[orgId]/BuildingExperience.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e oficina.spec.ts` corre completo **THE SYSTEM SHALL** salir con código 0, con `/[org]/oficina` auditada por axe sin violaciones.
2. **WHEN** el dueño de un org sin plano confirmado entra a la recepción de `/empresas/<orgId>` **THE SYSTEM SHALL** mostrar las mismas puertas `.jpc-reception-door` de antes del cambio (literal de E2-T9), y **WHEN** tiene plano confirmado **THE SYSTEM SHALL** mostrar la oficina 2D.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e oficina.spec.ts a11y.spec.ts
```

## Pitfalls

- **Subir fotos con la service-role key** — prohibido en Improvement; el bucket se usa con el JWT del dueño y las políticas de `oficina_rls`.
- **Escribir áreas o puestos al analizar** — el análisis solo deja un `draft`; todo lo demás pasa en `confirmOfficePlan`.
- **Llamar a Anthropic en una prueba** — siempre un proveedor falso; `ANTHROPIC_API_KEY` no hace falta.
- **Cambiar `MODEL_ID`** — se lee de `gateway.ts` y no se toca.
- **Tocar `Lobby.tsx`** — E2-T9 lo verifica con `git diff --quiet`.
- **Dejar que una sección nueva se vuelva puerta del Lobby** — `OFICINAS_DIGITALES` en `loadLobby.ts` (E2-T6) las salta; se navega a ellas por `OFICINAS_SLUGS` en el layout.
- **Más de 12 áreas** — `officeLayout` lanza `RangeError` y la propuesta ya lo limita a 12; no lo "arregles" partiendo la cuadrícula.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-od-*'` los lista (9 de este epic; 46 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Las migraciones de E2-T1 se aplicaron solo después de un "sí" explícito de Jose Carlos.
