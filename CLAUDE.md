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
| DB — carga inicial de una empresa real | `pnpm db:import <slug> <archivo.json> [--dry-run]` |

**Gate:** `pnpm lint && pnpm typecheck && pnpm test` debe pasar antes de marcar cualquier tarea como
hecha.

**Crons** (`apps/improvement/vercel.json`, autenticados con bearer `CRON_SECRET`, nunca con sesión):
`/api/cron/revisiones` (el agente revisor de entregas) y `/api/cron/ciclos` (el motor de las siete
fases). Los dos corren una vez al día — ver §Architecture.

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
`requireOrgMembership(orgId)` (`apps/improvement/server/auth/guard.ts`).

**Dos puertas, no dos cerraduras.** RLS no es "la segunda capa" del camino de la app: en ese camino
**no aplica en absoluto**. `packages/db/src/client.ts` abre la conexión con una connection string
fija y el rol dueño de las tablas, así que ninguna política corre sobre nada que pase por `db`. Pero
existe un segundo camino: `NEXT_PUBLIC_SUPABASE_ANON_KEY` viaja al navegador y todo empleado con
sesión tiene un JWT `authenticated` propio, así que desde la consola del navegador puede pegarle
directo a PostgREST (`https://<ref>.supabase.co/rest/v1/objective?select=*`) sin tocar Next. Ahí el
guard no existe.

| Camino | Quién conecta | Única autorización |
|---|---|---|
| App (Server Component → `server/**` → `db`) | rol dueño, RLS no aplica | el guard en código |
| PostgREST directo (anon key + JWT del usuario) | rol `authenticated`, RLS sí aplica | la política RLS |

Ninguna respalda a la otra. Por eso van las dos: no porque se cubran entre sí, sino porque cada una
cierra una puerta que la otra deja abierta. Un loader nuevo sin guard fuga por la primera; una tabla
nueva sin política fuga por la segunda.

**El motor de Improvement: siete fases, una vuelta a la vez.** Improvement no es un generador de
sugerencias sueltas — dirige, y dirigir es un ciclo que se repite y del que queda registro. Una
fila de `improvement_cycle` es una vuelta:

| Fase | Quién la mueve | Qué produce |
|---|---|---|
| `observacion` | cron (modelo) | qué está pasando que valga la pena mirar |
| `inferencia` | cron (modelo) | la causa más probable |
| `analisis` | cron (modelo) | qué mejoraría si se corrigiera |
| `sugerencia` | cron (modelo), **y ahí se detiene** | la propuesta + hasta 3 `delegated_task` |
| `decision` | **el dueño**, desde el chat | acepta, rechaza o pide modificar |
| `experimentacion` | el equipo | las tareas se trabajan |
| `medicion` | cron (modelo) | resultado vs. predicción, y el aprendizaje |

**El método que corre por dentro de las siete fases: Six Sigma, con el Análisis de Causa Raíz en
su centro.** No son dos métodos: el ACR *es* la fase Analizar de DMAIC, y por eso viven en un solo
texto (`SEIS_SIGMA_METODO` en `server/ai/prompts/seisSigma.ts`) y no en dos. Las fases no son
etiquetas — cada una es un paso, y el contrato con el modelo lo obliga:

| Paso (DMAIC) | Dónde vive | Qué exige el esquema |
|---|---|---|
| **D** — definir el problema con impacto | `observacion` | `impacto` obligatorio (aunque sea "no se puede medir") |
| **D** — a quién le duele (lo crítico para el cliente) | `observacion` | `aQuienLeDuele` obligatorio; "es interno" es respuesta válida |
| **M** — línea base y confianza en el dato | `analisis` | `lineaBase` obligatorio; "no hay dato" es respuesta válida |
| **A** — bajar a la raíz con los porqués | `inferencia` | 3 a 7 eslabones, `causaRaiz`, una de las 6M, `evidencia` |
| **A** — separar raíz de lo que contribuyó | `inferencia` | `factoresContribuyentes` aparte |
| **I** — acciones que atacan la raíz | `sugerencia` | cada tarea justifica `atacaLaRaiz` o no se crea |
| **C** — qué sostiene la mejora | `sugerencia` → `medicion` | `comoSeSostiene` se escribe al proponer (columna `control_plan`); `controlInstalado` al cerrar |
| Verificar que no se repite | `analisis` → `medicion` | `comoSeVerifica` se fija ANTES de proponer; `laRaizSigueViva` al cerrar |

Lo que Six Sigma trae y el ACR solo no traía: **perseguir la variación, no el promedio** (el
cliente no vive la media, vive el peor caso), **línea base antes de proponer**, **los pocos
vitales antes de los porqués**, **pilotear antes de escalar** y, sobre todo, **Controlar** — la
fase que todo el mundo se salta y por la que las mejoras duran seis semanas.

Lo que se dejó fuera a propósito: Minitab, DOE factorial, pruebas de hipótesis, Cp/Cpk, gráficos
SPC y los cinturones. Una empresa de doce personas no tiene el volumen que esas herramientas
necesitan ni a nadie que las lea; lo que sobrevive de cada una es su pregunta, y esas sí están.
Y el método **nunca se nombra hacia afuera**: el Director dice "contra qué lo comparamos", no
"establezcamos la línea base" (hay pruebas de regresión sobre eso en `improvement-director.test.ts`).

Cuatro reglas que este método impone y que no se negocian:

