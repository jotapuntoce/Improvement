<!-- FUSIÓN (blueprints/oficinas-digitales §19.1): CLAUDE.md de summum-improvement (blob bdf72d3a) + Oficinas digitales; reemplaza el de la raíz. -->
# Improvement (monorepo jotapuntoce)

Constructor de empresas digitales de JotaPuntoCe. Monorepo Turborepo: `apps/admin` (panel interno de
Jose Carlos, JavaScript), `apps/improvement` (producto para el dueño y sus empleados, TypeScript),
`apps/summum` (la red) y `apps/agentes` (worker de agentes en un VPS). `packages/db` (Drizzle +
Postgres/Supabase) y `packages/ui` (tokens de diseño compartidos) son consumidos por las apps.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev — admin | `pnpm dev:admin` — http://localhost:3100 |
| Dev — improvement | `pnpm dev:improvement` — http://localhost:3200 |
| Build (todas las apps) | `pnpm build` |
| Lint (todo el repo, un solo config) | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit/integration tests | `pnpm test` · un archivo: `pnpm --filter improvement test tests/objectives.test.ts` |
| E2E | `pnpm --filter improvement test:e2e` |
| Worker de agentes | `node apps/agentes/src/main.ts --version` · pruebas: `pnpm --filter @jotapuntoce/agentes test` |
| DB — generar migración | `pnpm db:generate` |
| DB — aplicar migraciones | `pnpm db:migrate` (usa `DATABASE_URL_DIRECT`, nunca el pooler) |
| DB — studio | `pnpm db:studio` |
| DB — seed | `pnpm db:seed` |

**Gate:** `pnpm lint && pnpm typecheck && pnpm test` debe pasar antes de marcar cualquier tarea como hecha.

Runtime fijado en `.nvmrc` (Node 24). Versiones en `pnpm-lock.yaml` — léelo, nunca adivines una versión.

**Sin base de datos local.** No hay Docker Desktop confirmado. Todo lo que toca datos apunta a un proyecto Supabase real
vía `.env.local`/`.env.test` (ver `.env.example`); sin esas credenciales, DB y pruebas de integración no corren — es esperado.

## Stack

Next.js 16 App Router · TypeScript 6 (`apps/improvement`, `apps/summum`, `apps/agentes`, `packages/*`) / JavaScript (`apps/admin`) ·
Tailwind CSS v4 CSS-first · Drizzle ORM sobre Postgres (Supabase) · Supabase Auth · ESLint 9 + `eslint-config-next` (un solo
config raíz — desviación documentada del default Biome del track, ver blueprint §2) · Vitest · Playwright · Turborepo + pnpm.

## Architecture

**Camino de una request real (`apps/improvement`).** Navegador → `app/[org]/objetivos/page.tsx`
(Server Component) → `server/objectives/mutations.ts` → `@jotapuntoce/db` (`packages/db/src/client.ts`)
→ Postgres (Supabase, vía pooler). Toda mutación pasa por una Server Action en `server/**`, nunca por
un `fetch` del cliente. Autorización: cada handler de `server/**` empieza llamando
`requireOrgMembership(orgId)` (`apps/improvement/server/auth/guard.ts`).

**Dos puertas, no dos cerraduras.** RLS no es "la segunda capa" del camino de la app: en ese camino **no aplica en
absoluto**. `packages/db/src/client.ts` abre la conexión con una connection string fija y el rol dueño de las tablas, así
que ninguna política corre sobre nada que pase por `db`. Pero existe un segundo camino: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
viaja al navegador y todo empleado con sesión tiene un JWT `authenticated` propio, así que desde la consola puede pegarle
directo a PostgREST (`https://<ref>.supabase.co/rest/v1/objective?select=*`) sin tocar Next. Ahí el guard no existe.

| Camino | Quién conecta | Única autorización |
|---|---|---|
| App (Server Component → `server/**` → `db`) | rol dueño, RLS no aplica | el guard en código |
| PostgREST directo (anon key + JWT del usuario) | rol `authenticated`, RLS sí aplica | la política RLS |

