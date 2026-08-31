# Epic 03: Experiencia y lanzamiento

> Tras esta épica la empresa se ve como un gemelo digital de verdad — escena 3D procedural, Mapa de
> Construcción, el puente completo en `apps/admin` — y el proyecto entero está observable y
> desplegado en producción.

| | |
|---|---|
| **Epic id** | `03-experiencia-y-lanzamiento` |
| **Tasks** | `E3-T1` … `E3-T5` |
| **Depends on** | `01-fundacion`, `02-producto-core` |
| **Unlocks** | nada — es la última épica |
| **Parallel with** | `E3-T1` y `E3-T2` no comparten archivos y pueden avanzar en paralelo; `E3-T4` tampoco comparte archivos con ninguna de las dos. `E3-T3` y `E3-T5` son secuenciales al resto |

No necesitas ningún otro archivo para completar esta épica. Todo lo de abajo se repite aquí a
propósito.

---

## Stack

Next.js 16, TypeScript 6, `@react-three/fiber` 9.7.0 + `@react-three/drei` 10.7.8 + `three` 0.185.1
(peer `react >=19 <19.3` — ya fijado exacto en `01-fundacion`), Vitest, Vercel + GitHub Actions.

| Task | Command |
|---|---|
| Test (un archivo) | `pnpm --filter improvement test tests/{archivo}.test.ts` |
| Test — admin | `pnpm --filter @jotapuntoce/admin test tests/{archivo}.test.js` |
| Build completo | `pnpm build` |
| Smoke de despliegue | `curl -sf "$PRODUCTION_URL/api/health"` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea aquí como
hecha; `E3-T5` además exige `pnpm build` limpio y el health check de producción.

## Directory subtree

```
apps/improvement/
  server/scene/
    sceneGraph.ts                  # NUEVO — E3-T1, función pura
    buildMap.ts                    # NUEVO — E3-T2
  app/[org]/
    dashboard/Scene3D.tsx          # NUEVO — E3-T1, "use client"
    mapa/page.tsx                  # NUEVO — E3-T2
  lib/logger.ts                    # NUEVO — E3-T4
  app/api/health/route.ts          # NUEVO — E3-T4
  package.json                     # EDITADO — E3-T4 (pnpm add -D @axe-core/playwright)
  tests/
    scene-graph.test.ts            # NUEVO — E3-T1
    build-map.test.ts              # NUEVO — E3-T2
    health.test.ts                 # NUEVO — E3-T4
    e2e/a11y.spec.ts               # NUEVO — E3-T4
apps/admin/
  app/improvement/page.js          # REEMPLAZADO por completo — E3-T3
  app/organizations/[orgId]/page.js   # NUEVO — E3-T3
  app/prospects/page.js               # NUEVO — E3-T3
  tests/prospects.test.js             # NUEVO — E3-T3
.github/workflows/ci.yml           # NUEVO — E3-T5
```

Todo lo fuera de este subárbol está fuera de alcance para esta épica.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `area`, `objective`, `profile` | solo lectura, para armar el grafo de la escena 3D | ya definidas en `01-fundacion` |
| `org_build_stage` | lectura (mapa de solo lectura), escritura (CRUD exclusivo de `apps/admin`) | |
| `organization`, `membership`, `prospect_company` | lectura/escritura desde `apps/admin` | `prospect_company` no es org-scoped, solo accesible con service role |

## Contracts

**Consumed** — ya existe, no lo reconstruyas:

| From | Interface | Guarantee |
|---|---|---|
| `01-fundacion` | `requireOrgMembership(orgId)` | 404 si no hay membresía |
| `01-fundacion` | `pointsForObjective`, esquema de `objective` | usado para derivar el estado `alerta` de un avatar |
| `02-producto-core` | `responsibilityLevel` | opcional, si la escena decide colorear un avatar por nivel agregado (no expuesto por persona al owner) |
| `01-fundacion` | `provisionOrganization` (paso 5) | reutilizada tal cual desde el backlog de prospectos, no reimplementada |

**Produced** — nada aguas abajo depende de esta épica; es la última.

## Conventions that bite in this area

- `Scene3D.tsx` recibe el grafo ya calculado como props serializadas — nunca abre su propia
  conexión a datos ni importa `packages/db` directamente (viola el boundary de `CLAUDE.md`).
