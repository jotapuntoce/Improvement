# Epic 01: Base — variables, catálogo de giros y tema por org

> Al terminar, el cambio tiene sus variables declaradas y opcionales (seis nuevas en `.env.example`; `STRIPE_SECRET_KEY` ya existía para Summum y ahora también la declara Improvement), el catálogo de giros crece de 8 a 30 con categoría, base y plantilla de áreas, cada org puede tener su propio tema (aplicado solo si pasa AA) y el dueño lo edita en `/[org]/marca`.

| | |
|---|---|
| **Epic id** | `01-base` |
| **Tasks** | `E1-T1` … `E1-T5` |
| **Depends on** | nothing — start here (después del Bootstrap de §10) |
| **Unlocks** | `02-oficina`, `05-agenda` (pasos 32-33 dependen solo del paso 1) |
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
CLAUDE.md, AGENTS.md, .claude/settings.json        # fusionados y commiteados por el Bootstrap — read-only
.claude/rules/oficinas-digitales.md                # NUEVO (Bootstrap) — read-only
.env.example                                       # exists — extend it with the guarded printf of E1-T1 (never Read it)
turbo.json                                         # exists, you will edit it (E1-T1: globalEnv)
apps/improvement/
  lib/env.ts                                       # exists, you will edit it (E1-T1)
  server/companies/theme.ts                        # NEW (E1-T4)
  server/companies/mutations.ts                    # exists, read-only (updateCompanyIndustry)
  server/auth/guard.ts                             # exists, read-only
  app/[org]/layout.tsx                             # exists, you will edit it (E1-T4: wrapper con el tema)
  app/[org]/marca/page.tsx                         # NEW (E1-T5)
  tests/env-oficinas.test.ts, industries.test.ts,
        tema-schema.test.ts, theme.test.ts         # NEW
  tests/building-graph.test.ts                     # exists, read-only (ahora recorre 30 giros)
  tests/e2e/marca.spec.ts                          # NEW (E1-T5)
packages/ui/
  package.json                                     # exists, you will edit it (E1-T4: export ./theme.ts)
  src/theme.ts                                     # NEW (E1-T4) — puro, sin dependencias
  src/building/industries.ts, palettes.ts,
               shapes.ts, AppIconLarge.tsx         # exist, you will edit them (E1-T2)
packages/db/
  src/schema.ts                                    # exists, you will edit it (E1-T3)
  migrations/                                      # lo que emite db:generate (sin --custom en este epic)
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not listed
here, stop and report — it means the epic boundary is wrong. `apps/admin` tiene su propia copia de los 8
giros y **no se toca**; `app/empresas/configuracion/page.tsx` tampoco.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `organization` (existente) | + `theme` jsonb null, + `industry_custom` text null (1-80) | `industry` sigue siendo text; ahora acepta los 30 ids de `isIndustry` |
| `ai_suggestion` (existente) | check `category` + `oficina`, `agente` | Las usan los epics 02 y 03 |

Este epic no agrega tablas, así que no hay migración `--custom`: las dos columnas viven en tablas que ya
tienen RLS.

Este epic no agrega políticas RLS.

## Catálogo de giros (copia de blueprint.md §4)

Los 8 giros existentes conservan id, etiqueta y orden (interfaz congelada) y su `base` es su propio id;
los 22 nuevos van después, en el orden de esta tabla. Las áreas son la plantilla, en orden; ninguna se
llama "Dirección", "Sala de juntas" ni "Recepción" (son zonas fijas de la oficina). `otro` no tiene
plantilla: la IA propone las áreas desde las fotos y `organization.industry_custom`.

