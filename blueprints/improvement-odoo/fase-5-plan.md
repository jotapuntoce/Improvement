# Improvement estilo Odoo — Fase 5 (Tableros e inteligencia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El inicio de cada persona es un tablero de tarjetas que ella agrega, quita y acomoda. Improvement le avisa lo que se está cayendo, con el dinero en juego y qué hacer. También le dice qué le falta a su proceso comparado con su giro, calcula la salud de cada cliente y el pronóstico de ventas, y le deja jugar con "¿Qué pasa si?". Lo que no se arregla dentro de Improvement pasa a Summum.

**Architecture:**
- **Tarjetas:** cada tarjeta es una fila `dashboard_card` (persona + org + tipo + `config` + posición).
- **Datos:** `server/dashboard/cards.ts` calcula cada tipo con las mismas funciones con guard que ya usan las pantallas (`listRecords`, `listInbox`, `computeKpiValues`, `celebrations`), así que una tarjeta nunca enseña lo que la persona no puede ver.
- **Alertas:** reglas en código (`server/insights/alerts.ts`) con los números sacados de consultas. La IA solo redacta el porqué y qué hacer, y solo cuando la persona lo pide; se guarda en `ai_suggestion`.
- **Salud del cliente:** se recalcula una vez al día en un cron nuevo.
- **Pronóstico:** sale de consultas sobre `deal` y `record_activity`.
- **¿Qué pasa si?:** un componente cliente que hace las cuentas en el navegador.

**Tech Stack:** Next 16 App Router · TypeScript · Drizzle + Supabase (RLS) · zod 4 · `@anthropic-ai/sdk` (solo en el gateway) · Vitest · Playwright + axe. Gráficas con CSS (barras), sin librería.