1. **La cadena nunca termina en una persona.** Si un porqué llega a "Fulano se saltó el paso", el
   siguiente pregunta qué del sistema lo permitió. Es la regla del ACR y el no negociable #4 a la
   vez: en cuanto el análisis se vuelve culpa, la gente deja de reportar problemas.
2. **La causa raíz va en columnas, no en prosa.** `root_cause`, `cause_category`, `whys`,
   `contributing_factors`. El valor del método está en el agregado — "de las últimas diez, siete
   fueron Métodos" es lo que hace evolucionar una empresa, y eso no se cuenta sobre párrafos.
3. **`comoSeVerifica` se escribe en el análisis, antes de proponer nada.** Una vara elegida después
   de ver el resultado siempre dice que salió bien.
4. **`comoSeSostiene` se escribe al proponer, no al medir.** Por lo mismo: un plan de control
   inventado después de ver el resultado es teatro. Va a columna (`control_plan`) porque la
   medición lo relee semanas más tarde para contestar si de verdad quedó puesto.

El catálogo de las 6M vive en dos lugares que tienen que coincidir: `DIRECTOR_CAUSE_CATEGORIES`
(`server/ai/prompts/director.ts`) y el check `improvement_cycle_cause_category_check`. El check es
la última palabra — agregar una categoría sin migrar atora la fase de inferencia.

**De `sugerencia` no se sale solo.** El ciclo espera al dueño para siempre si hace falta. Un
director que ejecuta sus propias propuestas sin preguntar es un piloto automático, y el dueño deja
de contarle cosas en cuanto la primera se le va de las manos. Es la regla que sostiene el producto:
si se toca, se toca a propósito y se documenta aquí.

Dos cosas más que el motor garantiza: una fase que falla **no avanza** el ciclo (se queda y se
reintenta), y cada corrida avanza **una sola fase por ciclo** — entre fase y fase el dueño puede
escribir algo que cambie el contexto.

El cron corre **una vez al día**, no cada seis horas: el plan de Vercel de este proyecto solo admite
cron diario y un `schedule` más frecuente hace fallar el deploy entero (ya pasó, commit `4a5a0d2`).
El dueño compensa con el botón "Avanza ya", que corre el mismo `advanceCycle`.

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
| Motor de Improvement | `apps/improvement/server/improvement/` — `phases.ts` (qué hace cada fase), `motor.ts` (cuándo corre), `context.ts` (qué sabe), `delegation.ts` (qué reparte), `chat.ts`, `analytics.ts` |
| Prompt del Director General | `apps/improvement/server/ai/prompts/director.ts` — dinámico, con contexto acumulado (ver `.claude/rules/ia-gateway.md`) |
| Personalidad del Director | `DIRECTOR_PERSONA` en `director.ts` — voz, registro emocional y convicción; la usan el motor Y la burbuja, nunca se reescribe en el segundo lugar |
| Método del Director | `apps/improvement/server/ai/prompts/seisSigma.ts` — Six Sigma con el ACR dentro de su fase Analizar; `SEIS_SIGMA_METODO` para el motor, `SEIS_SIGMA_EN_CONVERSACION` para la burbuja. Nunca se escribe el método en un segundo lugar |
| Lo que llevan juntos | `apps/improvement/server/improvement/relacion.ts` — patrón, rechazos, errores propios y calibración, derivados de las vueltas cerradas; sin tabla propia |
| Niveles de convicción | `CONVICTION_LEVELS` en `director.ts` — espeja `improvement_cycle_conviction_check` |
| Catálogo de las 6M (Ishikawa) | `DIRECTOR_CAUSE_CATEGORIES` en `director.ts` — espeja `improvement_cycle_cause_category_check` |
| Manos del Director (burbuja) | `apps/improvement/server/ai/tools.ts` — qué puede mirar, a dónde lleva, qué propone |
| Bucle de la burbuja | `apps/improvement/server/ai/conversation.ts` — `askDirector()` propone, `runAccion()` ejecuta lo confirmado |
| Alcance por área | `apps/improvement/server/permissions/areaScope.ts` — un `areaScopeFilter()`, usado por todos los loaders que recortan |
| CRM extendido | `apps/improvement/server/crm/client-extensions.ts` — contexto y riesgo; el CRUD sigue en `server/clients/mutations.ts` |
| ERP básico | `apps/improvement/server/erp/projects.ts` — subtareas, dependencias y riesgo; el alta sigue en `server/projects/mutations.ts` |
| Glifos de área | `packages/ui/src/building/areaIcons.ts` — el catálogo espeja el check `area_icon_check` |
| Carga inicial de datos reales | `packages/db/src/import.ts` — áreas, cartera y proyectos; la gente entra por invitación, nunca por aquí |
| Bandeja del empleado | `apps/improvement/app/[org]/tareas/page.tsx` — tareas delegadas + objetivos propios + subtareas; una sola lista |
| Tablero del dueño | `apps/improvement/app/[org]/control/page.tsx` — solo lee y navega, no edita nada |

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
7. **RLS + `requireOrgMembership()` siempre juntos — pero NO porque se respalden.** Son dos
   cerraduras en dos puertas distintas (ver §Architecture, "Dos puertas, no dos cerraduras"). Una
   query nueva sin guard fuga de verdad; una tabla nueva sin política fuga de verdad. Nunca
   razones "se me pasó el guard, pero RLS lo atrapa" — no lo atrapa.
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