| # | id | Etiqueta | `category` | `base` | `areas` |
|---|---|---|---|---|---|
| 1 | `restaurante` | (actual) | `servicios` | `restaurante` | Cocina, Piso, Caja, Compras |
| 2 | `retail` | (actual) | `comerciales` | `retail` | Ventas, Almacén, Caja, Compras |
| 3 | `servicios` | (actual) | `servicios` | `servicios` | Atención a clientes, Operación, Ventas, Administración |
| 4 | `salud` | (actual) | `servicios` | `salud` | Consultorios, Enfermería, Farmacia, Administración |
| 5 | `construccion` | (actual) | `industriales` | `construccion` | Obra, Proyectos, Compras, Administración |
| 6 | `tecnologia` | (actual) | `tecnologicos` | `tecnologia` | Producto, Desarrollo, Soporte, Ventas |
| 7 | `manufactura` | (actual) | `industriales` | `manufactura` | Producción, Calidad, Almacén, Compras, Mantenimiento |
| 8 | `otro` | (actual) | `otro` | `otro` | — (sin plantilla) |
| 9 | `extractivos` | Extractivos (minería, pesca, agro) | `industriales` | `manufactura` | Extracción, Seguridad, Mantenimiento, Logística, Administración |
| 10 | `manufactura_consumo` | Manufactura de bienes de consumo | `industriales` | `manufactura` | Producción, Calidad, Almacén, Ventas, Compras |
| 11 | `manufactura_produccion` | Manufactura de bienes de producción | `industriales` | `manufactura` | Producción, Ingeniería, Calidad, Almacén, Compras |
| 12 | `desarrolladora` | Desarrolladora inmobiliaria | `industriales` | `construccion` | Proyectos, Obra, Ventas, Trámites, Administración |
| 13 | `mayoristas` | Mayoristas y distribuidores | `comerciales` | `retail` | Ventas, Almacén, Logística, Compras, Cobranza |
| 14 | `comisionistas` | Comisionistas y representantes | `comerciales` | `retail` | Ventas, Atención a clientes, Administración |
| 15 | `inmobiliaria` | Inmobiliaria (corretaje) | `comerciales` | `retail` | Captación, Ventas, Rentas, Administración |
| 16 | `horeca` | Hoteles, restaurantes y cafeterías (HORECA) | `servicios` | `restaurante` | Cocina, Piso, Barra, Caja, Compras |
| 17 | `financieros` | Servicios financieros | `servicios` | `servicios` | Asesoría, Crédito, Cobranza, Cumplimiento, Administración |
| 18 | `educacion` | Educación | `servicios` | `servicios` | Académico, Control escolar, Admisiones, Administración |
| 19 | `logistica` | Logística y transporte | `servicios` | `servicios` | Operaciones, Flota, Almacén, Atención a clientes, Administración |
| 20 | `mantenimiento` | Mantenimiento e instalaciones | `servicios` | `servicios` | Servicio en campo, Programación, Almacén, Ventas |
| 21 | `wedding_planner` | Wedding planner y eventos | `servicios` | `servicios` | Ventas, Planeación, Proveedores, Producción del evento |
| 22 | `clinica` | Clínica | `servicios` | `salud` | Consultorios, Enfermería, Laboratorio, Farmacia, Administración |
| 23 | `hotel` | Hotel | `servicios` | `servicios` | Reservaciones, Ama de llaves, Alimentos y bebidas, Mantenimiento, Administración |
| 24 | `despacho` | Despacho profesional (legal, contable) | `servicios` | `servicios` | Atención a clientes, Expedientes, Cumplimiento, Administración |
| 25 | `taller` | Taller (automotriz, mecánico) | `servicios` | `manufactura` | Servicio, Refacciones, Atención a clientes, Caja |
| 26 | `software_saas` | Software y SaaS | `tecnologicos` | `tecnologia` | Producto, Desarrollo, Soporte, Ventas, Marketing |
| 27 | `infraestructura_ti` | Infraestructura y servicios de TI | `tecnologicos` | `tecnologia` | Proyectos, Soporte, Redes, Ventas |
| 28 | `economia_colaborativa` | Economía colaborativa (plataformas) | `tecnologicos` | `tecnologia` | Operaciones, Comunidad, Soporte, Producto |
| 29 | `entretenimiento_digital` | Entretenimiento digital | `tecnologicos` | `tecnologia` | Contenido, Producción, Comunidad, Comercial |
| 30 | `fintech` | Fintech | `tecnologicos` | `tecnologia` | Producto, Riesgo, Cumplimiento, Soporte, Desarrollo |

"(actual)" = la etiqueta que el giro ya tiene hoy en `industries.ts`, sin cambio.

## Tema por org (copia de blueprint.md §7)

`organization.theme` = `{ bg, textPrimary, accent1, accent2 }`, cada uno `#rrggbb`. `null` = los tokens base
de `tokens.css`. El layout de `app/[org]` lo aplica como `style` sobre un `<div>` que envuelve el contenido:

| Campo | CSS var que sobrescribe | Regla |
|---|---|---|
| `bg` | `--bg` | fondo de página |
| `textPrimary` | `--text-primary` | contraste ≥ 4.5 contra `bg` |
| `accent1` | `--accent-1` | contraste ≥ 4.5 contra `bg` |
| `accent2` | `--accent-2` | contraste ≥ 4.5 contra `bg` |

`--bg-card`, `--border`, `--text-muted`, `--danger` y `--success` no cambian por org.

**Contraste (WCAG 2.x).** Por canal sRGB `c = v / 255`, `c ≤ 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`;
`L = 0.2126 R + 0.7152 G + 0.0722 B`; razón `(Lmax + 0.05) / (Lmin + 0.05)`, redondeada a 2 decimales al
reportarla. Valores de referencia, calculados con esa fórmula en Node 24.19.0 (los usa `tests/theme.test.ts`):

| Primer plano | Fondo | Razón | ¿AA (4.5)? |
|---|---|---|---|
| `#777777` | `#ffffff` | 4.48 | no |
| `#767676` | `#ffffff` | 4.54 | sí |
| `#6b7386` | `#05060b` | 4.26 | no |
| `#f4f6fb` | `#05060b` | 18.72 | sí |
| `#1fbe79` | `#05060b` | 8.39 | sí |
| `#98e33b` | `#05060b` | 12.90 | sí |

El "tema verde de Improvement" de las pruebas es `{ bg: "#05060b", textPrimary: "#f4f6fb", accent1: "#1fbe79", accent2: "#98e33b" }`
(pasa AA en los tres campos). La pantalla `/[org]/marca` muestra el error como
`Contraste 4.26:1 — mínimo 4.5:1` (la razón con 2 decimales, sin ceros quitados).

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| repo | `server/auth/guard.ts` → `findMembership`, `findOwnerMembership`, `getSessionUserId`, `requireOrgMembership` | 404 nunca 403 |
| repo | `lib/env.ts` → `env`, `requireEnv(key)` | Todo opcional al importar; `requireEnv` lanza `${key} no está configurada — ver .env.example (blueprint §10)` |
| repo | `packages/ui/src/building/industries.ts` → `INDUSTRIES`, `isIndustry`, `Industry` | Los 8 ids de hoy |
| repo | `server/companies/mutations.ts` → `updateCompanyIndustry(userId, orgId, industry)` | Dueño; valida con `isIndustry` |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `packages/ui/src/building/industries.ts` → `INDUSTRY_CATEGORIES`, `BASE_INDUSTRIES`, `baseIndustry`, `industryAreas` | `baseIndustry(value: string \| null \| undefined): BaseIndustry` · `industryAreas(value): readonly string[]` | `02` (prompt y acomodo) |
| `packages/ui/src/theme.ts` → `OrgTheme`, `contrastRatio`, `themeIssues`, `themeStyle` | `themeIssues(t: OrgTheme): { field; ratio }[]` · `themeStyle(t): Record<string, string>` | `02` (confirmar plano) |
| `server/companies/theme.ts` → `orgThemeSchema`, `setOrgTheme`, `setIndustryCustom`, `loadOrgTheme` | `loadOrgTheme(userId, orgId): Promise<OrgTheme \| null>` | `02` (propuesta), layout |
| `lib/env.ts` | `AGENTS_API_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_SEATS_WEBHOOK_SECRET` opcionales | `03`, `05`, `06` |

## Conventions that bite in this area

- **Dos puertas.** El cliente `db` conecta como dueño de las tablas: RLS **no** corre en el camino de la
  app. La única autorización ahí es el guard + el filtro por org en cada consulta.
- **Import relativo con `.ts` explícito** (`../auth/guard.ts`); `@/` solo en páginas; sin barrels.
- **Resultados tipados:** `{ ok: true, data } | { ok: false, error: { code, message } }`.
- **`packages/ui` no tiene `zod`** y no lo gana: `theme.ts` es puro; el esquema zod vive en el servidor.
- **Interfaz congelada:** los 8 ids de giro, sus etiquetas y su orden; `PALETTES`/`SHAPES` conservan sus 8
  entradas (ahora por `BaseIndustry`).