Ninguna respalda a la otra: cada una cierra una puerta que la otra deja abierta. Un loader nuevo sin
guard fuga por la primera; una tabla nueva sin política fuga por la segunda.

**`apps/admin` usa la service-role key** de Supabase (bypasea RLS) porque Jose Carlos opera sobre todas
las organizaciones — solo se importa en `apps/admin/lib/db.js` y server actions, nunca en `"use client"`.

**Boundaries.** Cruzar una de estas líneas al revés rompe el build:

| Layer | May import from | Must never |
|---|---|---|
| `apps/*/app/**` (rutas) | `apps/*/components`, `apps/*/server`, `packages/ui` | importar `packages/db` directo |
| `apps/*/components/**` | `packages/ui`, otros componentes | importar `server/` o `packages/db` |
| `apps/*/server/**` | `packages/db`, `packages/ui` | importar React o `components/` |
| `packages/db/**` | nada interno del monorepo | importar `apps/*` |
| `apps/agentes/**` | solo `node:*` (habla con Improvement por HTTP) | importar `packages/*` o `apps/*` |

**El motor genérico nunca lleva lógica de un cliente específico.** Ningún archivo bajo `packages/db/**`
ni `apps/*/server/**` referencia un `org_id`, un nombre de empresa o un empleado por identificador
literal — toda personalización vive en filas de datos. Detalle: `.claude/rules/motor-generico.md`.

**Where things live.**

| Concern | Single source of truth |
|---|---|
| Esquema de datos | `packages/db/src/schema.ts` — cambia aquí, luego `pnpm db:generate` |
| Tokens de diseño | `packages/ui/src/tokens.css` — sin hex nuevo fuera de ahí |
| Tema por org | `packages/ui/src/theme.ts` (contraste, CSS vars) + `apps/improvement/server/companies/theme.ts` |
| Giros y oficina 2D | `packages/ui/src/building/industries.ts` (`INDUSTRIES`: categoría, base, áreas) + `officeLayout.ts` + `apps/improvement/server/office/**` |
| Acceso a env | `apps/improvement/lib/env.ts` (zod, degradado por paso — ver blueprint §10) |
| Sesión/auth | `apps/improvement/server/auth/guard.ts` — un `requireOrgMembership()`, usado en todas partes |
| Motor de puntos | `apps/improvement/server/objectives/points.ts` — constante `POINTS_PER_WEIGHT_POINT`, nunca repetida |
| Gateway de IA | `apps/improvement/server/ai/gateway.ts` y `apps/admin/lib/ia.js` — un único import de `@anthropic-ai/sdk` por app |
| Agentes | `apps/improvement/server/agents/runtime.ts` (ejecuta) + `apps/agentes` (solo marca el ritmo) |
| Cifrado de tokens | `apps/improvement/server/calendar/crypto.ts` — AES-256-GCM con `TOKEN_ENCRYPTION_KEY` |
| Apartado de butacas | `apps/improvement/server/seats/hold.ts` — `holdSeats()`, el único que escribe `held` |
| Semana del scorecard | `apps/improvement/server/direccion/scorecard/week.ts` — `weekStart()`: lunes en America/Mexico_City, nunca recalculada en otro lado |
| Agenda de la junta L10 | `MEETING_BLOCKS` en `packages/db/src/schema.ts` (orden) + `AGENDA` en `apps/improvement/server/direccion/meetings/agenda.ts` (minutos) |

## Code rules

1. **Import relativo con extensión explícita.** `./points.ts`, no `./points` — convención única del monorepo (blueprint §19.6).
2. **Path alias `@/` → raíz de cada app.** Sin `../../..`.
3. **Server-first en `apps/improvement`.** Server Components por default; `"use client"` solo en la hoja
   que necesita estado/eventos (el `<Canvas>` de la escena 3D, botones de mutación puntuales).