**Spec:** `blueprints/improvement-odoo/spec.md` (§4 Frente — centro, §8 Dashboards e inteligencia, §9 fase 5). Base: Fase 4 (PR jotapuntoce/Improvement#9).

## Global Constraints

- **Dos puertas:** cada función de `server/**` empieza con su guard. Cada tabla org-scoped nueva nace con su política RLS en la misma tanda de migraciones.
- **Motor genérico:** nada en `server/**` ni en `packages/db/**` nombra un org, una empresa o una persona.
- **Migraciones:**
  - Toda migración se muestra a Jose Carlos y espera un "sí" explícito antes de `pnpm db:migrate`.
  - Nunca editar a mano una migración generada; la de RLS va con `pnpm db:generate --custom`.
- **Resultados y validación:** errores como `{ ok: true, data } | { ok: false, error: { code, message } }`, e input validado con zod en el borde.
- **Imports:**
  - Relativos con extensión `.ts`/`.tsx`, alias `@/` y sin barrels.
  - Las rutas nunca importan `@jotapuntoce/db`.
- `"use client"` solo en la hoja que necesita estado o eventos (¿Qué pasa si?, los botones de acomodo si hacen falta).
- Ningún hex nuevo fuera de `packages/ui/src/tokens.css`. Las barras usan los tokens de la marca del negocio.
- **IA:**
  - `@anthropic-ai/sdk` solo en `server/ai/gateway.ts`. Antes de tocar la llamada al modelo se invoca la skill `claude-api`.
  - El prompt vive en `server/ai/prompts/` y la respuesta se valida con zod (un reintento).
  - El uso real va a `llm_calls`, y el tope de 10 por org por hora se revisa antes de llamar.
  - Los números nunca los inventa la IA: entran ya calculados en el prompt.
- **`org_kpi`** crece solo por su vía documentada (`KPI_SOURCES` + check). Su semántica no cambia.
- Sin ranking dentro de Improvement: ninguna tarjeta compara personas entre sí.
- `SUPABASE_SERVICE_ROLE_KEY` nunca en `apps/improvement`.
- Sin dependencias nuevas.
- Escribir "Jotapuntoce", nunca "J.C".
- **Gate:** `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar una tarea por hecha.
- **Commits:** con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca `git add -A`.

## Decisiones (por aprobar)

| # | Spec | Este plan |
|---|---|---|
| G1 | `dashboard_layout`: tarjetas y su acomodo, por usuario y org | **Tabla `dashboard_card`**, una fila por tarjeta, en lugar de un layout con un jsonb: reordenar, quitar y aplicar RLS por persona es más simple por fila. **Acomodo con botones** "Subir / Bajar / Quitar", sin arrastrar: arrastrar pide una librería o mucho código cliente y no es accesible por teclado. Arrastrar llega cuando un dueño lo pida. |
| G2 | Catálogo de tarjetas | Esta fase entran 9 tipos:<br>• `numero`: un `org_kpi` existente, o contar/sumar un campo de una app.<br>• `barras`: una app por etapa, mes o responsable, con barras CSS.<br>• `embudo`: etapas de una app.<br>• `lista`: registros de una app en una etapa.<br>• `hoy`: tu bandeja.<br>• `alertas`.<br>• `momentos`: cumpleaños y aniversarios, vía `celebrations()`.<br>• `ingresos_meta`.<br>• `pronostico`.<br>**"Kanban en miniatura"** se cubre con `embudo` + `lista`. **"Calendario de trabajo interno"** se va a la Fase 6, donde el spec pone el calendario. |
| G3 | Cada tarjeta respeta los permisos | Cada tipo calcula sus datos con las funciones que ya tienen guard. Si la persona pierde acceso a la app, la tarjeta dice "Ya no tienes acceso a esta app" y se puede quitar. En "Agregar tarjeta" solo se ofrecen las apps que la persona ve. |
| G4 | Improvement sugiere un tablero inicial según su rol | **Sugerencia fija por rol, sin IA:**<br>• Dueño: hoy, alertas, ingresos_meta, embudo de Ventas y pronóstico.<br>• Empleado: hoy, momentos y lista de su app principal.<br>Se siembra la primera vez que la persona abre su inicio y no tiene tarjetas. La IA no agrega nada aquí: el rol ya dice lo suficiente, y cada entrada costaría una llamada. |
| G5 | Ingresos por producto contra meta | No existe la tabla de productos. La tarjeta suma los tratos **ganados del mes** en Ventas y los agrupa por un campo de tipo **opción** de Ventas que el dueño elige (p. ej. "Producto"). La meta mensual por opción se captura en la `config` de la tarjeta. Sin campo elegido, muestra el total contra una sola meta. |
| G6 | Pronóstico: pipeline abierto × tasa real de cierre por etapa de los últimos 6 meses | **Solo en Ventas** (`deal`): es la única app con ganado/perdido; las etapas de `app_stage` no dicen cuál cierra.<br>• **Tasa por etapa:** de los tratos que pasaron por esa etapa y se cerraron en 6 meses, la parte que terminó ganada. "Pasaron por" se lee del historial `Etapa: a → b` de `record_activity`, más la etapa actual.<br>• **Pocos datos:** con menos de 5 casos en una etapa se usa la tasa global de esos 6 meses (ganados / cerrados).<br>• **Sin cerrados:** si no hay ninguno, la tarjeta lo dice y no inventa número.<br>Las apps propias ganan pronóstico cuando una etapa pueda marcarse "cierra". |
| G7 | Alertas que explican | **Las reglas viven en código** (genéricas, sin cliente):<br>• Trato sin movimiento en 14 días.<br>• Cliente en riesgo con trato abierto.<br>• Ticket abierto hace más de 7 días.<br>• Objetivo vencido.<br>• Registro de app propia con fecha vencida en un campo fecha.<br>Cada alerta trae el registro y el dinero en juego (calculado).<br>**El texto de IA es a demanda:** el botón "Explícame" pide `purpose: "alerta"` y guarda el texto en `ai_suggestion` con la categoría nueva `alerta`; no se llama solo, porque costaría dinero aunque nadie la abra. Sin IA o con el tope alcanzado se ve la regla en texto llano.<br>Cada persona ve solo las alertas de lo que puede ver. |
| G8 | Salud del cliente calculada y guardada en `client.health_status` | **Cron diario nuevo** `/api/cron/salud`, a las 7:30 de CDMX, con el mismo `CRON_SECRET`. Usa la actividad más reciente del cliente (bitácora, tratos y tickets):<br>• `healthy`: 30 días o menos.<br>• `neutral`: 90 días o menos.<br>• `at_risk`: más de 90 días, o un ticket abierto hace más de 7 días.<br>**Lo manual gana 30 días:** si el dueño movió la salud a mano en los últimos 30 días (`Etapa:` en la bitácora), el cron no la toca. |
| G9 | Qué falta en tu proceso; se aplica con un clic | Compara las apps del org contra la plantilla de su giro (`server/apps/templates.ts`): apps, etapas y campos faltantes, emparejados por nombre sin acentos. Cada faltante tiene "Agregar", que llama a `createCustomApp`, `addField` o al alta de etapa que ya existe. Solo el dueño. Vive en una tarjeta (`que_falta`) y en `/[org]/proceso`. |
| G10 | ¿Qué pasa si? — cálculo en el navegador, sin IA | Página `/[org]/que-pasa-si` (solo dueño). El servidor entrega los números reales:<br>• Ticket promedio ganado en 6 meses.<br>• Tasa de cierre.<br>• Tratos nuevos por mes.<br>• Ingreso del mes.<br>Un componente cliente deja mover esos tres (ticket, tasa y tratos) y recalcula el ingreso mensual y la diferencia. Nada se guarda. |
| G11 | Puente a Summum vía `referNeedToSummum()` | **En una alerta o un faltante**, el dueño puede "Pedir ayuda a Summum". Eso crea la necesidad (`createNeed`) con el contexto de la alerta y la deriva con `referNeedToSummum`, sin tabla ni canal nuevos.<br>**Solo el dueño.** El canal real hacia Summum sigue pendiente, como dice `referNeedToSummum`. |

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` | `dashboardCard` + `DASHBOARD_CARD_KINDS`; `ai_suggestion_category_check` suma `alerta` |
| `packages/db/migrations/0066_*.sql` (generada) + `0067_tableros_rls.sql` (custom) | Tabla, check y RLS |
| `apps/improvement/server/dashboard/cards.ts` | `listCards`, `addCard`, `moveCard`, `removeCard`, `seedDefaultCards`, `cardData(card)` por tipo |
| `apps/improvement/server/insights/alerts.ts` | `listAlerts(userId, orgId)` (reglas), `explainAlert` (gateway), `alertToSummum` |
| `apps/improvement/server/insights/forecast.ts` | `forecast(userId, orgId)`, `whatIfBase(userId, orgId)` |
| `apps/improvement/server/insights/health.ts` | `recomputeClientHealth(now)` (cron, todas las empresas) |
| `apps/improvement/server/insights/gaps.ts` | `processGaps(userId, orgId)`, `applyGap(userId, orgId, gap)` |
| `apps/improvement/server/ai/prompts/alert.ts` + `gateway.ts` | Prompt de la alerta; `purpose: "alerta"` |
| `apps/improvement/app/api/cron/salud/route.ts` + `vercel.json` | Cron diario de salud |
| `apps/improvement/app/[org]/page.tsx` | Inicio = tablero; "Agregar tarjeta" |
| `apps/improvement/app/[org]/tablero/agregar/page.tsx` | Elegir tipo y configurar |
| `apps/improvement/components/dashboard/*.tsx` | Una tarjeta por tipo (Server Components); `WhatIf.tsx` (cliente) |
| `apps/improvement/app/[org]/proceso/page.tsx` | Qué falta en tu proceso |
| `apps/improvement/app/[org]/que-pasa-si/page.tsx` | ¿Qué pasa si? |
| `apps/improvement/app/[org]/alertas/page.tsx` | Todas las alertas, Explícame, Pedir ayuda a Summum |

---

### Task 1: Esquema y RLS

**Files:** `packages/db/src/schema.ts`, migración generada + `0067_tableros_rls.sql`, `apps/improvement/tests/dashboard-schema.test.ts`.

```ts
export const DASHBOARD_CARD_KINDS = ["numero", "barras", "embudo", "lista", "hoy", "alertas", "momentos", "ingresos_meta", "pronostico", "que_falta"] as const;
export const dashboardCard = pgTable("dashboard_card", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: DASHBOARD_CARD_KINDS }).notNull(),
  title: text("title").notNull(),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("idx_dashboard_card_user").on(t.orgId, t.userId, t.position), check("dashboard_card_kind_check", sql`...`)]);
```

**RLS:** cada quien lee y escribe solo sus filas (`user_id = auth.uid()` y miembro aceptado del org), y nadie lee el tablero de otro, ni siquiera el dueño. `ai_suggestion_category_check` suma `'alerta'`.

**Acceptance:**
1. WHEN un empleado lee `dashboard_card` como `authenticated` THE SYSTEM SHALL devolverle solo sus filas.
2. WHEN el dueño lee como `authenticated` THE SYSTEM SHALL no devolverle las tarjetas de sus empleados.
3. WHEN se inserta una fila con `user_id` de otra persona THE SYSTEM SHALL rechazarla.

- [ ] Esquema, `pnpm db:generate`, `pnpm db:generate --custom` con la RLS. **Mostrar el SQL a Jose Carlos y esperar "sí"** antes de `pnpm db:migrate`.
- [ ] Pruebas de RLS, gate, commit "Fase 5 T1: tarjetas del tablero con RLS".

### Task 2: Tarjetas — datos y acomodo

**Files:** `server/dashboard/cards.ts`, `tests/dashboard-cards.test.ts`.

**Interfaces:**
- `listCards(userId, orgId) → Result<Card[]>`.
- `addCard(userId, orgId, input) → Result<{ id }>`, con un `cardInput` como unión discriminada por `kind`.
- `moveCard(userId, orgId, id, "arriba"|"abajo")`.
- `removeCard(userId, orgId, id)`.
- `seedDefaultCards(userId, orgId)`, que respeta G4 y solo corre si no hay tarjetas.
- `cardData(userId, orgId, card) → Result<CardData>`, con `CardData` como unión por `kind`. Las tarjetas `alertas`, `pronostico` e `ingresos_meta` llaman a lo de T4–T6; hasta entonces devuelven `{ ok: false, code: "PENDIENTE" }`.

**Acceptance:**
1. WHEN un empleado agrega una tarjeta `lista` de una app que no ve THE SYSTEM SHALL rechazarla con FORBIDDEN.
2. WHEN se quita el permiso de la app después THE SYSTEM SHALL devolver `NO_ACCESS` en `cardData`, sin datos.
3. WHEN la persona sube la segunda tarjeta THE SYSTEM SHALL dejarla primera y la primera, segunda.
4. WHEN `barras` agrupa Ventas por etapa THE SYSTEM SHALL sumar `amountCents` por etapa con el nombre de la etapa.
5. WHEN un dueño abre su inicio sin tarjetas THE SYSTEM SHALL sembrarle las 5 de G4, y al empleado sus 3.

### Task 3: Inicio = tablero

**Files:** `app/[org]/page.tsx`, `app/[org]/tablero/agregar/page.tsx`, `components/dashboard/*.tsx`, `globals.css` (`.dash-grid` 2–3 columnas, 1 en teléfono; `.dash-bar` con tokens de marca).

**Acceptance:**
1. WHEN la persona abre `/[org]` THE SYSTEM SHALL mostrar la portada y debajo sus tarjetas en orden.
2. WHEN agrega una tarjeta "Número" de Ventas con suma del monto THE SYSTEM SHALL mostrarla al final con el total.
3. WHEN pulsa "Subir", "Bajar" o "Quitar" THE SYSTEM SHALL reacomodar sin recargar a mano.
4. WHEN cada barra se dibuja THE SYSTEM SHALL llevar su valor en texto (no solo el largo).

Las tarjetas de "Junta pendiente" y "Pedir siguiente movimiento" se quedan fijas arriba, como hoy.

### Task 4: Alertas que explican + puente a Summum

**Files:** `server/insights/alerts.ts`, `server/ai/prompts/alert.ts`, `gateway.ts` (`purpose: "alerta"`), `app/[org]/alertas/page.tsx`, `tests/alerts.test.ts`.

**Interfaces:**
- `listAlerts(userId, orgId, now?) → Result<Alert[]>`, donde `Alert = { key, rule, title, href, amountCents|null, days, explained?: string }`. Ordena por dinero en juego y luego por días.
- `explainAlert(userId, orgId, key, provider?)`.
- `alertToSummum(userId, orgId, key, note)`.

**Acceptance:**
1. WHEN un trato abierto no se mueve en 14 días THE SYSTEM SHALL listar la alerta con su monto.
2. WHEN un empleado sin Ventas pide alertas THE SYSTEM SHALL no incluir las de Ventas.
3. WHEN se pide "Explícame" con el proveedor simulado THE SYSTEM SHALL guardar el texto en `ai_suggestion` (`alerta`) y devolverlo en la siguiente lectura.
4. WHEN la IA falla THE SYSTEM SHALL responder AI_UNAVAILABLE y la alerta se sigue viendo con su regla en texto llano.
5. WHEN el dueño pide ayuda a Summum desde una alerta THE SYSTEM SHALL dejar una `org_need` en `derivada` con `referred_at`.

### Task 5: Salud del cliente

**Files:** `server/insights/health.ts`, `app/api/cron/salud/route.ts`, `vercel.json` (`"30 13 * * *"`), `tests/client-health.test.ts`.

**Acceptance:**
1. WHEN un cliente tuvo actividad hace 10 días THE SYSTEM SHALL dejarlo `healthy`; a los 60, `neutral`; a los 120, `at_risk`.
2. WHEN tiene un ticket abierto hace 8 días THE SYSTEM SHALL dejarlo `at_risk` aunque tenga actividad reciente.
3. WHEN el dueño cambió la salud a mano hace 5 días THE SYSTEM SHALL no tocarla.
4. WHEN la ruta llega sin `CRON_SECRET` THE SYSTEM SHALL responder 401.

### Task 6: Pronóstico e ingresos contra meta

**Files:** `server/insights/forecast.ts`, `tests/forecast.test.ts`.

**Interfaces:**
- `forecast(userId, orgId, now?) → Result<{ byStage: { stage, openCents, rate, source: "etapa"|"global" }[], totalCents } | { sinHistoria: true }>`.
- `revenueVsGoal(userId, orgId, config, now?)`.
- `whatIfBase(userId, orgId, now?) → { ticketCents, winRate, dealsPerMonth, monthCents }`.

**Acceptance:**
1. WHEN hay 10 tratos cerrados que pasaron por "propuesta", 6 ganados THE SYSTEM SHALL usar 0.6 para los abiertos en propuesta.
2. WHEN una etapa tiene menos de 5 casos THE SYSTEM SHALL usar la tasa global y marcarlo `global`.
3. WHEN no hay tratos cerrados en 6 meses THE SYSTEM SHALL devolver `sinHistoria`.
4. WHEN la tarjeta agrupa por el campo "Producto" THE SYSTEM SHALL sumar los ganados del mes por opción contra la meta de cada una.

### Task 7: Qué falta en tu proceso

**Files:** `server/insights/gaps.ts`, `app/[org]/proceso/page.tsx`, `tests/process-gaps.test.ts`.

**Acceptance:**
1. WHEN un restaurante no tiene la app "Reservaciones" THE SYSTEM SHALL listarla como faltante con sus etapas.
2. WHEN la tiene pero sin el campo "Personas" THE SYSTEM SHALL listar solo ese campo.
3. WHEN el dueño pulsa "Agregar" THE SYSTEM SHALL crearlo y quitarlo de la lista.
4. WHEN un empleado abre `/proceso` THE SYSTEM SHALL responder 404.

### Task 8: ¿Qué pasa si?

**Files:** `app/[org]/que-pasa-si/page.tsx`, `components/dashboard/WhatIf.tsx` (`"use client"`), barra lateral (fijo "Tablero" no; enlaces desde las tarjetas de pronóstico e ingresos).

**Acceptance:**
1. WHEN el dueño abre la página THE SYSTEM SHALL mostrar los tres números reales de hoy.
2. WHEN sube la tasa de cierre de 20 % a 30 % THE SYSTEM SHALL recalcular el ingreso mensual en el navegador, sin pedir nada al servidor.
3. WHEN no hay historia THE SYSTEM SHALL arrancar en ceros y decirlo.

### Task 9: E2E y PR

- [ ] `tests/e2e/tablero.spec.ts`: el dueño ve su tablero sembrado, agrega una tarjeta "Número" de Ventas, la sube y la quita. Abre alertas con un trato viejo sembrado y lo pasa a Summum. Abre "Qué falta" y agrega un campo. Mueve la tasa en "¿Qué pasa si?". Corre axe en inicio, alertas, proceso y ¿Qué pasa si?.
- [ ] Suite E2E completa + gate.
- [ ] `fase-5-pr.md` y PR encima de la Fase 4.

## Autorrevisión

- **Spec §8 cubierto:**
  - Catálogo (G2): calendario → Fase 6.
  - Permisos (G3), alertas (G7), qué falta (G9), salud (G8), pronóstico (G6), ¿Qué pasa si? (G10) y Summum (G11).
  - §4 "tablero que agrega, quita y acomoda" (G1); "Improvement sugiere uno inicial" (G4).
- **Se desvían por decisión a aprobar:**
  - Acomodo con botones en vez de arrastrar (G1).
  - Sugerencia inicial sin IA (G4).
  - Ingresos por un campo opción en vez de una tabla de productos (G5).
  - Pronóstico solo en Ventas (G6).
  - Explicación de alertas a demanda (G7).