- **`git add` de rutas con corchetes** (`[org]`) usa `":(literal)…"`, como en los Checkpoints.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/oficinas-digitales.md`,
`.claude/rules/tokens-de-diseno.md`, `.claude/rules/base-de-datos.md`. All sit in the project root.

---

## Tasks

### `E1-T1` — Variables nuevas degradadas por paso

**Depends on:** nada (primera tarea) · **Priority:** p0 · **Step:** 1

El Bootstrap (§10) ya cambió a la rama `oficinas-digitales` (cortada de la punta de `summum-improvement`),
instaló dependencias, fusionó `workspace/` y commiteó el bundle. Antes de tocar nada corre `pnpm lint`,
`pnpm typecheck` y `pnpm test`: si alguno sale distinto de 0, detente y reporta qué paquete falla (puede ser
WIP de `apps/admin/` o `apps/summum/`, que no es de este cambio y no se arregla aquí).

1. `apps/improvement/lib/env.ts`: agrega al `schema`, después de `NEXT_PUBLIC_SUMMUM_URL`, seis campos con la
   misma forma que los existentes (`z.preprocess(emptyToUndefined, z.string().min(1).optional())`) y un
   comentario con el paso que la activa: `AGENTS_API_SECRET` (paso 20), `GOOGLE_OAUTH_CLIENT_ID` y
   `GOOGLE_OAUTH_CLIENT_SECRET` (paso 36), `TOKEN_ENCRYPTION_KEY` (paso 36), `STRIPE_SECRET_KEY` (paso 43),
   `STRIPE_SEATS_WEBHOOK_SECRET` (paso 44). Nada más cambia: `env` y `requireEnv()` quedan iguales.
   `SUPABASE_SERVICE_ROLE_KEY` sigue declarada solo como hoy y nunca se lee.
2. `turbo.json`: agrega al final de `globalEnv`, en este orden, `AGENTS_API_SECRET`, `IMPROVEMENT_API_URL`,
   `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`,
   `STRIPE_SEATS_WEBHOOK_SECRET` (`STRIPE_SECRET_KEY` ya está).
3. `.env.example` — **no lo abras con Read** (`Read(./.env.*)` está en `deny`); se extiende con una línea
   guardada que sale 0 en una segunda corrida:
   ```bash
   grep -q '^AGENTS_API_SECRET=' .env.example || printf '%s\n' '' '# --- Oficinas digitales (blueprints/oficinas-digitales §10) ---' 'AGENTS_API_SECRET=' 'IMPROVEMENT_API_URL=' 'GOOGLE_OAUTH_CLIENT_ID=' 'GOOGLE_OAUTH_CLIENT_SECRET=' 'TOKEN_ENCRYPTION_KEY=' 'STRIPE_SEATS_WEBHOOK_SECRET=' >> .env.example
   ```
4. `apps/improvement/tests/env-oficinas.test.ts`: con `vi.stubEnv` en `""` las seis variables y
   `vi.resetModules()`, importa `@/lib/env.ts` dinámicamente; comprueba que no lanza, que las seis quedan
   `undefined` y que `requireEnv("AGENTS_API_SECRET")` lanza con el nombre en el mensaje. `vi.unstubAllEnvs()`
   en `afterEach`.

**Files**
- `apps/improvement/lib/env.ts`
- `turbo.json`
- `.env.example`
- `apps/improvement/tests/env-oficinas.test.ts`

**Acceptance**
1. **WHEN** `apps/improvement/lib/env.ts` se importa con las seis variables nuevas vacías **THE SYSTEM SHALL** cargar sin lanzar y dejar cada una en `undefined`.
2. **WHEN** `requireEnv("AGENTS_API_SECRET")` corre sin la variable **THE SYSTEM SHALL** lanzar un error cuyo mensaje contiene `AGENTS_API_SECRET no está configurada`.
3. **WHEN** se lee `.env.example` **THE SYSTEM SHALL** contener `TOKEN_ENCRYPTION_KEY=` y `STRIPE_SEATS_WEBHOOK_SECRET=` sin valor, y **WHEN** se lee `turbo.json` **THE SYSTEM SHALL** listar `AGENTS_API_SECRET` e `IMPROVEMENT_API_URL` en `globalEnv`.

**Verify**
```bash
grep -qx 'TOKEN_ENCRYPTION_KEY=' .env.example
grep -qx 'STRIPE_SEATS_WEBHOOK_SECRET=' .env.example
grep -q '"AGENTS_API_SECRET"' turbo.json
grep -q '"IMPROVEMENT_API_URL"' turbo.json
pnpm --filter improvement test tests/env-oficinas.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- apps/improvement/lib/env.ts turbo.json .env.example apps/improvement/tests/env-oficinas.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E1-T1 (step 1): variables de oficinas digitales, opcionales hasta su paso"
git tag step-01-od-entorno
git ls-files --error-unmatch apps/improvement/tests/env-oficinas.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E1-T2` — Catálogo de giros con categoría, base y plantilla de áreas

**Depends on:** `E1-T1` · **Priority:** p0 · **Step:** 2

Crecimiento **aditivo**: los 8 ids y sus etiquetas actuales no cambian, ni su orden (son interfaz congelada,
§5). `apps/admin` tiene su propia copia JS de los 8 giros y no se toca.

1. `packages/ui/src/building/industries.ts`:
   - `INDUSTRY_CATEGORIES = [{ id: "industriales", label: "Industriales" }, { id: "comerciales", label: "Comerciales" }, { id: "servicios", label: "Servicios" }, { id: "tecnologicos", label: "Tecnológicos" }, { id: "otro", label: "Otro" }] as const`.
   - `BASE_INDUSTRIES = ["restaurante", "retail", "servicios", "salud", "construccion", "tecnologia", "manufactura", "otro"] as const` y `type BaseIndustry`.
   - Cada entrada de `INDUSTRIES` gana `category`, `base` y `areas` (plantilla de áreas, en orden). Los 8
     existentes, en su orden, con `base` igual a su propio id; después los 22 nuevos, exactamente la tabla
     de §4 *Catálogo de giros* (id, etiqueta, categoría, base, áreas). `otro` lleva `areas: []` — para él la
     IA propone las áreas (paso 9) y el giro libre vive en `organization.industry_custom` (paso 3).
   - `baseIndustry(value: string | null | undefined): BaseIndustry` — la `base` del giro, `"otro"` si no
     existe. `isIndustry` sigue igual (ahora acepta los 30 ids). `industryAreas(value)` devuelve la
     plantilla (`[]` si no existe).
2. `palettes.ts` y `shapes.ts`: `PALETTES`/`SHAPES` pasan a `Record<BaseIndustry, …>` con las mismas 8
   entradas y se indexan con `baseIndustry(industry)`. Ningún token nuevo en `tokens.css`.
3. `AppIconLarge.tsx`: `IndustryGlyph` hace `switch (baseIndustry(industry))` — un giro nuevo dibuja el glyph
   de su base.
4. `apps/improvement/tests/industries.test.ts`: los 8 primeros ids y etiquetas exactamente como hoy; ids
   únicos; cada `base` está en `BASE_INDUSTRIES`; `buildingShape("clinica")` igual a `buildingShape("salud")`;
   `isIndustry("wedding_planner")` es `true`; ninguna plantilla pasa de 12 áreas.
   `tests/building-graph.test.ts` ya recorre `INDUSTRIES` y ahora cubre los 30 sin cambios.

**Files**
- `packages/ui/src/building/industries.ts`
- `packages/ui/src/building/palettes.ts`
- `packages/ui/src/building/shapes.ts`
- `packages/ui/src/building/AppIconLarge.tsx`
- `apps/improvement/tests/industries.test.ts`

**Acceptance**
1. **WHEN** se lee `INDUSTRIES` **THE SYSTEM SHALL** empezar con los 8 ids `restaurante`, `retail`, `servicios`, `salud`, `construccion`, `tecnologia`, `manufactura`, `otro` con sus etiquetas actuales y en ese orden.
2. **WHEN** `isIndustry` recibe `wedding_planner`, `clinica`, `hotel`, `despacho`, `taller`, `inmobiliaria` o `desarrolladora` **THE SYSTEM SHALL** devolver `true` para cada uno.
3. **WHEN** `buildingShape("clinica")` y `buildingPalette("clinica")` corren **THE SYSTEM SHALL** devolver la forma y la paleta de `salud`, su base.
4. **WHEN** se recorre `INDUSTRIES` **THE SYSTEM SHALL** tener ids únicos, una `category` de `INDUSTRY_CATEGORIES` y a lo más 12 áreas en cada plantilla.

**Verify**
```bash
pnpm --filter improvement test tests/industries.test.ts
pnpm --filter improvement test tests/building-graph.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/ui/src/building/industries.ts packages/ui/src/building/palettes.ts packages/ui/src/building/shapes.ts packages/ui/src/building/AppIconLarge.tsx apps/improvement/tests/industries.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E1-T2 (step 2): catálogo de giros aditivo con categoría y plantilla de áreas"
git tag step-02-od-giros
git ls-files --error-unmatch apps/improvement/tests/industries.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E1-T3` — Esquema de tema por org, giro libre y categorías de IA nuevas

**Depends on:** `E1-T2` · **Priority:** p0 · **Step:** 3

Solo columnas sobre tablas que ya tienen RLS: no hay migración `--custom` en este paso.

1. `packages/db/src/schema.ts`:
   - `organization`, después de `industry`: `theme` (`jsonb("theme")`, nullable — `null` = tokens base) e
     `industryCustom` (`text("industry_custom")`, nullable) con check `organization_industry_custom_length`
     (`industry_custom is null or char_length(industry_custom) between 1 and 80`).
   - `ai_suggestion_category_check` pasa a
     `in ('upgrade','servicio_cliente','siguiente_movimiento','oficina','agente')`.
2. `pnpm db:generate` — el nombre del archivo lo pone `drizzle-kit` y no se edita.
3. `apps/improvement/tests/tema-schema.test.ts`: inserta un org con `theme` `{"bg":"#05060b","textPrimary":"#f4f6fb","accent1":"#1fbe79","accent2":"#98e33b"}` y lo lee de vuelta igual; un org sin `theme` lo lee `null`; `industry_custom` de 81 caracteres se rechaza; un `ai_suggestion` con `category` `oficina` y otro con `agente` se aceptan y `inventada` se rechaza. Cada prueba borra su org en `afterEach`.
4. **Aprobación obligatoria.** Muestra a Jose Carlos el SQL nuevo y pide en el chat un "sí" explícito para
   aplicarlo al Supabase compartido (`pnpm db:migrate` está en `permissions.ask`). Sin "sí", detente y reporta.
5. `pnpm db:migrate`.

**Files**
- `packages/db/src/schema.ts`
- `packages/db/migrations/**`
- `apps/improvement/tests/tema-schema.test.ts`

**Acceptance**
1. **WHEN** se inserta un `organization` con `theme` y se lee de vuelta **THE SYSTEM SHALL** devolver el mismo objeto, y **WHEN** se inserta sin `theme` **THE SYSTEM SHALL** leerlo como `null`.
2. **WHEN** se inserta un `organization` con `industry_custom` de 81 caracteres **THE SYSTEM SHALL** rechazar el insert en la base.
3. **WHEN** se inserta un `ai_suggestion` con `category` `oficina` o `agente` **THE SYSTEM SHALL** aceptarlo, y **WHEN** la `category` es `inventada` **THE SYSTEM SHALL** rechazarlo.
4. **WHEN** `pnpm db:generate` corre después de aplicar la migración **THE SYSTEM SHALL** no agregar ningún archivo `.sql` nuevo a `packages/db/migrations/`.

**Verify**
```bash
grep -q 'ADD COLUMN "theme" jsonb' packages/db/migrations/*.sql
pnpm --filter improvement test tests/tema-schema.test.ts
pnpm --filter @jotapuntoce/db typecheck
n=$(ls packages/db/migrations/*.sql | wc -l) && pnpm db:generate && test "$(ls packages/db/migrations/*.sql | wc -l)" -eq "$n"
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/db/src/schema.ts packages/db/migrations apps/improvement/tests/tema-schema.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E1-T3 (step 3): organization.theme, industry_custom y categorías oficina/agente"
git tag step-03-od-tema-esquema
git ls-files --error-unmatch apps/improvement/tests/tema-schema.test.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E1-T4` — Tema por org con contraste AA aplicado en el layout

**Depends on:** `E1-T3` · **Priority:** p0 · **Step:** 4

1. `packages/ui/src/theme.ts` (módulo puro, sin React y sin dependencias — `packages/ui` no tiene `zod`):
   - `interface OrgTheme { bg: string; textPrimary: string; accent1: string; accent2: string }` (hex `#rrggbb`).
   - `contrastRatio(a, b)`: luminancia relativa WCAG — canal sRGB `v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4`,
     `L = 0.2126 R + 0.7152 G + 0.0722 B`, razón `(Lmax + 0.05) / (Lmin + 0.05)`.
   - `themeIssues(theme)`: `[]` si `textPrimary`, `accent1` y `accent2` contra `bg` dan ≥ 4.5 cada uno; si no,
     una entrada `{ field, ratio }` por cada uno que falla (ratio redondeado a 2 decimales).
   - `themeStyle(theme)`: `{ "--bg": bg, "--text-primary": textPrimary, "--accent-1": accent1, "--accent-2": accent2 }`.
   - Export nuevo en `packages/ui/package.json`: `"./theme.ts": "./src/theme.ts"`.
2. `apps/improvement/server/companies/theme.ts`: `orgThemeSchema = z.object({ bg, textPrimary, accent1, accent2 })`,
   cada uno `z.string().regex(/^#[0-9a-f]{6}$/i)` (lo reusa la propuesta de la oficina, paso 9).
   `setOrgTheme(userId, orgId, input)` — `findOwnerMembership`
   primero (404 lógico `NOT_FOUND` si no es dueño), `orgThemeSchema.safeParse` (`VALIDATION_ERROR`),
   `themeIssues` no vacío → `{ ok: false, error: { code: "CONTRAST", message, issues } }` sin escribir;
   `input === null` borra el tema. `setIndustryCustom(userId, orgId, text | null)` (dueño, 1-80 caracteres
   recortados). `loadOrgTheme(userId, orgId)`: `findMembership` primero (sin membresía → `null`); el
   `theme` parseado con `orgThemeSchema`, o `null` si no hay o no valida (nunca lanza: un tema roto cae a
   tokens base).
3. `apps/improvement/app/[org]/layout.tsx`: con el `userId` de sesión que el layout ya obtiene para
   `loadDireccionNav`, `theme = userId ? await loadOrgTheme(userId, org) : null`, y envuelve el contenido
   actual en `<div style={theme ? themeStyle(theme) : undefined}>`. Nada más cambia.
4. `apps/improvement/tests/theme.test.ts`: los literales de §7 *Tema por org* (contraste) y el servidor.

**Files**
- `packages/ui/src/theme.ts`
- `packages/ui/package.json`
- `apps/improvement/server/companies/theme.ts`
- `apps/improvement/app/[org]/layout.tsx`
- `apps/improvement/tests/theme.test.ts`

**Acceptance**
1. **WHEN** `contrastRatio("#777777", "#ffffff")` y `contrastRatio("#767676", "#ffffff")` corren **THE SYSTEM SHALL** devolver `4.48` y `4.54` redondeados a 2 decimales.
2. **WHEN** `themeIssues` recibe un tema con `textPrimary` `#6b7386` sobre `bg` `#05060b` **THE SYSTEM SHALL** devolver una entrada para `textPrimary` con `ratio` `4.26`, y **WHEN** recibe el tema verde de Improvement **THE SYSTEM SHALL** devolver `[]`.
3. **WHEN** un empleado llama `setOrgTheme` **THE SYSTEM SHALL** devolver `ok: false` con `NOT_FOUND` sin escribir, y **WHEN** el dueño guarda un tema que falla AA **THE SYSTEM SHALL** devolver `CONTRAST` y dejar `organization.theme` sin cambio.
4. **WHEN** el dueño guarda un tema válido y luego `null` **THE SYSTEM SHALL** dejar `organization.theme` con ese objeto y después en `null`.
5. **WHEN** `organization.theme` contiene un objeto que no valida **THE SYSTEM SHALL** hacer que `loadOrgTheme` devuelva `null`.

**Verify**
```bash
pnpm --filter improvement test tests/theme.test.ts
grep -q '"./theme.ts": "./src/theme.ts"' packages/ui/package.json
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- packages/ui/src/theme.ts packages/ui/package.json apps/improvement/server/companies/theme.ts ":(literal)apps/improvement/app/[org]/layout.tsx" apps/improvement/tests/theme.test.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E1-T4 (step 4): tema por org con comprobación AA y override de CSS vars"
git tag step-04-od-tema
git ls-files --error-unmatch packages/ui/src/theme.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

### `E1-T5` — Pantalla de marca del dueño

**Depends on:** `E1-T4` · **Priority:** p1 · **Step:** 5

1. `apps/improvement/app/[org]/marca/page.tsx` (Server Component + Server Actions en el mismo archivo):
   `findOwnerMembership(userId, org)`; si no es dueño, `notFound()`. Muestra el giro actual (etiqueta de
   `INDUSTRIES` agrupada por `INDUSTRY_CATEGORIES` en un `<select>` con `<optgroup>`; guarda con la
   `updateCompanyIndustry` existente), un campo "¿A qué se dedica tu empresa?" que aparece y guarda con
   `setIndustryCustom` solo si el giro es `otro`, y un formulario de tema con cuatro `<input type="color">`
   (`bg`, `textPrimary`, `accent1`, `accent2`), botón "Guardar tema" y botón "Usar colores base" (guarda
   `null`). Un error `CONTRAST` se muestra en `role="alert"` con el campo y su razón ("Contraste 4.26:1 —
   mínimo 4.5:1"). Cada input tiene `<label>`.
2. `apps/improvement/tests/e2e/marca.spec.ts` (`test.describe.configure({ mode: "serial" })`, patrón de
   `lealtad.spec.ts`): siembra dueño y empleado; el dueño guarda un tema válido y el `<div>` del layout lleva
   `--accent-1` con ese valor; guarda un `textPrimary` `#6b7386` sobre `bg` `#05060b` y ve la alerta; el
   empleado recibe 404; AxeBuilder sin violaciones en `/[org]/marca`.

**Files**
- `apps/improvement/app/[org]/marca/page.tsx`
- `apps/improvement/tests/e2e/marca.spec.ts`

**Acceptance**
1. **WHEN** el dueño guarda un tema válido en `/[org]/marca` **THE SYSTEM SHALL** aplicar `--accent-1` con ese valor en el contenedor del layout del org.
2. **WHEN** el dueño guarda `textPrimary` `#6b7386` sobre `bg` `#05060b` **THE SYSTEM SHALL** mostrar una alerta `role="alert"` con `4.26` y no cambiar el tema guardado.
3. **WHEN** un empleado abre `/[org]/marca` **THE SYSTEM SHALL** responder 404.
4. **WHEN** AxeBuilder analiza `/[org]/marca` **THE SYSTEM SHALL** reportar 0 violaciones.

**Verify**
```bash
pnpm --filter improvement test:e2e marca.spec.ts
pnpm lint
pnpm typecheck
pnpm test
```

**Checkpoint** — marca la tarea `done` en `tasks.json` y luego:
```bash
git add -- ":(literal)apps/improvement/app/[org]/marca/page.tsx" apps/improvement/tests/e2e/marca.spec.ts blueprints/oficinas-digitales/tasks.json
git commit -m "E1-T5 (step 5): pantalla de marca: giro libre y tema con vista previa"
git tag step-05-od-marca
git ls-files --error-unmatch apps/improvement/tests/e2e/marca.spec.ts   # expect: exit 0 — commiteado una línea arriba
git diff --quiet HEAD~1 HEAD -- apps/admin apps/summum .claude/launch.json projects   # expect: exit 0 — el WIP del usuario no entró
```

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** `pnpm --filter improvement test:e2e marca.spec.ts` corre completo **THE SYSTEM SHALL** salir con código 0, con `/[org]/marca` auditada por axe sin violaciones.
2. **WHEN** un org sin tema abre cualquier página de `/[org]` **THE SYSTEM SHALL** pintar con los tokens base de `tokens.css`, sin cambio visible respecto de antes del epic.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter improvement test:e2e marca.spec.ts
```

## Pitfalls

- **Leer `.env.example` con Read** — está en `deny`; se extiende con el `printf` guardado de E1-T1.
- **Romper los 8 giros** — `industries.test.ts` compara ids, etiquetas y orden de los primeros 8 con los de hoy; agrega los 22 nuevos **después**.
- **Agregar `zod` a `packages/ui`** — cambiaría el lockfile; `orgThemeSchema` vive en `server/companies/theme.ts`.
- **Aplicar un tema que no pasa AA** — `setOrgTheme` responde `CONTRAST` sin escribir; el layout solo aplica lo que `loadOrgTheme` validó.
- **Redondear la razón con `Math.round`** — la pantalla y las pruebas usan 2 decimales (`toFixed(2)`): 4.26, 12.90.
- **Un servidor ya levantado en el puerto 3200** — Playwright lo reusa fuera de CI; apaga cualquier `pnpm dev:improvement` de otra rama.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*-od-*'` los lista (5 de este epic; 46 al final del build).
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` lleva las seis líneas nuevas sin valor (`grep -qx 'TOKEN_ENCRYPTION_KEY=' .env.example`).
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] La migración de E1-T3 se aplicó solo después de un "sí" explícito de Jose Carlos.
