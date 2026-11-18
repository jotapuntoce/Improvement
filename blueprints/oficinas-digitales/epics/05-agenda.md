# Epic 05: Agenda tipo Motion, Google Calendar y portal de reservas

> Al terminar, cada usuario tiene su agenda personal en `/[org]/agenda` con reprogramación automática de pendientes vencidos, puede conectar su Google Calendar (refresh token cifrado con AES-256-GCM) y publicar una página de reservas en `/agenda/<slug>` donde la base impide la doble reserva.

| | |
|---|---|
| **Epic id** | `05-agenda` |
| **Tasks** | `E5-T1` … `E5-T8` |
| **Depends on** | `04-crm-erp` (orden de `schema.ts`); `03-agentes` (las tareas `agenda`/`google` del runtime) |
| **Unlocks** | `06-butacas` |
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
  src/schema.ts                                    # exists, you will edit it (E5-T1)
  migrations/                                      # db:generate + --custom agenda_rls
apps/improvement/
  server/calendar/crypto.ts                        # NEW (E5-T2) — puro, solo node:crypto
  server/calendar/reschedule.ts                    # NEW (E5-T3) — puro
  server/calendar/availability.ts, events.ts       # NEW (E5-T4)
  server/calendar/google.ts                        # NEW (E5-T5) — fetch, sin googleapis
  server/calendar/sync.ts                          # NEW (E5-T6)
  server/calendar/booking.ts                       # NEW (E5-T8)
  server/agents/runtime.ts                         # exists (epic 03), you will edit it (E5-T6: agenda, google)
  server/permissions/sections.ts                   # exists, you will edit it (E5-T7: `agenda`)
  app/api/calendar/google/connect/route.ts,
       google/callback/route.ts                    # NEW (E5-T6)
  app/[org]/agenda/page.tsx                        # NEW (E5-T7)
  app/agenda/[slug]/page.tsx                       # NEW (E5-T8) — pública
  tests/agenda-schema, calendar-crypto, calendar-reschedule, calendar-events,
        calendar-google, calendar-sync, booking (.test.ts)   # NEW
  tests/e2e/agenda.spec.ts                         # NEW (E5-T7), grows in E5-T8
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not listed
here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `calendar_event` | `org_id`, `user_id`, `title`, `starts_at` < `ends_at`, `kind` (`tarea`\|`evento`\|`bloqueo`), `status` (`pendiente`\|`hecho`), `source` (`improvement`\|`google`\|`reserva`), `google_event_id` | Único (`user_id`, `google_event_id`) si no es null. RLS: solo su usuario |
| `calendar_connection` | `user_id` (único), `provider_email`, `calendar_id` `primary`, `refresh_token_enc`, `sync_token`, `status` (`activa`\|`revocada`\|`error`), `last_synced_at` | `refresh_token_enc` **sin grant** para `authenticated` (grant por columnas) |
| `booking_page` | `user_id`, `slug` (único global, `^[a-z0-9-]{3,40}$`), `title`, `duration_minutes` 15-240, `weekly_hours` jsonb, `active` | Su URL es pública |
| `booking` | `booking_page_id`, `starts_at`, `ends_at`, `guest_name`, `guest_email`, `status`, `cancel_token` (único) | Único (`booking_page_id`, `starts_at`) donde `status = 'confirmada'` |

### Apéndice de esquema (copia de blueprint.md §4)

#### `agenda_rls`

```sql
-- Custom SQL migration file, put your code below! --
-- Agenda personal: cada quien lee lo suyo (user_id = auth.uid()), ni el dueño lee la agenda de otro.
-- calendar_connection guarda el refresh token cifrado: el grant es por COLUMNA y no incluye
-- refresh_token_enc ni sync_token, así que ni su propio dueño lo lee por PostgREST.
alter table calendar_event enable row level security;
create policy "users read their own calendar events"
  on calendar_event for select
  using (calendar_event.user_id = auth.uid());

alter table calendar_connection enable row level security;
create policy "users read their own calendar connection"
  on calendar_connection for select
  using (calendar_connection.user_id = auth.uid());

alter table booking_page enable row level security;
create policy "users read their own booking pages"
  on booking_page for select
  using (booking_page.user_id = auth.uid());

alter table booking enable row level security;
create policy "users read bookings of their own booking pages"
  on booking for select
  using (exists (
    select 1 from booking_page bp
    where bp.id = booking.booking_page_id and bp.user_id = auth.uid()));

grant select on calendar_event, booking_page, booking to authenticated;
-- Supabase da privilegios por defecto sobre toda tabla nueva de `public`: sin este revoke, el grant por
-- columna de abajo no oculta nada.
revoke all on calendar_connection from anon, authenticated;
grant select (id, org_id, user_id, provider_email, calendar_id, status, last_synced_at, created_at, updated_at)
  on calendar_connection to authenticated;
```