- Si `<Canvas>` no logra un contexto WebGL, cae a `SceneListFallback` — no a una pantalla en blanco.
  Es también el camino accesible para lectores de pantalla (blueprint §15), no solo un respaldo
  técnico.
- El Mapa de Construcción es de solo lectura para `apps/improvement` — ninguna mutación sobre
  `org_build_stage` existe fuera de `apps/admin`.
- El catálogo de productos sobre `localStorage` que `apps/admin/app/improvement/page.js` tenía antes
  de esta épica **se descarta por completo** — no se migra ningún dato de ahí.

Reglas completas del proyecto: `CLAUDE.md`. Reglas de área: `.claude/rules/{name}.md`.

---

## Tasks

Listadas en el mismo orden que `tasks.json`.

### `E3-T1` — Escena 3D procedural

**Depends on:** `E1-T6`, `E2-T1` · **Priority:** p1

`apps/improvement/server/scene/sceneGraph.ts`: función pura `buildSceneGraph(areas, employees)` →
`{ zones, avatars }` — una zona por área (color = `area.color`), un avatar por empleado con estado
derivado (`activo`/`alerta`/`ok`), formas procedurales simples, sin arte custom. Exporta también
`shouldAutoRotate(prefersReducedMotion): boolean` (`!prefersReducedMotion`) — función pura, testeable
sin montar nada. `apps/improvement/app/[org]/dashboard/Scene3D.tsx` (`"use client"`): monta `<Canvas>`
de `@react-three/fiber` con el grafo como props, pasa `autoRotate={shouldAutoRotate(...)}` a los
controles de cámara. Fallback `SceneListFallback` si no hay WebGL.

**Files**
- `apps/improvement/server/scene/sceneGraph.ts` — nuevo
- `apps/improvement/app/[org]/dashboard/Scene3D.tsx` — nuevo
- `apps/improvement/tests/scene-graph.test.ts` — nuevo

**Acceptance**

1. **WHEN** `buildSceneGraph` recibe 3 áreas y 5 empleados **THE SYSTEM SHALL** devolver
   `zones.length === 3` y `avatars.length === 5`.
2. **WHEN** un empleado tiene al menos un objetivo con `due_date` pasado y `status != 'completed'`
   **THE SYSTEM SHALL** marcar su avatar con estado `alerta`.
3. **WHEN** `shouldAutoRotate(true)` se llama **THE SYSTEM SHALL** devolver `false` — verificado
   llamando la función pura directamente (sin DOM, sin `Canvas`, sin jsdom).

**Verify**

```bash
pnpm --filter improvement test tests/scene-graph.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T1: escena 3d procedural"
git tag step-12-scene-3d
```

### `E3-T2` — Mapa de Construcción de solo lectura

**Depends on:** `E1-T4` · **Priority:** p1

`apps/improvement/server/scene/buildMap.ts`: `getBuildMap(orgId)` — `org_build_stage` ordenado por
`stage_order` con el índice de la etapa "actual". `apps/improvement/app/[org]/mapa/page.tsx`: mapa
de niveles con casillas bloqueadas/en progreso/completadas y marcador "estás aquí", sin controles de
escritura.

**Files**
- `apps/improvement/server/scene/buildMap.ts` — nuevo
- `apps/improvement/app/[org]/mapa/page.tsx` — nuevo
- `apps/improvement/tests/build-map.test.ts` — nuevo

**Acceptance**

1. **WHEN** un owner intenta llamar a cualquier mutación sobre `org_build_stage` desde
   `apps/improvement` (no existe ese Server Action) **THE SYSTEM SHALL** no ofrecer ningún control
   de escritura en el HTML servido de `/[org]/mapa` — verificado buscando que la página no contenga
   ningún `<form>` ni botón con `onClick` que mute `org_build_stage`.
2. **WHEN** las etapas se listan **THE SYSTEM SHALL** respetar `stage_order` ascendente.
3. **WHEN** ninguna etapa está `en_progreso` y la última está `completada` **THE SYSTEM SHALL**
   marcar esa última como la etapa actual.

**Verify**

```bash
pnpm --filter improvement test tests/build-map.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T2: mapa de construccion de solo lectura"
git tag step-13-build-map
```

### `E3-T3` — Puente Cuentas Improvement y backlog de prospectos

**Depends on:** `E1-T5`, `E3-T2` · **Priority:** p0