4. **Sin barrel files.** Importa del módulo real.
5. **Valida en el borde.** Toda Server Action y ruta API parsea su input con `zod` antes de tocar lógica de negocio.
6. **Errores como resultados tipados**, no strings lanzados: `{ ok: true, data } | { ok: false, error }`.
7. **RLS + `requireOrgMembership()` siempre juntos — pero NO porque se respalden.** Son dos cerraduras
   en dos puertas distintas (§Architecture). Una query nueva sin guard fuga de verdad; una tabla nueva
   sin política fuga de verdad. Nunca razones "se me pasó el guard, pero RLS lo atrapa" — no lo atrapa.
8. **Sin dependencia nueva sin una razón en el mensaje del commit.** Revisa antes si Node o una existente lo resuelve (`dotenv` y `tsx` se evitaron así).

## Design system

Tokens en `packages/ui/src/tokens.css`. Los componentes referencian solo nombres de token.

| Role | Value | Used for |
|---|---|---|
| `--accent-1` | `#7c5cff` | Marca, CTAs primarios, gradiente diagonal 135° |
| `--accent-2` | `#22d3ee` | Segundo color del gradiente |
| `--bg` | `#05060b` | Fondo de página |
| `--bg-card` | `rgba(255,255,255,0.035)` | Tarjetas (glassmorphism) |
| `--border` | `rgba(255,255,255,0.08)` | Divisores |
| `--text-primary` | `#f4f6fb` | Texto principal |
| `--text-muted` | `#6b7386` | Texto terciario — nunca para texto <16px ni información crítica |
| `--danger` | `#f87171` | Errores, acciones destructivas |
| `--success` | `#10b981` | Nodo completado (mapa/escena), confirmaciones |

- **Type:** Geist Sans (UI), Geist Mono (cifras/puntos), vía `next/font/google`.
- **Radios:** `--radius-sm: 10px` botones/chips, `--radius-md: 16px` stat, `--radius-lg: 22px` hero/modales.
- **Motion:** 0.15s ease hover/foco, 0.25s ease escala; `prefers-reduced-motion: reduce` en escena 3D y `app-icon`.
- **Tema:** oscuro por default, nunca por `prefers-color-scheme`. Cada org puede tener **su tema** (`organization.theme`:
  `bg`, `textPrimary`, `accent1`, `accent2`) que `app/[org]/layout.tsx` aplica como override de esas CSS vars **solo si
  pasa AA** (≥ 4.5:1 contra `bg`); sin tema, los tokens de arriba. El hex del cliente vive en datos, nunca en código.

## Environment

Ver `.env.example` (dueño y paso que activa cada variable). Next.js carga `.env.local` en `apps/*`; las herramientas
standalone (`packages/db/drizzle.config.ts`, `packages/db/src/seed.ts`, `apps/agentes`) llaman `process.loadEnvFile(...)` —
nunca asumas que una variable "ya está cargada" fuera de Next. El worker lee solo `IMPROVEMENT_API_URL` y
`AGENTS_API_SECRET`. `.env.example` está commiteado y sincronizado; ningún `.env*` con valores reales se commitea jamás.

## Rules

Convenciones diferidas — léelas antes de editar esa área:

| File | Applies to |
|---|---|
| `.claude/rules/motor-generico.md` | `packages/db/**`, `apps/*/server/**` |
| `.claude/rules/base-de-datos.md` | `packages/db/**` |
| `.claude/rules/ia-gateway.md` | `apps/improvement/server/ai/**` |
| `.claude/rules/tokens-de-diseno.md` | `apps/*/app/**/*.css`, `packages/ui/**` |
| `.claude/rules/direccion.md` | `apps/improvement/server/direccion/**`, `apps/improvement/app/[org]/direccion/**` |
| `.claude/rules/summum-improvement.md` | `apps/improvement/server/{erp,crm,seal,sinapsis,people,powerups,ai}/**`, `apps/improvement/app/w/**`, `apps/summum/server/**`, `apps/summum/app/{red,muelle,directorio,r}/**` |
| `.claude/rules/oficinas-digitales.md` | `apps/improvement/server/{office,agents,channels,calendar,seats,stripe,erp,crm,companies}/**`, `apps/improvement/app/[org]/{marca,oficina,canal,erp,agenda,butacas}/**`, `apps/improvement/app/{agenda,butacas,api}/**`, `apps/agentes/**`, `packages/ui/src/{theme.ts,building/**}` |

