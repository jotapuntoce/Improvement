# Epic 01: Fundación

> Tras esta épica existe un monorepo funcional con las dos apps construyendo, un esquema de datos
> completo con RLS, autenticación multi-tenant y el primer ciclo completo (área → objetivo → puntos)
> funcionando de punta a punta.

| | |
|---|---|
| **Epic id** | `01-fundacion` |
| **Tasks** | `E1-T1` … `E1-T6` |
| **Depends on** | nada — empieza aquí |
| **Unlocks** | `02-producto-core`, `03-experiencia-y-lanzamiento` |
| **Parallel with** | ninguna — es la base de todo lo demás |

No necesitas ningún otro archivo para completar esta épica. Todo lo de abajo se repite aquí a
propósito.

---

## Stack

Next.js 16 App Router · TypeScript 6 (`apps/improvement`, `packages/*`) / JavaScript
(`apps/admin`) · Tailwind CSS v4 CSS-first · Drizzle ORM 0.45.2 sobre Postgres (Supabase) · Supabase
Auth · ESLint 9 + `eslint-config-next` (config único, desviación de Biome — blueprint.md §2) ·
Vitest · Turborepo + pnpm workspaces.

| Task | Command |
|---|---|
| Dev — admin | `pnpm dev:admin` |
| Dev — improvement | `pnpm dev:improvement` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test (un archivo) | `pnpm --filter improvement test {path}` / `pnpm --filter @jotapuntoce/admin test {path}` |
| Migrar esquema | `pnpm db:generate` / `pnpm db:migrate` |

**Gate:** `pnpm lint && pnpm typecheck && pnpm test` pasa antes de marcar cualquier tarea aquí como
hecha.

**Sin base de datos local.** No hay Docker Desktop confirmado. `E1-T3` en adelante requiere un
proyecto Supabase real referenciado en `.env.local` (ver `.env.example`, ya en la raíz del proyecto —
copiado por Bootstrap antes de `E1-T1`). Sin esas credenciales, los comandos de DB no corren; es
esperado, no un bloqueo.

## Directory subtree

Solo las partes que esta épica toca:

```
jotapuntoce/
  apps/
    admin/                        # movido tal cual en E1-T1, NO reescrito
      app/, components/, lib/     # existentes, sin cambios de estructura
      package.json                # EDITADO en E1-T1
      # eslint.config.mjs ELIMINADO en E1-T1
    improvement/                  # NUEVO en E1-T2
      app/
        layout.tsx                # NUEVO
        globals.css                # NUEVO — importa @jotapuntoce/ui/tokens.css
        login/page.tsx             # NUEVO en E1-T4
        [org]/objetivos/page.tsx   # NUEVO en E1-T6
      server/
        auth/guard.ts               # NUEVO en E1-T4
        objectives/points.ts        # NUEVO en E1-T6
        objectives/mutations.ts     # NUEVO en E1-T6
      lib/env.ts                    # NUEVO en E1-T4
      tests/
        auth/guard.test.ts          # NUEVO en E1-T4
        objectives.test.ts          # NUEVO en E1-T6
  packages/
    ui/src/tokens.css               # YA EXISTE (Bootstrap, vía workspace/) — E1-T2 no lo regenera
    db/
      src/schema.ts                 # NUEVO en E1-T3
      src/client.ts                 # NUEVO en E1-T3
      migrations/NNNN_rls.sql       # NUEVO en E1-T4 (nombre generado por drizzle-kit --name=rls)
```

Todo lo fuera de este subárbol está fuera de alcance. Si una tarea parece requerir editar un archivo
no listado aquí, detente y repórtalo — significa que el límite de la épica está mal.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `organization`, `profile`, `membership`, `invitation`, `area`, `objective`, `employee_points_ledger` | todos los campos, definidos completos en `E1-T3` | ver blueprint.md §4 para el detalle exacto de cada tabla |

## Contracts

**Consumed** — ya existe, no lo reconstruyas:

| From | Interface | Guarantee |
|---|---|---|
| jotapuntoce-admin (proyecto original) | `app/`, `components/`, `lib/storage.js`, `app/globals.css` | funciona hoy con `next@16.3.3`, `react@19.2.8` — solo se mueve, no se reescribe |

**Produced** — épicas posteriores dependen exactamente de estas firmas. Cambiar una las rompe:

| Export | Signature | Used by |
|---|---|---|
| `apps/improvement/server/auth/guard.ts` → `requireOrgMembership` | `(orgId: string) => Promise<{ userId, role }>` — lanza 404 si no hay membresía | `02-producto-core`, `03-experiencia-y-lanzamiento` |
| `apps/improvement/server/objectives/points.ts` → `POINTS_PER_WEIGHT_POINT`, `pointsForObjective` | `pointsForObjective(impactWeight: number): number` | `03-experiencia-y-lanzamiento` (E3-T1, escena 3D lee el mismo cálculo) |
| `packages/db/src/schema.ts` → todas las tablas | Drizzle table definitions | todas las épicas siguientes |
| `packages/db/src/client.ts` → `db` | cliente Drizzle con `{ prepare: false }` | todas las épicas siguientes |

## Conventions that bite in this area

- `apps/admin` es JavaScript — no le agregues `.ts`/`.tsx` ni un `tsconfig.json`; su `typecheck` es un
  no-op documentado, no un olvido.
- Todo import relativo TypeScript lleva extensión explícita (`./points.ts`, no `./points`) —
  `allowImportingTsExtensions: true` ya está en la base. Ver blueprint.md §19.6 para la matriz
  completa.
- El motor genérico (`packages/db`, `apps/*/server/**`) nunca referencia un org, empresa o empleado
  por id o nombre literal. Regla completa: `.claude/rules/motor-generico.md`.

Reglas completas del proyecto: `CLAUDE.md`. Reglas de área: `.claude/rules/{name}.md`. Ambos ya están
en la raíz del proyecto — el builder los copió ahí desde `workspace/` del bundle antes de la tarea 1.

---

## Tasks

Listadas en el mismo orden que `tasks.json`. Ese orden es el orden de construcción — trabaja de
arriba hacia abajo, sin reordenar por prioridad.

### `E1-T1` — Migrar apps/admin al monorepo

**Depends on:** nada · **Priority:** p0