## Google Calendar (copia de blueprint.md §5)

Todo con `fetch` de Node, sin `googleapis`. Ningún secreto de Google sale del servidor.

| Uso | Método y URL | Parámetros que se mandan siempre |
|---|---|---|
| Autorización (redirige al usuario) | `GET https://accounts.google.com/o/oauth2/v2/auth` | `client_id`, `redirect_uri` = `${NEXT_PUBLIC_APP_URL}/api/calendar/google/callback`, `response_type=code`, `access_type=offline`, `prompt=consent`, `scope=https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events`, `state` |
| Cambiar el código por tokens | `POST https://oauth2.googleapis.com/token` (form-urlencoded) | `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri` |
| Renovar el access token | `POST https://oauth2.googleapis.com/token` (form-urlencoded) | `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret` |
| Desconectar | `POST https://oauth2.googleapis.com/revoke` (form-urlencoded) | `token` |
| Ocupado/libre | `POST https://www.googleapis.com/calendar/v3/freeBusy` (JSON, `Authorization: Bearer`) | `timeMin`, `timeMax`, `items: [{ id: calendarId }]` |
| Crear evento | `POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` | `summary`, `start.dateTime`, `end.dateTime` |
| Listar eventos | `GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` | `singleEvents=true`, `maxResults=250`, `syncToken` si hay; recorre `pageToken` = `nextPageToken` hasta que no venga; guarda el `nextSyncToken` de la última página |

- **410 en listar** (`syncToken` vencido) → `SYNC_TOKEN_GONE`: `sync.ts` borra `sync_token` y los eventos con
  `source = 'google'` de ese usuario y hace una sincronización completa con los **mismos** parámetros (sin
  `syncToken` y sin `timeMin`).
- **400 al renovar** (`invalid_grant`: el usuario revocó el acceso) → la conexión pasa a `status = 'error'` y la pantalla pide reconectar.
- La app es "de prueba" en Google hasta su verificación: tope de 100 usuarios (ver §20.1).

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/auth/guard.ts` → `findMembership`, `resolveSection`, `requireSection`, `getSessionUserId` | 404 nunca 403 |
| `01-base` | `requireEnv("TOKEN_ENCRYPTION_KEY")`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` opcionales | Exigidas solo al usarse |
| `03-agentes` | `runTarea` con `agenda` y `google` en `{ procesadas: 0 }` | Este epic las conecta |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `server/calendar/crypto.ts` → `encryptToken`, `decryptToken` | `(plain, keyB64) → Result<string>`; formato `v1.<iv>.<tag>.<cifrado>` base64url; `BAD_KEY`, `BAD_TOKEN`; nunca lanza | `sync.ts` |
| `server/calendar/reschedule.ts` → `reschedule` | puro; `{ moves: { id, startsAt, endsAt }[], unplaced: string[] }` | `events.ts`, `sync.ts` |
| `server/calendar/availability.ts` → `weeklyHoursSchema`, `availableSlots` | puro; inicios ISO | `booking.ts` |
| `server/calendar/sync.ts` → `syncAllGoogle`, `rescheduleAll` | `(now) → Promise<{ procesadas }>`-compatible | runtime |
| `server/permissions/sections.ts` | `agenda` (`scopes: ["propio"]`) en `SECTION_SLUGS` y `OFICINAS_SLUGS` | `06` |

## Conventions that bite in this area

- **La agenda es personal.** Siempre `user_id = userId`; ni el dueño ve ni mueve la agenda de otro.
- **Hora local = UTC − 6 fijo** (`utcOffsetMinutes = -360`, America/Mexico_City sin horario de verano desde
  2022), marcado con un comentario `ponytail:`.
- **El refresh token nunca sale en claro:** se cifra antes de escribir, se descifra solo dentro de `sync.ts`,
  y `authenticated` no tiene grant sobre `refresh_token_enc`.