`apps/admin/app/improvement/page.js`: **reemplaza por completo** el catálogo de productos sobre
`localStorage` por la vista "Cuentas Improvement" — lista de `organization` con conteo de miembros y
etapa actual del Mapa de Construcción. `apps/admin/app/organizations/[orgId]/page.js`: detalle de un
org, gestión de `org_build_stage` (CRUD) y vista de solo lectura de áreas/objetivos.
`apps/admin/app/prospects/page.js`: backlog (prospecto → en_construcción → live) que dispara
`provisionOrganization` (de `E1-T5`) al mover una tarjeta a "en_construcción".

**Files**
- `apps/admin/app/improvement/page.js` — reemplazado
- `apps/admin/app/organizations/[orgId]/page.js` — nuevo
- `apps/admin/app/prospects/page.js` — nuevo
- `apps/admin/tests/prospects.test.js` — nuevo

**Acceptance**

1. **WHEN** se visita `/improvement` en `apps/admin` **THE SYSTEM SHALL** renderizar la lista de
   organizaciones reales (no el catálogo de productos anterior) — verificado buscando que
   `lib/storage.js` ya no se importe desde `app/improvement/page.js`.
2. **WHEN** se marca un prospecto como `en_construcción` desde el backlog **THE SYSTEM SHALL**
   provisionar exactamente un `organization` nuevo (reutiliza `E1-T5`, idempotente).
3. **WHEN** Jose Carlos agrega una `org_build_stage` a un org desde `apps/admin`
   **THE SYSTEM SHALL** hacerla visible de inmediato en el Mapa de Construcción de solo lectura de
   `apps/improvement` (misma tabla, sin caché intermedia).

**Verify**

```bash
pnpm --filter @jotapuntoce/admin test tests/prospects.test.js
! grep -q "lib/storage" apps/admin/app/improvement/page.js
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T3: puente cuentas improvement y backlog de prospectos"
git tag step-14-admin-bridge
```

### `E3-T4` — Observabilidad + accesibilidad E2E

**Depends on:** `E1-T4`, `E1-T6`, `E2-T3`, `E3-T1`, `E3-T2` · **Priority:** p0

`apps/improvement/lib/logger.ts`: logger JSON propio sin dependencia externa — `log(event, fields)`
imprime `{ timestamp, level, event, request_id, ...fields }`, con lista de redacción centralizada
(`token`, `password`, `service_role_key`, `api_key`). `apps/improvement/app/api/health/route.ts`:
`GET`, verifica conectividad real a `DATABASE_URL`, responde `{ ok, db, buildSha }`.

También autora el único spec E2E del proyecto — primer punto del build order donde ya existen todas
las rutas que recorre (login de `E1-T4`, objetivos de `E1-T6`, escena/dashboard de `E3-T1`, mapa de
`E3-T2`): `pnpm add -D @axe-core/playwright@^4.13.0` en `apps/improvement` (pin verificado en vivo
esta sesión, blueprint.md §11 — único peer `playwright-core >=1.0.0`, ya satisfecho), luego
`pnpm exec playwright install --with-deps chromium`, luego `apps/improvement/tests/e2e/a11y.spec.ts`:
para cada ruta en `["/login", "/[org]/dashboard", "/[org]/objetivos", "/[org]/mapa"]`, navega con
Playwright y corre `new AxeBuilder({ page }).analyze()`, asertando cero violaciones `serious`/`critical`.
`/[org]/dashboard` se visita con `SceneListFallback` forzado — axe-core no audita el `<canvas>` WebGL.

**Files**
- `apps/improvement/lib/logger.ts` — nuevo
- `apps/improvement/app/api/health/route.ts` — nuevo
- `apps/improvement/tests/health.test.ts` — nuevo
- `apps/improvement/tests/e2e/a11y.spec.ts` — nuevo

**Acceptance**

1. **WHEN** se detiene la conectividad a la base de datos (simulado en el test con un cliente que
   lanza) **THE SYSTEM SHALL** responder `/api/health` con status distinto de 200.
2. **WHEN** se registra un evento con un campo `token` **THE SYSTEM SHALL** imprimir
   `"[redacted]"` en vez del valor real.
3. **WHEN** dos líneas de log se generan dentro de la misma request **THE SYSTEM SHALL** compartir
   el mismo `request_id`.
4. **WHEN** `a11y.spec.ts` corre contra `/login`, `/[org]/dashboard` (con `SceneListFallback`),
   `/[org]/objetivos` y `/[org]/mapa` **THE SYSTEM SHALL** reportar cero violaciones de axe-core con
   impacto `serious` o `critical` en cada una.

