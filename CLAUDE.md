# Improvement (monorepo jotapuntoce)

Constructor de empresas digitales de JotaPuntoCe. Dos apps Next.js en un monorepo Turborepo: `apps/admin`
(panel interno de Jose Carlos, JavaScript) y `apps/improvement` (producto para el dueño y sus
empleados, TypeScript). `packages/db` (Drizzle + Postgres/Supabase) y `packages/ui` (tokens de diseño
compartidos) son consumidos por ambas.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev — admin | `pnpm dev:admin` — http://localhost:3100 |
| Dev — improvement | `pnpm dev:improvement` — http://localhost:3200 |
| Build (ambas apps) | `pnpm build` |
| Lint (todo el repo, un solo config) | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit/integration tests | `pnpm test` · un archivo: `pnpm --filter improvement test tests/objectives.test.ts` |
| E2E | `pnpm --filter improvement test:e2e` |
| DB — generar migración | `pnpm db:generate` |
| DB — aplicar migraciones | `pnpm db:migrate` (usa `DATABASE_URL_DIRECT`, nunca el pooler) |
| DB — studio | `pnpm db:studio` |
| DB — seed | `pnpm db:seed` |

**Gate:** `pnpm lint && pnpm typecheck && pnpm test` debe pasar antes de marcar cualquier tarea como
hecha.

Runtime fijado en `.nvmrc` (Node 24). Versiones de dependencias viven en `pnpm-lock.yaml` — léelo,
nunca adivines una versión.

**Sin base de datos local.** No hay Docker Desktop confirmado en esta máquina. Todo lo que toca datos
apunta a un proyecto Supabase real vía `.env.local`/`.env.test` (ver `.env.example`). Sin esas
credenciales, los comandos de DB y las pruebas de integración no corren — es esperado, no un bug.

## Stack

Next.js 16 App Router · TypeScript 6 (`apps/improvement`, `packages/*`) / JavaScript
(`apps/admin`, sin cambios) · Tailwind CSS v4 CSS-first · Drizzle ORM sobre Postgres (Supabase) ·
Supabase Auth · ESLint 9 + `eslint-config-next` (un solo config raíz — desviación documentada del
default Biome del track, ver blueprint §2) · Vitest · Playwright · Turborepo + pnpm workspaces.

## Architecture

**Camino de una request real (`apps/improvement`).** Navegador → `app/[org]/objetivos/page.tsx`
(Server Component) → `server/objectives/mutations.ts` → `@jotapuntoce/db` (`packages/db/src/client.ts`)
→ Postgres (Supabase, vía pooler). Toda mutación pasa por una Server Action en `server/**`, nunca por
un `fetch` del cliente. Autorización: cada handler de `server/**` empieza llamando
`requireOrgMembership(orgId)` (`apps/improvement/server/auth/guard.ts`) — RLS en Postgres es la
segunda capa, no la única.

**`apps/admin` usa la service-role key** de Supabase (bypasea RLS) porque Jose Carlos opera sobre
todas las organizaciones a la vez — esa clave solo se importa en `apps/admin/lib/db.js` y en server
actions, nunca en un archivo `"use client"`.

**Boundaries.** Cruzar una de estas líneas al revés rompe el build:

| Layer | May import from | Must never |
|---|---|---|
| `apps/*/app/**` (rutas) | `apps/*/components`, `apps/*/server`, `packages/ui` | importar `packages/db` directo |
| `apps/*/components/**` | `packages/ui`, otros componentes | importar `server/` o `packages/db` |
| `apps/*/server/**` | `packages/db`, `packages/ui` | importar React o `components/` |
| `packages/db/**` | nada interno del monorepo | importar `apps/*` |

**El motor genérico nunca lleva lógica de un cliente específico.** Ningún archivo bajo `packages/db/**`
ni `apps/*/server/**` referencia un `org_id`, un nombre de empresa o un empleado por identificador
literal — toda personalización vive en filas de datos (áreas, objetivos, config), nunca en una rama de
código. Detalle completo: `.claude/rules/motor-generico.md`.

**Where things live.**

