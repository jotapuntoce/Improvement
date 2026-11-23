# Fase 6 — Canales: plan de implementación

> Spec: `blueprints/improvement-odoo/spec.md` §4 (burbuja), §7 (bandeja: "lo que la persona se apunta
> sola por voz o texto") y §9 fila 6. Rama `improvement-odoo-fase-6`, encima de la Fase 5.
> Jose Carlos pidió el 2026-11-02 construir el blueprint completo sin preguntar entre tareas; las
> decisiones H1–H5 salen de lo que él ya dijo (memoria: burbuja por rol, calendario de trabajo interno,
> comunicación diferida).

**Goal:** que cada persona hable con Improvement desde cualquier pantalla (por voz o texto), que el
empleado lo haga con un agente de su rol y que todo lo que tiene fecha viva en un calendario.

## Global Constraints

Las de las fases 1–5: dos puertas (guard + RLS), migración mostrada a Jose Carlos con su "sí" antes de
`pnpm db:migrate`, `@anthropic-ai/sdk` solo en `gateway.ts`, sin dependencia nueva, sin ranking,
Playwright + axe en cada pantalla nueva, gate `pnpm lint && pnpm typecheck && pnpm test`.

## Decisiones

| # | Tema | Decisión |
|---|---|---|
| H1 | Burbuja en todas las pantallas (spec §4) | Componente cliente `ImprovementBubble` en el shell del org, verde de Improvement. Abre un panel encima sin salir de la pantalla. **Voz** con la Web Speech API del navegador (es-MX), sin dependencia; si el navegador no la tiene, el micrófono no aparece y queda el texto. Dos botones: **"Apuntar"** (tarea propia en la bandeja, sin IA) y **"Preguntar"**. |
| H2 | Dueño ↔ Improvement, empleado ↔ agente de su rol (memoria "burbuja por rol") | La misma burbuja; el servidor decide con quién habla. **Dueño:** el Director General, con su memoria (`owner_memory`), sus alertas y su bandeja. **Empleado:** un agente armado con datos, no con código por cliente: nombre de su tipo de permiso, las apps que ve, su bandeja y sus objetivos. La respuesta pasa por `extractStructured` (`purpose: "conversacion"`), que no escribe en `ai_suggestion` (el dueño lee esa tabla y la conversación del empleado es suya). Mismo tope de 10 por hora por org. |
| H3 | Dónde vive la conversación | Tabla `agent_message` (org, persona, `role` usuario/improvement, texto). **RLS: solo la persona** (`user_id = auth.uid()`); ni el dueño lee la de un empleado, ni el empleado la del dueño. Página `/[org]/conversacion` con el historial completo; la burbuja muestra las últimas 6. |
| H4 | Calendario de trabajo interno (spec §8, pasado de la Fase 5) | Vista `/[org]/calendario` (las próximas 4 semanas por día) y tarjeta `calendario` (próximos 7 días). Junta lo que ya tiene fecha y la persona puede ver: sus tareas, sus objetivos y los campos fecha de las apps propias. Sin tabla nueva. **Bloques fijos que Improvement reacomoda (estilo Motion), lote del mes y hábitos** quedan como pieza aparte: tienen su propio diseño en la memoria y piden decisiones del dueño. |
| H5 | WhatsApp y correo hacia afuera | **No entran.** Jose Carlos los puso en pausa hasta entregar la empresa digital, con camino ya decidido (MCP de Gmail; WhatsApp gratis, partiendo de `apps/admin/lib/whatsapp.js`). Se le recuerda al cerrar. |

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` | `agentMessage` + `AGENT_MESSAGE_ROLES`; `DASHBOARD_CARD_KINDS` suma `calendario` |
| migración generada + `*_conversacion_rls.sql` (custom) | Tabla, check y RLS |
| `server/ai/prompts/conversation.ts` | Prompt y esquema `{ respuesta }` |
| `server/ai/gateway.ts` | `extractStructured` acepta `purpose: "conversacion"` |
| `server/conversation/agent.ts` | `listMessages`, `ask(userId, orgId, text, provider?)`, `jot(userId, orgId, text)` |
| `server/calendar/agenda.ts` | `agenda(userId, orgId, from, days)` |
| `components/shell/ImprovementBubble.tsx` | Burbuja (cliente) |
| `app/[org]/layout.tsx` | Pasa las acciones a la burbuja |
| `app/[org]/conversacion/page.tsx`, `app/[org]/calendario/page.tsx` | Pantallas |
| `server/dashboard/cards.ts` + `components/dashboard/CardBody.tsx` | Tarjeta `calendario` |

### Task 1: Esquema y RLS
Acceptance:
1. WHEN un empleado lee `agent_message` como `authenticated` THE SYSTEM SHALL devolverle solo sus filas.
2. WHEN el dueño lee como `authenticated` THE SYSTEM SHALL no devolverle las del empleado.

### Task 2: Conversación y apuntar
Acceptance:
1. WHEN la persona apunta "Llamar a Rosa" THE SYSTEM SHALL crear una tarea propia abierta en su bandeja.
2. WHEN el empleado pregunta con el proveedor simulado THE SYSTEM SHALL guardar su mensaje y la respuesta, y mandar al modelo el nombre de su rol y sus apps.
3. WHEN el dueño pregunta THE SYSTEM SHALL mandar su memoria de dueño, no un rol.
4. WHEN la IA falla THE SYSTEM SHALL guardar la pregunta y responder AI_UNAVAILABLE.

### Task 3: Calendario
Acceptance:
1. WHEN la persona tiene una tarea con fecha en 3 días y un registro con fecha en 5 THE SYSTEM SHALL listarlos en su día.
2. WHEN el campo fecha es de una app que no ve THE SYSTEM SHALL no listarlo.

### Task 4: Burbuja, pantallas y tarjeta
Acceptance:
1. WHEN la persona abre cualquier pantalla del negocio THE SYSTEM SHALL mostrar la burbuja.
2. WHEN escribe y pulsa "Apuntar" THE SYSTEM SHALL dejar la tarea en su bandeja sin salir de la pantalla.
3. WHEN el navegador no tiene reconocimiento de voz THE SYSTEM SHALL no mostrar el micrófono.

### Task 5: E2E y PR
`tests/e2e/canales.spec.ts`: apuntar desde la burbuja, verla en la bandeja y en el calendario. Axe en
conversación y calendario. Suite completa + gate. `fase-6-pr.md` y PR encima de la Fase 5.