## Dirección (V/TO, Scorecard, Issues, Junta L10)

Hub `/[org]/direccion` y sus rutas `vision`, `scorecard`, `issues`, `junta` (blueprint
`blueprints/direccion-jaime/blueprint.md`).
- Cada módulo es una sección de `SECTION_SLUGS`; página → `requireSection(orgId, slug)`;
  `server/direccion/**` → `resolveSection(userId, orgId, slug)`, o `findOwnerMembership()` en las
  escrituras solo-dueño (editar la V/TO, definir medibles, crear issues y pendientes).
- Issues = filas de `org_need`; `status` ES el flujo IDS (`abierta` → `en_progreso` → `resuelta`;
  `derivada` fuera). Un pendiente es un `objective` con `need_id`, creado siempre por `createObjective()`.
- "Indicadores" (`org_kpi`, calculado) ≠ "Scorecard semanal" (`org_measurable`, manual). No se mezclan.
- La base es el Supabase compartido: `pnpm db:migrate` pide confirmación (`permissions.ask`). Muestra
  el SQL a Jose Carlos y espera un "sí" explícito por cada migración.

## Summum + Improvement (operación, red y Sello)

Blueprint: `blueprints/summum-improvement/blueprint.md` · reglas: `.claude/rules/summum-improvement.md`.
- `org_kpi` crece solo por su vía documentada: fuente nueva en `KPI_SOURCES` + valor en su check. Su semántica no cambia.
- Pacto, check-ins y People Analyzer: cada quien lee solo lo suyo (RLS por `auth.uid()`); nunca un ranking en Improvement.
- Rutas públicas (`/directorio`, `/r/[code]`, `/w/[token]`) leen columnas públicas explícitas — nunca `select *`.

## Oficinas digitales

Blueprint: `blueprints/oficinas-digitales/blueprint.md` · reglas: `.claude/rules/oficinas-digitales.md`.
- Oficina 2D por giro (`/[org]/oficina`): fotos en el bucket privado `espacios`; la IA solo propone un
  borrador y nada cambia hasta que el dueño confirma. Nunca reconocimiento facial. Convive con el Lobby.
- Agentes: Improvement es manager y agente del dueño, un especialista por jefe, recepción única entrada.
  El worker `apps/agentes` no tiene credenciales de base ni de IA: solo llama `POST /api/agentes/<tarea>`.
- `seat` es el Accountability Chart; los lugares de un recinto son `venue_seat`. Cobro de butacas =
  cargo directo en la cuenta conectada del org, sin comisión de Jotapuntoce; sin `charges_enabled`, taquilla.
- Rutas públicas nuevas (`/agenda/[slug]`, `/butacas/[sessionId]`) leen columnas explícitas — nunca `select *`.

## Non-negotiable

1. Ninguna tabla org-scoped nueva se crea sin su política RLS en la misma migración.
2. El motor genérico (`packages/db`, `apps/*/server/**`) nunca referencia un org, empresa o empleado
   por id o nombre literal — solo por parámetro.
3. `SUPABASE_SERVICE_ROLE_KEY` solo se importa en código server-only de `apps/admin`, nunca en un
   archivo `"use client"`, en `apps/improvement` ni en `apps/agentes`.
4. Un empleado nunca puede leer el `responsibility_level` de otro empleado — verificado por RLS, no
   solo por el guard de la aplicación.
5. Nunca commitear secretos, `.env`, `.env.local` ni salida de build generada.
6. Nunca editar a mano un archivo bajo `packages/db/migrations/` — se regenera con `pnpm db:generate`.
7. Nunca marcar una tarea hecha con un comando de gate en rojo.