- **Sin `googleapis`.** `fetch` de Node con un `fetchImpl` inyectable para las pruebas.
- **La página pública lee columnas explícitas** — nunca `user_id`, correo del dueño ni ids internos.
- **Dos puertas, import con `.ts`, resultados tipados, `--custom` solo para RLS, `grep` de uuid**, y
  `":(literal)…"` para rutas con corchetes en `git add`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/oficinas-digitales.md`,
`.claude/rules/base-de-datos.md`, `.claude/rules/motor-generico.md`.

---

## Tasks

### `E5-T1` — Esquema de agenda, conexiones y reservas con RLS

**Depends on:** `E4-T2` · **Priority:** p0 · **Step:** 31

1. `packages/db/src/schema.ts`:
   - `CALENDAR_EVENT_KINDS = ["tarea", "evento", "bloqueo"] as const`, `CALENDAR_EVENT_STATUSES = ["pendiente", "hecho"] as const`,
     `CALENDAR_EVENT_SOURCES = ["improvement", "google", "reserva"] as const`,
     `CALENDAR_CONNECTION_STATUSES = ["activa", "revocada", "error"] as const`, `BOOKING_STATUSES = ["confirmada", "cancelada"] as const`.
   - `calendar_event`: `id`, `org_id` (cascade), `user_id` (→ profile, cascade), `title` text not null, `starts_at`
     y `ends_at` timestamptz not null, `kind`, `status` (default `"pendiente"`), `source` (default
     `"improvement"`), `google_event_id` text null, `created_at`, `updated_at`. Checks de los tres enums y
     `calendar_event_range_check` (`ends_at > starts_at`); `uniqueIndex("uq_calendar_event_google")` (`user_id`,
     `google_event_id`) where `google_event_id is not null`; índice (`user_id`, `starts_at`).
   - `calendar_connection`: `id`, `org_id` (cascade), `user_id` (→ profile, cascade, **unique**),
     `provider_email` text null, `calendar_id` text not null default `"primary"`, `refresh_token_enc` text not
     null, `sync_token` text null, `status` (default `"activa"`), `last_synced_at` null, `created_at`, `updated_at`.
   - `booking_page`: `id`, `org_id` (cascade), `user_id` (→ profile, cascade), `slug` text not null **unique**
     (global: es una URL pública), `title` text not null, `duration_minutes` integer not null default 30 con
     check 15-240, `weekly_hours` jsonb not null, `active` boolean default true, `created_at`, `updated_at`.
     Check `booking_page_slug_format` (`slug ~ '^[a-z0-9-]{3,40}$'`).
   - `booking`: `id`, `org_id` (cascade), `booking_page_id` (cascade), `starts_at`, `ends_at`, `guest_name`
     text not null, `guest_email` text not null, `status` (default `"confirmada"`), `cancel_token` text not null
     **unique**, `created_at`. `uniqueIndex("uq_booking_page_slot").on(bookingPageId, startsAt).where(sql\`status = 'confirmada'\`)`
     — la base impide la doble reserva.
2. `pnpm db:generate`.
3. `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name=agenda_rls` y pega, completo, el SQL de
   §4 *Migración `agenda_rls`* (incluye el `revoke` y el grant por columna de `calendar_connection`).
4. `apps/improvement/tests/agenda-schema.test.ts` con el patrón `asUser()`.
5. **Aprobación obligatoria.** Muestra los dos SQL a Jose Carlos y espera un "sí" explícito. Sin "sí", detente.
6. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts`
- `packages/db/migrations/**`
- `apps/improvement/tests/agenda-schema.test.ts`

**Acceptance**
1. **WHEN** se insertan dos `booking` `confirmada` para la misma página y el mismo `starts_at` **THE SYSTEM SHALL** rechazar la segunda, y **WHEN** la primera está `cancelada` **THE SYSTEM SHALL** aceptar la nueva.
2. **WHEN** se inserta un `calendar_event` con `ends_at` igual a `starts_at` o un `booking_page` con `slug` `Mi Agenda` **THE SYSTEM SHALL** rechazar cada insert.
3. **WHEN** el dueño del org consulta `calendar_event` de un empleado como `authenticated` **THE SYSTEM SHALL** devolver 0 filas, y **WHEN** el empleado consulta los suyos **THE SYSTEM SHALL** verlos.
4. **WHEN** un usuario consulta `refresh_token_enc` de su propia `calendar_connection` como `authenticated` **THE SYSTEM SHALL** fallar por permiso, y **WHEN** consulta `status` **THE SYSTEM SHALL** devolverlo.
5. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**
```bash
grep -q 'revoke all on calendar_connection from anon, authenticated;' packages/db/migrations/*.sql
pnpm --filter improvement test tests/agenda-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/agenda-schema.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E5-T1 (step 31): esquema de agenda, conexión de Google y reservas con RLS"
git tag step-31-od-agenda-esquema
git ls-files --error-unmatch apps/improvement/tests/agenda-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E5-T2` — Cifrado AES-256-GCM de tokens

**Depends on:** `E1-T1` · **Priority:** p0 · **Step:** 32

`apps/improvement/server/calendar/crypto.ts` (puro, solo `node:crypto`; la llave entra por parámetro, nunca
se lee del entorno aquí):
1. `encryptToken(plain, keyB64)`: la llave decodificada debe medir 32 bytes (si no,
   `{ ok: false, error: { code: "BAD_KEY", message: "TOKEN_ENCRYPTION_KEY debe ser de 32 bytes en base64." } }`);
   IV aleatorio de 12 bytes, `createCipheriv("aes-256-gcm", key, iv)`, etiqueta de 16 bytes; devuelve
   `v1.<iv>.<tag>.<cifrado>`, cada parte en base64url.
2. `decryptToken(blob, keyB64)`: misma validación de llave; formato distinto de `v1.` y 4 partes, o etiqueta que
   no verifica → `{ ok: false, error: { code: "BAD_TOKEN" } }`; nunca lanza.
3. `apps/improvement/tests/calendar-crypto.test.ts` con una llave de prueba generada en la prueba
   (`randomBytes(32).toString("base64")`), nunca una real.

**Files**
- `apps/improvement/server/calendar/crypto.ts`
- `apps/improvement/tests/calendar-crypto.test.ts`

**Acceptance**
1. **WHEN** se cifra y descifra `1//refresh-de-prueba` con la misma llave **THE SYSTEM SHALL** devolver el texto original.
2. **WHEN** se cifra dos veces el mismo texto **THE SYSTEM SHALL** producir dos resultados distintos que empiezan con `v1.`
3. **WHEN** se cambia un carácter del cifrado o se usa otra llave **THE SYSTEM SHALL** devolver `BAD_TOKEN` sin lanzar.
4. **WHEN** la llave decodifica a 16 bytes **THE SYSTEM SHALL** devolver `BAD_KEY`.

**Verify**
```bash
pnpm --filter improvement test tests/calendar-crypto.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/calendar/crypto.ts apps/improvement/tests/calendar-crypto.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E5-T2 (step 32): cifrado AES-256-GCM de refresh tokens con node:crypto"
git tag step-32-od-cifrado
git ls-files --error-unmatch apps/improvement/server/calendar/crypto.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E5-T3` — Reprogramación pura de pendientes

**Depends on:** `E1-T1` · **Priority:** p0 · **Step:** 33

`apps/improvement/server/calendar/reschedule.ts` — **puro**, sin base ni reloj propio:
`reschedule({ tasks, busy, now, workStart = "09:00", workEnd = "18:00", utcOffsetMinutes = -360, stepMinutes = 15, horizonDays = 14 })`.
1. Candidatas: `tasks` con `kind` `tarea`, `status` `pendiente` y `endsAt <= now`, en orden de `startsAt`;
   duración = `endsAt - startsAt`.
2. Para cada una: inicio = `now` redondeado hacia arriba a múltiplos de 15 min; mientras el bloque
   `[inicio, inicio + duración)` se encime con `busy` o con una tarea ya colocada, salta al fin de ese bloque
   (redondeado a 15); si termina después de `workEnd` local o empieza antes de `workStart` local, salta al
   `workStart` del día siguiente. Hora local = UTC + `utcOffsetMinutes` (America/Mexico_City es UTC-6 fijo
   desde 2022; `// ponytail: offset fijo, usa Intl si el negocio opera en una zona con horario de verano`).
3. Devuelve `{ moves: [{ id, startsAt, endsAt }], unplaced: string[] }` (sin hueco en `horizonDays` → `unplaced`).
4. `apps/improvement/tests/calendar-reschedule.test.ts` con los casos de los criterios.

**Files**
- `apps/improvement/server/calendar/reschedule.ts`
- `apps/improvement/tests/calendar-reschedule.test.ts`

**Acceptance**
1. **WHEN** `now` es `2026-11-18T16:10:00Z`, `busy` tiene `16:30Z–17:30Z` y hay una tarea pendiente vencida de 45 minutos **THE SYSTEM SHALL** moverla a `2026-11-18T17:30:00.000Z`–`2026-11-18T18:15:00.000Z`.
2. **WHEN** `now` es `2026-11-18T23:40:00Z` (17:40 local) y la tarea dura 45 minutos **THE SYSTEM SHALL** moverla a `2026-11-19T15:00:00.000Z`, las 09:00 locales del día siguiente.
3. **WHEN** hay dos tareas vencidas **THE SYSTEM SHALL** colocarlas sin encimarse entre sí, en el orden de su `startsAt` original.
4. **WHEN** una tarea está `hecho` o todavía no vence **THE SYSTEM SHALL** dejarla fuera de `moves`.

**Verify**
```bash
pnpm --filter improvement test tests/calendar-reschedule.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/calendar/reschedule.ts apps/improvement/tests/calendar-reschedule.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E5-T3 (step 33): reprogramación pura de tareas al siguiente hueco libre"
git tag step-33-od-reprogramar
git ls-files --error-unmatch apps/improvement/server/calendar/reschedule.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E5-T4` — Motor de agenda y disponibilidad

**Depends on:** `E5-T1`, `E5-T3` · **Priority:** p0 · **Step:** 34

1. `server/calendar/availability.ts` (puro): `weeklyHoursSchema` (`zod`: llaves `"1"`…`"7"` ISO, cada una un
   arreglo de pares `["HH:MM", "HH:MM"]` con inicio < fin) y
   `availableSlots({ date, weeklyHours, durationMinutes, busy, now, utcOffsetMinutes = -360 })`: inicios ISO
   cada `durationMinutes` dentro de los rangos del día de la semana de `date` (local), sin encimarse con
   `busy` y posteriores a `now`.
2. `server/calendar/events.ts` — agenda **personal**: membresía del org y siempre `user_id = userId` (ni el
   dueño toca la agenda de otro):
   `listMyEvents(userId, orgId, { from, to })`, `createEvent` (`kind`, `title` 1-200, rango válido),
   `markDone`, `rescheduleMine(userId, orgId, now)` (aplica `reschedule` con los eventos del usuario como
   `busy` y escribe los `moves`), `upsertBookingPage(userId, orgId, input)` (slug ya usado →
   `{ ok: false, error: { code: "SLUG_TAKEN" } }`).
3. `apps/improvement/tests/calendar-events.test.ts`.

**Files**
- `apps/improvement/server/calendar/events.ts`
- `apps/improvement/server/calendar/availability.ts`
- `apps/improvement/tests/calendar-events.test.ts`

**Acceptance**
1. **WHEN** `availableSlots` recibe el miércoles `2026-11-18` con horario `09:00–11:00`, duración 60 y `busy` `16:00Z–17:00Z` **THE SYSTEM SHALL** devolver solo `2026-11-18T15:00:00.000Z`.
2. **WHEN** un usuario corre `rescheduleMine` con una tarea vencida **THE SYSTEM SHALL** escribir su nuevo horario, y **WHEN** el dueño intenta leer o mover eventos de un empleado **THE SYSTEM SHALL** no devolverlos ni modificarlos.
3. **WHEN** dos usuarios guardan una página de reservas con el mismo `slug` **THE SYSTEM SHALL** devolver `SLUG_TAKEN` al segundo.
4. **WHEN** `createEvent` recibe un fin anterior al inicio **THE SYSTEM SHALL** devolver `VALIDATION_ERROR` sin escribir.

**Verify**
```bash
pnpm --filter improvement test tests/calendar-events.test.ts
status=0; grep -rEn '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' apps/improvement/server/calendar || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/calendar/events.ts apps/improvement/server/calendar/availability.ts apps/improvement/tests/calendar-events.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E5-T4 (step 34): motor de agenda personal y disponibilidad de reservas"
git tag step-34-od-agenda
git ls-files --error-unmatch apps/improvement/server/calendar/events.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E5-T5` — Cliente de Google Calendar con fetch

**Depends on:** `E5-T2` · **Priority:** p0 · **Step:** 35

`apps/improvement/server/calendar/google.ts` — `fetch` directo, sin `googleapis`; cada función recibe
`fetchImpl = fetch` y devuelve un resultado tipado, nunca lanza. Endpoints y parámetros, exactamente los de
§5 *Google Calendar*:
1. `googleAuthUrl({ clientId, redirectUri, state })` sobre `https://accounts.google.com/o/oauth2/v2/auth` con
   `response_type=code`, `access_type=offline`, `prompt=consent` y `scope` =
   `https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events`.
2. `exchangeCode` y `refreshAccessToken` (`POST https://oauth2.googleapis.com/token`, form-urlencoded) y
   `revokeToken` (`POST https://oauth2.googleapis.com/revoke`).
3. `freeBusy({ accessToken, timeMin, timeMax, calendarId })` (`POST https://www.googleapis.com/calendar/v3/freeBusy`),
   `insertEvent` (`POST …/calendars/{calendarId}/events`) y `listEvents({ accessToken, calendarId, syncToken? })`
   (`GET …/calendars/{calendarId}/events` con `singleEvents=true` y `maxResults=250` siempre, y `syncToken` si
   hay; recorre `nextPageToken`; devuelve `{ items, nextSyncToken }`). Un 410 → `{ ok: false, error: { code: "SYNC_TOKEN_GONE" } }`.
4. `apps/improvement/tests/calendar-google.test.ts` con un `fetch` falso que registra URL, método y cuerpo.

**Files**
- `apps/improvement/server/calendar/google.ts`
- `apps/improvement/tests/calendar-google.test.ts`

**Acceptance**
1. **WHEN** `googleAuthUrl` corre **THE SYSTEM SHALL** devolver una URL de `accounts.google.com/o/oauth2/v2/auth` con `access_type=offline`, `prompt=consent` y los dos scopes de calendario.
2. **WHEN** `exchangeCode` corre con un `fetch` falso **THE SYSTEM SHALL** hacer `POST` a `https://oauth2.googleapis.com/token` con `grant_type=authorization_code` en el cuerpo.
3. **WHEN** `listEvents` recibe dos páginas **THE SYSTEM SHALL** devolver los eventos de las dos y el `nextSyncToken` de la última.
4. **WHEN** `listEvents` recibe un 410 **THE SYSTEM SHALL** devolver `SYNC_TOKEN_GONE` sin lanzar.

**Verify**
```bash
pnpm --filter improvement test tests/calendar-google.test.ts
status=0; grep -rn 'googleapis"' apps/improvement/server apps/improvement/app || status=$?; test "$status" -eq 1
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/calendar/google.ts apps/improvement/tests/calendar-google.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E5-T5 (step 35): cliente de Google Calendar con fetch, sin googleapis"
git tag step-35-od-google
git ls-files --error-unmatch apps/improvement/server/calendar/google.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E5-T6` — Conexión con Google y tareas agenda/google del runtime

**Depends on:** `E5-T4`, `E5-T5`, `E3-T6` · **Priority:** p0 · **Step:** 36

1. `server/calendar/sync.ts`:
   - `connectGoogle(userId, orgId, code, deps?)`: membresía; `exchangeCode`; cifra el refresh token con
     `encryptToken(…, requireEnv("TOKEN_ENCRYPTION_KEY"))`; upsert de `calendar_connection` por `user_id` en
     `activa`. Sin refresh token en la respuesta → `NO_REFRESH_TOKEN`.
   - `disconnectGoogle(userId, orgId, deps?)`: descifra, `revokeToken`, borra la conexión y los eventos
     `source = 'google'` del usuario.
   - `syncGoogleFor(connection, now, deps?)`: descifra, `refreshAccessToken` (un 400 → `status = 'error'`),
     `listEvents` con el `sync_token`; ante `SYNC_TOKEN_GONE` borra los eventos `google` de ese usuario y
     repite **con los mismos parámetros** sin `syncToken` (sincronización completa); upsert por
     `(user_id, google_event_id)` como `kind = 'bloqueo'`, borra los `cancelled`; guarda `sync_token` y
     `last_synced_at`.
   - `syncAllGoogle(now, deps?)`: hasta 10 conexiones `activa`, la de `last_synced_at` más viejo primero.
   - `rescheduleAll(now)`: hasta 50 usuarios con tareas vencidas; aplica `reschedule` a cada uno.
2. `server/agents/runtime.ts`: `agenda` → `rescheduleAll(now)`, `google` → `syncAllGoogle(now)`, cada una
   devuelve `{ procesadas }`.
3. `app/api/calendar/google/connect/route.ts` (`GET ?org=<orgId>`): sesión y membresía (si no, redirige a
   `/login`); `state = <uuid>.<orgId>`, cookie `od-google-state` (`httpOnly`, `secure`, `sameSite: "lax"`,
   `maxAge: 600`); redirige a `googleAuthUrl` con `redirectUri` = `${NEXT_PUBLIC_APP_URL}/api/calendar/google/callback`.
4. `app/api/calendar/google/callback/route.ts` (`GET ?code&state`): `state` distinto de la cookie →
   redirige a `/<orgId>/agenda?google=error` sin tocar la base; si coincide, `connectGoogle` y redirige a
   `/<orgId>/agenda?google=ok`. Borra la cookie.
5. `tests/calendar-sync.test.ts` con `fetch` falso y una llave de prueba en `vi.stubEnv("TOKEN_ENCRYPTION_KEY", …)` (patrón de env de §9: `vi.stubEnv` + `vi.resetModules()` + `await import(…)` del módulo bajo prueba).

**Files**
- `apps/improvement/app/api/calendar/google/connect/route.ts`
- `apps/improvement/app/api/calendar/google/callback/route.ts`
- `apps/improvement/server/calendar/sync.ts`
- `apps/improvement/server/agents/runtime.ts`
- `apps/improvement/tests/calendar-sync.test.ts`

**Acceptance**
1. **WHEN** `connectGoogle` recibe un código válido del `fetch` falso **THE SYSTEM SHALL** guardar una `calendar_connection` `activa` cuyo `refresh_token_enc` empieza con `v1.` y descifra al token original.
2. **WHEN** `syncGoogleFor` recibe un 410 **THE SYSTEM SHALL** borrar los eventos `google` del usuario y rellenarlos con una sincronización completa sin `syncToken`.
3. **WHEN** el refresh del token responde 400 **THE SYSTEM SHALL** dejar la conexión en `error`.
4. **WHEN** el callback recibe un `state` distinto de la cookie `od-google-state` **THE SYSTEM SHALL** redirigir con `google=error` sin escribir ninguna conexión.
5. **WHEN** `runTarea("google")` corre sin conexiones activas **THE SYSTEM SHALL** devolver `procesadas` 0.

**Verify**
```bash
pnpm --filter improvement test tests/calendar-sync.test.ts
pnpm --filter improvement test tests/agents-runtime.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/app/api/calendar/google/connect/route.ts apps/improvement/app/api/calendar/google/callback/route.ts apps/improvement/server/calendar/sync.ts apps/improvement/server/agents/runtime.ts apps/improvement/tests/calendar-sync.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E5-T6 (step 36): conexión OAuth con Google y sincronización incremental"
git tag step-36-od-google-sync
git ls-files --error-unmatch apps/improvement/server/calendar/sync.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E5-T7` — Pantalla de agenda del usuario

**Depends on:** `E5-T6`, `E4-T6` · **Priority:** p1 · **Step:** 37

1. `server/permissions/sections.ts`: `"agenda"` al final de `SECTION_SLUGS` (`label: "Agenda"`,
   `hint: "Tu calendario, tus pendientes y tu página de reservas."`, `scopes: ["propio"]`) y en `OFICINAS_SLUGS`.
2. `app/[org]/agenda/page.tsx` (Server Component + Server Actions): `requireSection(org, "agenda")`; semana
   actual agrupada por día (lista, no cuadrícula); alta de tarea/evento/bloqueo; "Hecho"; botón "Reprogramar
   pendientes" (`rescheduleMine`); estado de Google con "Conectar Google Calendar" (enlace a
   `/api/calendar/google/connect?org=<orgId>`) o "Desconectar"; formulario de página de reservas (slug,
   título, duración, horario por día de la semana) con su enlace público `/agenda/<slug>`. Mensaje de
   `?google=error|ok` en `role="status"`.
3. `tests/e2e/agenda.spec.ts` (`serial`): el usuario crea una tarea en el pasado, pulsa "Reprogramar
   pendientes" y la ve con hora nueva; guarda una página de reservas; un empleado sin `agenda` recibe 404.

**Files**
- `apps/improvement/app/[org]/agenda/page.tsx`
- `apps/improvement/server/permissions/sections.ts`
- `apps/improvement/tests/e2e/agenda.spec.ts`

**Acceptance**
1. **WHEN** el usuario crea una tarea vencida y pulsa "Reprogramar pendientes" **THE SYSTEM SHALL** mostrarla con un horario posterior a la hora actual.
2. **WHEN** el usuario guarda una página de reservas con slug válido **THE SYSTEM SHALL** mostrar su enlace `/agenda/<slug>`.
3. **WHEN** un empleado sin permiso de `agenda` abre `/[org]/agenda` **THE SYSTEM SHALL** responder 404.
4. **WHEN** AxeBuilder analiza `/[org]/agenda` **THE SYSTEM SHALL** reportar 0 violaciones.

**Verify**
```bash
pnpm --filter improvement test:e2e agenda.spec.ts
pnpm --filter improvement test tests/permissions.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- ":(literal)apps/improvement/app/[org]/agenda/page.tsx" apps/improvement/server/permissions/sections.ts apps/improvement/tests/e2e/agenda.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E5-T7 (step 37): pantalla de agenda con reprogramación y página de reservas"
git tag step-37-od-pantalla-agenda
git ls-files --error-unmatch ":(literal)apps/improvement/app/[org]/agenda/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E5-T8` — Portal público de reservas

**Depends on:** `E5-T7` · **Priority:** p1 · **Step:** 38

1. `server/calendar/booking.ts` — sin sesión, lectura con `select` de columnas explícitas (nunca `user_id`,
   correo del dueño ni ids internos hacia afuera):
   - `loadPublicBookingPage(slug, date, now)` → `{ title, durationMinutes, slots }` o `null` si no existe o
     `active` es `false`; `busy` = eventos del dueño de la página + reservas `confirmada`.
   - `createBooking(slug, input, now)`: `zod` (`startsAt` ISO, `guestName` 1-80, `guestEmail` email); el inicio
     debe estar en `availableSlots`; en una transacción inserta `booking` (con `cancel_token` =
     `randomBytes(24).toString("base64url")`) y un `calendar_event` `evento` con `source = 'reserva'` para el
     dueño; la violación de `uq_booking_page_slot` → `{ ok: false, error: { code: "SLOT_TAKEN", message: "Ese horario ya no está disponible." } }`.
   - `cancelBooking(cancelToken)` → `cancelada` y borra su evento.
2. `app/agenda/[slug]/page.tsx` (pública, fuera de `[org]`): día por `?d=YYYY-MM-DD` (hoy por defecto), un
   botón por horario, formulario de nombre y correo, confirmación con su enlace de cancelación
   (`?cancelar=<token>`). `notFound()` si la página no existe.
3. `tests/booking.test.ts`: dos `createBooking` simultáneos (`Promise.all`) al mismo horario.
4. `tests/e2e/agenda.spec.ts`: dos pruebas más — un visitante sin sesión reserva; un segundo visitante no ve
   ese horario.

**Files**
- `apps/improvement/server/calendar/booking.ts`
- `apps/improvement/app/agenda/[slug]/page.tsx`
- `apps/improvement/tests/booking.test.ts`
- `apps/improvement/tests/e2e/agenda.spec.ts`

**Acceptance**
1. **WHEN** dos visitantes reservan el mismo horario al mismo tiempo **THE SYSTEM SHALL** confirmar exactamente una reserva y devolver `SLOT_TAKEN` a la otra.
2. **WHEN** un visitante reserva **THE SYSTEM SHALL** crear un `calendar_event` con `source` `reserva` en la agenda del dueño de la página.
3. **WHEN** se pide un horario fuera de `availableSlots` **THE SYSTEM SHALL** devolver `VALIDATION_ERROR` sin escribir.
4. **WHEN** un visitante sin sesión abre `/agenda/<slug>` y reserva **THE SYSTEM SHALL** mostrar la confirmación, y **WHEN** otro visitante abre el mismo día **THE SYSTEM SHALL** no mostrar ese horario.

**Verify**
```bash
pnpm --filter improvement test tests/booking.test.ts
pnpm --filter improvement test:e2e agenda.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/server/calendar/booking.ts ":(literal)apps/improvement/app/agenda/[slug]/page.tsx" apps/improvement/tests/booking.test.ts apps/improvement/tests/e2e/agenda.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E5-T8 (step 38): portal público de reservas sin doble reserva"
git tag step-38-od-reservas
git ls-files --error-unmatch ":(literal)apps/improvement/app/agenda/[slug]/page.tsx"   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e agenda.spec.ts` corre completo **THE SYSTEM SHALL** salir con código 0, con `/[org]/agenda` y `/agenda/<slug>` auditadas por axe sin violaciones.
2. **WHEN** dos visitantes reservan el mismo horario al mismo tiempo **THE SYSTEM SHALL** confirmar exactamente una reserva (`tests/booking.test.ts`).

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e agenda.spec.ts
```

## Pitfalls

- **Leer `TOKEN_ENCRYPTION_KEY` dentro de `crypto.ts`** — la llave entra por parámetro; `sync.ts` la pide con `requireEnv`.
- **Una llave real en una prueba** — siempre `randomBytes(32).toString("base64")` o `vi.stubEnv` con una de prueba.
- **Usar `Date#getHours()`** — el servidor no está en México; usa `utcOffsetMinutes`.
- **Resolver la doble reserva en código** — la decide `uq_booking_page_slot`; el código traduce la violación a `SLOT_TAKEN`.
- **Llamar a Google en una prueba** — siempre `fetch` falso.
- **Pedir la verificación de Google dentro del build** — está en el checklist de §20.1; en modo de prueba hay tope de 100 usuarios.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-od-*'` los lista (8 de este epic; 46 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] Las migraciones de E5-T1 se aplicaron solo después de un "sí" explícito de Jose Carlos.