**Verify**

```bash
pnpm --filter improvement test tests/health.test.ts
pnpm --filter improvement test:e2e tests/e2e/a11y.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T4: observabilidad y accesibilidad E2E"
git tag step-15-observability
```

### `E3-T5` — Despliegue en Vercel + CI

**Depends on:** `E2-T2`, `E2-T5`, `E3-T1`, `E3-T3`, `E3-T4` · **Priority:** p0

Dos proyectos Vercel desde el mismo repositorio (Root Directory = `apps/admin` / `apps/improvement`).
Variables de entorno de blueprint.md §10 configuradas en cada proyecto (incluye `PRODUCTION_URL` y
`ADMIN_PRODUCTION_URL`, conocidas solo tras el primer deploy). `apps/improvement/vercel.json` ya
existe (autorado en `E2-T3`) — este paso solo lo actualiza si cambia el "Root Directory" inferido,
nunca lo crea. Migraciones como paso explícito de release (`pnpm db:migrate` contra
`DATABASE_URL_DIRECT`), nunca en el arranque. `.github/workflows/ci.yml` (Tier 1): PR corre
lint+typecheck+test; `main` además corre build.

**Files**
- `.github/workflows/ci.yml` — nuevo

**Acceptance**

1. **WHEN** se hace push a `main` **THE SYSTEM SHALL** desplegar ambos proyectos Vercel
   automáticamente tras pasar el pipeline de CI.
2. **WHEN** el health check de producción de `apps/improvement` se consulta tras un deploy
   **THE SYSTEM SHALL** responder 200 con `db: "up"`.
3. **WHEN** `apps/admin` desplegado se consulta en su raíz **THE SYSTEM SHALL** responder 200.
4. **WHEN** el cron de recordatorios se dispara desde el dashboard de Vercel contra la URL de
   producción sin el header `Authorization` **THE SYSTEM SHALL** responder 401.

**Verify**

```bash
curl -sf "$PRODUCTION_URL/api/health"
test "$(curl -s -o /dev/null -w '%{http_code}' "$ADMIN_PRODUCTION_URL")" = 200
test "$(curl -s -o /dev/null -w '%{http_code}' "$PRODUCTION_URL/api/cron/reminders")" = 401
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T5: despliegue en vercel + ci"
git tag step-16-deploy
```

---

## Epic acceptance

La épica está hecha cuando cada tarea está `done` en `tasks.json` **y**:

1. **WHEN** un dueño visita su dashboard en producción **THE SYSTEM SHALL** ver la escena 3D (o su
   fallback de lista) y el Mapa de Construcción reflejando datos reales del org, sin error.
2. **WHEN** el pipeline completo de CI corre sobre `main` **THE SYSTEM SHALL** desplegar ambas apps
   y el health check de producción responde 200.

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Pitfalls

- **El cron de recordatorios configurado como `POST` en `vercel.json`.** Vercel Cron siempre invoca
  `GET` — un handler `POST`-only devuelve 405 en cada disparo y el dashboard de Vercel lo muestra
  como "ejecutado" igual, sin que nadie note que nunca corrió.
- **Migrar datos del catálogo `localStorage` "por si acaso alguien lo usó".** El blueprint lo marca
  explícitamente como descartable — no hay dato de negocio real ahí, es un placeholder.
- **La escena 3D bloqueando el primer paint del dashboard.** El servidor arma el grafo y lo pasa
  como props; el `<Canvas>` se monta después, nunca antes de que el shell server-renderizado ya esté
  visible.

## Before moving on

- [ ] Cada tarea de esta épica está `done` en `tasks.json` — ninguna quedó `in_progress`.
- [ ] Cada comando `verify` de cada tarea pasó, no solo el primero.
- [ ] Ningún `verify` fue editado ni se saltó.
- [ ] **Cada tarea tiene su tag de checkpoint** — `git tag -l 'step-1[2-6]-*'` lista 5.
- [ ] El comando de gate pasa limpio, corrido desde la raíz del proyecto, y el health check de
      producción responde 200.
- [ ] Ningún archivo fuera del subárbol de esta épica fue modificado.
- [ ] `.env.example` sigue completo — ninguna variable nueva quedó sin documentar.
- [ ] Un commit por tarea, cada uno prefijado con su id de tarea, cada uno seguido de su tag de
      checkpoint.