| Concern | Single source of truth |
|---|---|
| Esquema de datos | `packages/db/src/schema.ts` — cambia aquí, luego `pnpm db:generate` |
| Tokens de diseño | `packages/ui/src/tokens.css` — sin hex nuevo fuera de ahí |
| Acceso a env | `apps/improvement/lib/env.ts` (zod, degradado por paso — ver blueprint §10) |
| Sesión/auth | `apps/improvement/server/auth/guard.ts` — un `requireOrgMembership()`, usado en todas partes |
| Motor de puntos | `apps/improvement/server/objectives/points.ts` — constante `POINTS_PER_WEIGHT_POINT`, nunca repetida |
| Gateway de IA | `apps/improvement/server/ai/gateway.ts` — único import de `@anthropic-ai/sdk` en todo el repo |

## Code rules

1. **Import relativo con extensión explícita.** `./points.ts`, no `./points` — convención única en
   todo el monorepo, ver blueprint §19.6.
2. **Path alias `@/` → raíz de cada app.** Sin `../../..`.
3. **Server-first en `apps/improvement`.** Componentes son Server Components por default;
   `"use client"` solo en la hoja que necesita estado/eventos (el `<Canvas>` de la escena 3D, botones
   de mutación puntuales).
4. **Sin barrel files.** Importa del módulo real.
5. **Valida en el borde.** Toda Server Action y ruta API parsea su input con `zod` antes de tocar
   lógica de negocio.
6. **Errores como resultados tipados**, no strings lanzados: `{ ok: true, data } | { ok: false, error }`.
7. **RLS + `requireOrgMembership()` siempre juntos.** Ninguna query nueva confía solo en uno de los
   dos.
8. **Sin dependencia nueva sin una razón en el mensaje del commit.** Revisa primero si Node o una
   dependencia existente ya lo resuelve (ver §11 del blueprint — `dotenv` y `tsx` se evitaron así).

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
- **Radios:** `--radius-sm: 10px` botones/chips, `--radius-md: 16px` tarjetas de stat, `--radius-lg:
  22px` tarjetas hero/modales.
- **Motion:** 0.15s ease hover/foco, 0.25s ease escala. Respeta `prefers-reduced-motion: reduce` en
  toda la escena 3D y el `app-icon`.
- **Tema:** oscuro fijo, no depende de `prefers-color-scheme` (decisión ya tomada, no reabrir).

## Environment

Ver `.env.example` para la tabla completa con dueño y paso que activa cada variable. Cargado
automáticamente por Next.js en `apps/*` vía `.env.local`; herramientas standalone
(`packages/db/drizzle.config.ts`, `packages/db/src/seed.ts`) llaman `process.loadEnvFile(".env.local")`
explícitamente — nunca asumas que una variable "ya está cargada" fuera de una app Next.

`.env.example` está commiteado y se mantiene sincronizado. Ningún `.env*` con valores reales se
commitea jamás.

## Rules

Convenciones diferidas — léelas antes de editar esa área:

| File | Applies to |
|---|---|
| `.claude/rules/motor-generico.md` | `packages/db/**`, `apps/*/server/**` |
| `.claude/rules/base-de-datos.md` | `packages/db/**` |
| `.claude/rules/ia-gateway.md` | `apps/improvement/server/ai/**` |
| `.claude/rules/tokens-de-diseno.md` | `apps/*/app/**/*.css`, `packages/ui/**` |

## Non-negotiable

1. Ninguna tabla org-scoped nueva se crea sin su política RLS en la misma migración.
2. El motor genérico (`packages/db`, `apps/*/server/**`) nunca referencia un org, empresa o empleado
   por id o nombre literal — solo por parámetro.
3. `SUPABASE_SERVICE_ROLE_KEY` solo se importa en código server-only de `apps/admin`, nunca en un
   archivo `"use client"` ni en `apps/improvement`.
4. Un empleado nunca puede leer el `responsibility_level` de otro empleado — verificado por RLS, no
   solo por el guard de la aplicación.
5. Nunca commitear secretos, `.env`, `.env.local` ni salida de build generada.
6. Nunca editar a mano un archivo bajo `packages/db/migrations/` — se regenera con `pnpm db:generate`.
7. Nunca marcar una tarea hecha con un comando de gate en rojo.