`workspace/apps/admin/package.json` ya llegó a `apps/admin/package.json` en su forma final (nombre
`@jotapuntoce/admin`, scripts de puerto 3100, dependencias `@jotapuntoce/db`/`@supabase/supabase-js`/
`resend`) como parte de la copia de `workspace/` que hizo Bootstrap antes de esta tarea — no lo
muevas ni lo regeneres. Mueve el resto del contenido de `jotapuntoce-admin/` (sibling de
`jotapuntoce/`, ya scaffolded hoy con `create-next-app`) hacia `apps/admin/`: `app/`, `components/`,
`lib/`, `jsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `app/favicon.ico`. **No muevas
`package.json` ni `node_modules/`** — el primero ya está en su lugar, el segundo se regenera con
`pnpm install`. Elimina `apps/admin/eslint.config.mjs` — el monorepo usa el config raíz único.

**Files**
- `apps/admin/app/**`, `apps/admin/components/**`, `apps/admin/lib/**` — movidos desde `jotapuntoce-admin/`
- `apps/admin/eslint.config.mjs` — eliminado

**Acceptance**

1. **WHEN** `pnpm install --frozen-lockfile` corre desde la raíz `jotapuntoce/` **THE SYSTEM SHALL**
   exit 0 y resolver `apps/admin` como parte del workspace.
2. **WHEN** `pnpm --filter @jotapuntoce/admin build` corre **THE SYSTEM SHALL** exit 0.
3. **WHEN** `pnpm exec eslint apps/admin` corre **THE SYSTEM SHALL** exit 0 usando el config raíz
   único (ningún `eslint.config.mjs` sobrevive dentro de `apps/admin/`).
4. **WHEN** el directorio `jotapuntoce-admin/` original se revisa tras este paso **THE SYSTEM SHALL**
   estar vacío de código de producto (solo puede quedar `node_modules/` sin mover, que se ignora).

**Verify** — cada comando corre desde la raíz del proyecto, en orden. El último debe salir con 0.

```bash
test ! -f apps/admin/eslint.config.mjs
pnpm install --frozen-lockfile
pnpm --filter @jotapuntoce/admin build
pnpm exec eslint apps/admin
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: migrar apps/admin al monorepo"
git tag step-01-migrate-admin
```

### `E1-T2` — Autorar el esqueleto de apps/improvement + tokens compartidos

**Depends on:** `E1-T1` · **Priority:** p0

`workspace/` ya trajo — vía Bootstrap, antes de E1-T1 — `apps/improvement/package.json` (deps y
scripts finales, puerto 3200, `react`/`react-dom` ya fijos en `19.2.8` exacto por el rango peer de
`@react-three/fiber@9.7.0` `>=19 <19.3`), `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`,
`tests/setup.ts`, y `packages/ui/src/tokens.css` + `packages/ui/package.json`. **Ninguno se regenera
aquí.** Por eso esta tarea NO corre `pnpm create next-app` (se niega a scaffoldear sobre un directorio
no vacío) — autora a mano el resto del esqueleto Next.js App Router: `next.config.mjs`
(`transpilePackages: ["@jotapuntoce/db", "@jotapuntoce/ui"]` — se agrega también al `next.config.mjs`
de admin, ya movido en E1-T1), `postcss.config.mjs`, `app/globals.css` (`@import "tailwindcss"; @import
"@jotapuntoce/ui/tokens.css";`), `app/layout.tsx` (Geist Sans/Mono, mismo patrón que
`apps/admin/app/layout.js`), `app/page.tsx` (placeholder mínimo) y `next-env.d.ts` (stub estándar de
tres líneas).

**Files**
- `apps/improvement/next.config.mjs` — nuevo
- `apps/improvement/postcss.config.mjs` — nuevo
- `apps/improvement/app/layout.tsx` — nuevo
- `apps/improvement/app/page.tsx` — nuevo
- `apps/improvement/app/globals.css` — nuevo, importa el token compartido
- `apps/improvement/next-env.d.ts` — nuevo
- `apps/improvement/package.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`,
  `tests/setup.ts` — ya provistos en el bundle, no se tocan
- `packages/ui/src/tokens.css`, `packages/ui/package.json` — ya provistos en el bundle, no se tocan

**Acceptance**

1. **WHEN** `pnpm build` corre desde la raíz **THE SYSTEM SHALL** construir ambas apps con exit 0.
2. **WHEN** se busca `--accent-1:` con grep en todo el árbol de `apps/` y `packages/` (excluyendo
   `node_modules` y `.next`) **THE SYSTEM SHALL** encontrar la definición solo en
   `packages/ui/src/tokens.css` — ningún otro archivo la redefine.
3. **WHEN** `apps/improvement` arranca en modo dev y se visita `/login` **THE SYSTEM SHALL**
   renderizar con el fondo `--bg` (`#05060b`) aplicado antes del primer paint (sin flash de tema
   claro).
4. **WHEN** `react` se resuelve en el lockfile **THE SYSTEM SHALL** fijarse en `19.2.8` exacto en
   ambas apps, sin rango `^` o `~`.

**Verify**

```bash
pnpm build
# --include ANTES del separador `--` (después, grep pierde el flag); .next/ excluido porque el
# build bundlea los tokens ahí, que es esperado, no una redefinición de fuente
n=$(grep -rln --include="*.css" -- "--accent-1:" apps packages | grep -v node_modules \
  | grep -v "/\.next/" | grep -v "packages/ui/src/tokens.css" | wc -l); test "$n" = 0
grep -n '"react": "19.2.8"' apps/improvement/package.json
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: scaffold apps/improvement + tokens compartidos"
git tag step-02-scaffold-improvement
```

### `E1-T3` — Esquema de datos en packages/db

**Depends on:** `E1-T2` · **Priority:** p0

Escribe las 15 tablas de blueprint.md §4 en `packages/db/src/schema.ts` (organization, profile,
membership, invitation, area, objective, employee_points_ledger, powerup_partner,
powerup_redemption, client, ai_suggestion, llm_calls, reminder, org_build_stage, prospect_company),
siguiendo exactamente el patrón de columnas/constraints de esa sección. `packages/db/src/client.ts`:
cliente `postgres` con `{ prepare: false }` contra `DATABASE_URL`, `db = drizzle(client, { schema })`.

**Files**
- `packages/db/src/schema.ts` — nuevo
- `packages/db/src/client.ts` — nuevo
- `packages/db/package.json` — ya provisto en el bundle, verificar

**Acceptance**

1. **WHEN** `pnpm db:generate` corre **THE SYSTEM SHALL** crear un directorio nuevo en
   `packages/db/migrations/` conteniendo las 15 tablas de §4 (contadas por `CREATE TABLE` en el SQL
   generado).
2. **WHEN** `pnpm --filter @jotapuntoce/db typecheck` corre **THE SYSTEM SHALL** exit 0.
3. **WHEN** `packages/db/src/client.ts` se inspecciona **THE SYSTEM SHALL** mostrar `prepare: false`
   en la configuración del cliente `postgres` (grep).
4. **WHEN** `DATABASE_URL_DIRECT` apunta a un proyecto Supabase real y `pnpm db:migrate` corre
   **THE SYSTEM SHALL** aplicar la migración sin error (requiere credenciales reales — el resto de
   esta tarea es verificable sin ellas).

**Verify**

```bash
pnpm --filter @jotapuntoce/db typecheck
grep -c "prepare: false" packages/db/src/client.ts
pnpm db:generate
test "$(grep -c 'CREATE TABLE' packages/db/migrations/0000_*.sql)" = 15
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: esquema de datos en packages/db"
git tag step-03-db-schema
```

### `E1-T4` — Auth + RLS + guard de tenencia

**Depends on:** `E1-T3` · **Priority:** p0

`drizzle-kit generate --custom --name=rls` (el flag `--name` fija el sufijo del archivo generado —
resultado `packages/db/migrations/NNNN_rls.sql`, nunca un nombre inventado a mano): activa RLS y las
políticas de blueprint.md §4/§8 en cada tabla org-scoped, más la política de
`employee_points_ledger` restringida a `employee_id = auth.uid()`. `apps/improvement/lib/env.ts`:
`zod` valida cada variable solo desde el paso que la activa (blueprint §10, columna "Required by
step"). `apps/improvement/server/auth/guard.ts`: `requireOrgMembership(orgId)` — obtiene la sesión de
Supabase, verifica `membership`, retorna `notFound()` si no hay fila (404, nunca 403).
`apps/improvement/app/login/page.tsx`: formulario email/contraseña contra Supabase Auth.

**Files**
- `packages/db/migrations/NNNN_rls.sql` (nombre generado por `drizzle-kit --name=rls`) — nuevo
- `apps/improvement/server/auth/guard.ts` — nuevo
- `apps/improvement/app/login/page.tsx` — nuevo
- `apps/improvement/lib/env.ts` — nuevo
- `apps/improvement/tests/auth/guard.test.ts` — nuevo

**Acceptance**

1. **WHEN** una request anónima llega a `/[org]/dashboard` **THE SYSTEM SHALL** redirigir a `/login`
   y volver a la URL original tras iniciar sesión.
2. **WHEN** un usuario autenticado sin `membership` en el org solicitado llama a
   `requireOrgMembership` **THE SYSTEM SHALL** lanzar un 404, nunca un 403.
3. **WHEN** un empleado consulta `employee_points_ledger` de otro empleado del mismo org (vía la
   política RLS, simulando la sesión de ese empleado) **THE SYSTEM SHALL** devolver cero filas.
4. **WHEN** `apps/improvement/lib/env.ts` se importa antes de que `ANTHROPIC_API_KEY` exista
   **THE SYSTEM SHALL** no lanzar error — esa variable solo se vuelve requerida en el paso 11.

**Verify**

```bash
pnpm --filter improvement test tests/auth/guard.test.ts
pnpm --filter improvement typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: auth, rls y guard de tenencia"
git tag step-04-auth-rls
```

### `E1-T5` — Provisión de organización desde apps/admin

**Depends on:** `E1-T4` · **Priority:** p0

`apps/admin/lib/db.js`: cliente `@jotapuntoce/db` instanciado con `SUPABASE_SERVICE_ROLE_KEY`
(bypasea RLS, uso exclusivo del servidor). `apps/admin/app/prospects/actions.js`: server action
`provisionOrganization(prospectId)` — en una transacción: crea `organization`, crea el usuario dueño
vía `auth.admin.createUser`, inserta `membership(role='owner')`, inserta la primera
`org_build_stage`, actualiza `prospect_company.status = 'en_construcción'` y `org_id`. Idempotente:
si el prospecto ya tiene `org_id`, no crea un segundo org.

**Files**
- `apps/admin/lib/db.js` — nuevo
- `apps/admin/app/prospects/actions.js` — nuevo
- `apps/admin/tests/provisioning.test.js` — nuevo

**Acceptance**

1. **WHEN** `provisionOrganization` corre sobre un prospecto sin `org_id` **THE SYSTEM SHALL** crear
   exactamente un `organization`, un `membership(role='owner')` y una `org_build_stage`.
2. **WHEN** `provisionOrganization` corre dos veces seguidas sobre el mismo prospecto
   **THE SYSTEM SHALL** dejar exactamente un `organization` — la segunda llamada no crea un
   duplicado.
3. **WHEN** se busca `SUPABASE_SERVICE_ROLE_KEY` con grep en cualquier archivo bajo
   `apps/admin/components/` o cualquier archivo con `"use client"` en su primera línea
   **THE SYSTEM SHALL** encontrar cero coincidencias.

**Verify**

```bash
pnpm --filter @jotapuntoce/admin test tests/provisioning.test.js
n=$(grep -rl '"use client"' apps/admin/components apps/admin/app 2>/dev/null | xargs -r grep -l "SUPABASE_SERVICE_ROLE_KEY" | wc -l); test "$n" = 0
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: provision de organizacion desde apps/admin"
git tag step-05-provisioning
```

### `E1-T6` — Areas + Objetivos + motor de puntos

**Depends on:** `E1-T4` · **Priority:** p0

`apps/improvement/server/objectives/points.ts`: constante `POINTS_PER_WEIGHT_POINT = 10` (única
definición en todo el repo) y `pointsForObjective(impactWeight)`.
`apps/improvement/server/objectives/mutations.ts`: `completeObjective(objectiveId)` — transacción
que marca `status='completed'`, `completed_at=now()`, e inserta una fila en
`employee_points_ledger`. `apps/improvement/app/[org]/objetivos/page.tsx`: CRUD server-rendered con
Server Actions, paginación cursor-based.

**Files**
- `apps/improvement/server/objectives/points.ts` — nuevo
- `apps/improvement/server/objectives/mutations.ts` — nuevo
- `apps/improvement/app/[org]/objetivos/page.tsx` — nuevo
- `apps/improvement/tests/objectives.test.ts` — nuevo

**Acceptance**

1. **WHEN** un owner completa un objetivo con `impact_weight = 40` **THE SYSTEM SHALL** insertar
   exactamente una fila en `employee_points_ledger` con `points = 400`.
2. **WHEN** el mismo objetivo se intenta completar una segunda vez **THE SYSTEM SHALL** rechazar la
   mutación (ya está `completed`) y no insertar una segunda fila en el ledger.
3. **WHEN** un empleado del org A solicita la lista de objetivos del org B **THE SYSTEM SHALL**
   devolver 404, verificado con una prueba automatizada de aislamiento.
4. **WHEN** se piden más de 100 objetivos por página **THE SYSTEM SHALL** limitar la respuesta a
   100.

**Verify**

```bash
pnpm --filter improvement test tests/objectives.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T6: areas, objetivos y motor de puntos"
git tag step-06-objectives-points
```

---

## Epic acceptance

La épica está hecha cuando cada tarea está `done` en `tasks.json` **y**:

1. **WHEN** `pnpm build` corre desde la raíz **THE SYSTEM SHALL** construir ambas apps con exit 0.
2. **WHEN** un usuario sin sesión visita cualquier ruta `/[org]/*` de `apps/improvement`
   **THE SYSTEM SHALL** redirigir a `/login`, y un owner puede completar el ciclo
   crear área → crear objetivo → completarlo → ver el ledger de puntos actualizado, de punta a
   punta.

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Corridos desde la raíz del proyecto. Ambos criterios son decidibles por estos comandos más los
`Verify` individuales de cada tarea.

## Pitfalls

- **Mover `node_modules/` junto con el resto de `jotapuntoce-admin/`.** Infla el repo y arrastra
  binarios nativos compilados para la máquina equivocada. `pnpm install` los regenera correctamente.
- **Dejar `apps/admin/eslint.config.mjs` vivo "por si acaso".** Rompe la premisa de un solo config
  raíz y produce reglas duplicadas o contradictorias.
- **Redefinir un token en `apps/improvement/app/globals.css` en vez de importar el compartido.**
  Rompe la fuente única que el grep de `E1-T2` verifica.
- **RLS agregada en una migración separada de la tabla que protege, sin agruparlas conceptualmente.**
  Sigue el patrón de `E1-T4`: la política vive en su propia migración custom, pero se aplica en el
  mismo commit que la tabla que protege — nunca queda una tabla org-scoped sin política ni un solo
  minuto.

## Before moving on

- [ ] Cada tarea de esta épica está `done` en `tasks.json` — ninguna quedó `in_progress`.
- [ ] Cada comando `verify` de cada tarea pasó, no solo el primero.
- [ ] Ningún `verify` fue editado, y ninguno se saltó porque un archivo que nombra no existía.
- [ ] **Cada tarea tiene su tag de checkpoint en control de versiones** — `git tag -l 'step-0[1-6]-*'`
      lista 6.
- [ ] El comando de gate pasa limpio, corrido desde la raíz del proyecto.
- [ ] Cada contrato "Produced" de arriba existe con la firma indicada.
- [ ] Ningún archivo fuera del subárbol de esta épica fue modificado.
- [ ] `.env.example` sigue reflejando cada variable que esta épica activó (ya estaba completo desde
      el bundle — confirmar que nada se agregó sin documentar).
- [ ] Un commit por tarea, cada uno prefijado con su id de tarea, cada uno seguido de su tag de
      checkpoint.
