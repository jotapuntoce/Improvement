# Improvement estilo Odoo — Fase 4 (Tareas con Improvement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada persona tiene una sola bandeja con todo lo que le toca, abre cada tarea en un espacio de trabajo donde Improvement divide el trabajo en pasos, prepara borradores y ejecuta lo que la persona le permite, y el dueño arma automatizaciones que crean tareas, mueven registros y avisan solas.

**Architecture:** Una tarea es una fila `task` con sus pasos en `task_step`. La bandeja (`server/tasks/inbox.ts`) junta las tareas abiertas de la persona con sus objetivos pendientes, sin copiar nada. El copiloto (`server/tasks/copilot.ts`) le pide al gateway un plan de pasos validado contra un catálogo cerrado de acciones (`server/tasks/actions.ts`). Cada acción se ejecuta solo si el permiso de la persona para ese tipo (`agent_permission`) lo deja; si no, queda propuesta hasta que la apruebe. Las automatizaciones (`automation_rule`) se evalúan en `server/automations/engine.ts` después de cada escritura de las vistas genéricas y, una vez al día, desde `/api/cron/automatizaciones` para los disparadores de tiempo. Cada ejecución queda en `automation_run` y en la bitácora del registro.

**Tech Stack:** Next 16 App Router · TypeScript · Drizzle + Supabase (RLS) · zod 4 · `@anthropic-ai/sdk` (solo en el gateway) · Resend (ya instalado) · Vitest · Playwright + axe.

**Spec:** `blueprints/improvement-odoo/spec.md` (§6 Automatizaciones, §7 Tareas con Improvement, §9 fase 4). Base: Fase 3 (PR jotapuntoce/Improvement#8).

## Global Constraints

- Dos puertas: cada función de `server/**` empieza con su guard; cada tabla org-scoped nueva nace con su política RLS en la misma tanda de migraciones.
- Motor genérico: nada en `server/**` ni `packages/db/**` nombra un org, empresa o persona.
- Toda migración se muestra a Jose Carlos y espera un "sí" explícito antes de `pnpm db:migrate`. Nunca editar a mano una migración generada; la de RLS va con `pnpm db:generate --custom`.
- Errores como `{ ok: true, data } | { ok: false, error: { code, message } }`; input validado con zod en el borde.
- Imports relativos con extensión `.ts`/`.tsx`; alias `@/`; sin barrels; las rutas nunca importan `@jotapuntoce/db`.
- `"use client"` solo en la hoja que necesita estado o eventos.
- Ningún hex nuevo fuera de `packages/ui/src/tokens.css`.
- `@anthropic-ai/sdk` solo en `server/ai/gateway.ts`. Antes de tocar la llamada al modelo se invoca la skill `claude-api`. El prompt vive en `server/ai/prompts/`, la respuesta se valida con zod (un reintento), el uso real va a `llm_calls` y el tope de 10 por org por hora se revisa antes de llamar.
- Un objetivo se crea siempre con `createObjective()` y se completa con `completeObjective()`; nunca un insert propio ni otra fórmula de puntos.
- Improvement nunca mueve dinero. Nada sale hacia afuera (clientes finales) en esta fase (F3).
- Sin ranking dentro de Improvement. `SUPABASE_SERVICE_ROLE_KEY` nunca en `apps/improvement`.
- Sin dependencias nuevas.
- Escribir "Jotapuntoce", nunca "J.C".
- Gate: `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar una tarea por hecha.
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca `git add -A`.

## Decisiones (aprobadas por Jose Carlos el 2026-10-27)

| # | Spec | Este plan |
|---|---|---|
| F1 | "Tarea" | Tabla nueva `task` + `task_step`. No se reusa `objective`: un objetivo lo emite solo el dueño, pide peso de impacto y paga puntos; una tarea la puede apuntar cualquiera, incluso Improvement o una regla. Una tarea puede apuntar a un objetivo (`objective_id`) y a un registro de cualquier app (`app_key` + `record_id`). La bandeja muestra tareas y objetivos pendientes juntos, sin copiar filas. |
| F2 | "Cerrar la tarea da puntos" · acción "dar puntos" | Los puntos salen solo de objetivos. Si la tarea apunta a un objetivo, cerrarla llama a `completeObjective()` (con su evidencia) y paga como hoy. Las tareas propias o sugeridas no pagan: si pagaran, cualquiera se podría poner puntos, y el ledger se canjea por PowerUps. En automatizaciones, "dar puntos" se reemplaza por "crear objetivo". |
| F3 | Catálogo: mensaje, agenda, crear o actualizar registros, documento | Esta fase: `crear_registro` (app propia), `mover_etapa`, `actualizar_campos`, `nota` (documento o resumen en la bitácora del registro), `borrador_mensaje` (texto que la persona copia y envía ella misma) y `recordatorio` (a la propia persona, en la app o por correo). Mandar mensajes a clientes finales, WhatsApp y agenda en Google Calendar llegan con Canales (Fase 6). Así ninguna acción sale hacia afuera todavía. |
| F4 | Permisos "pregúntame siempre / la primera vez / hazlo solo" | `agent_permission` por persona y tipo de acción. Por defecto todo arranca en "pregúntame siempre". Con "la primera vez", la primera aprobación lo cambia a "hazlo solo" y lo apunta en la bitácora. Cada persona cambia solo los suyos. |
| F5 | El copiloto divide, prepara y llena | Botón "Que Improvement lo prepare" en la tarea: una llamada (`purpose: "tarea_plan"`) devuelve de 2 a 8 pasos. Cada paso es para la persona o para Improvement con una acción del catálogo. No se llama solo al crear cada tarea, porque costaría dinero aunque nadie la abra. Sin `ANTHROPIC_API_KEY` o con el tope alcanzado, la persona agrega pasos a mano y todo lo demás funciona. |
| F6 | Disparadores de tiempo cada 15 min | El plan Hobby de Vercel corre crons una vez al día (los de hoy son diarios). Los disparadores de tiempo cuentan días (fecha a N días, vencida, N días sin actividad), así que `/api/cron/automatizaciones` corre diario a las 7:00 de CDMX. Es idempotente: una regla no actúa dos veces sobre el mismo registro el mismo día. Si se pasa a Pro, solo cambia el `schedule` en `vercel.json`. |
| F7 | Acciones de automatización | Esta fase: `crear_registro` (en otra app propia), `mover_etapa`, `actualizar_campos`, `crear_tarea` (asignada a una persona; cubre "asignar" y "agent_task"), `crear_objetivo` (vía `createObjective()`), `avisar` (a alguien del equipo, en la app o por correo, con `reminder`) y `experiencia_lealtad` (vía `grantExperience()`, solo en Clientes). Avisos a clientes finales y sus plantillas aprobadas → Fase 6. |
| F8 | Eventos "en la misma Server Action" | Corren después de guardar en `createRecord`, `moveRecord` y `saveCustomValues` de `server/apps/records.ts`, la puerta de las vistas genéricas. Las pantallas viejas de las apps base y las importaciones no disparan reglas: una importación de 5,000 filas dispararía 5,000 corridas. Tope de 3 niveles en cadena. |
| F9 | Modo prueba | Cada regla nace en `prueba`: se evalúa de verdad y registra en `automation_run` qué habría hecho, sin hacerlo. Además, "Probar con lo que ya tengo" lista los registros actuales que cumplen la regla. El dueño la pasa a `activa` cuando le convence. Solo el dueño crea y activa reglas. |

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` | `task`, `taskStep`, `agentPermission`, `automationRule`, `automationRun` y sus catálogos (`TASK_SOURCES`, `TASK_STATUSES`, `STEP_STATUSES`, `AGENT_ACTIONS`, `AGENT_MODES`, `AUTOMATION_TRIGGERS`, `AUTOMATION_STATUSES`) |
| `packages/db/migrations/0064_*.sql` (generada) + `0065_tareas_automatizaciones_rls.sql` (custom) | Tablas y RLS |
| `apps/improvement/server/tasks/inbox.ts` | `createTask`, `listInbox`, `getTask`, `closeTask`, `discardTask` |
| `apps/improvement/server/tasks/actions.ts` | Catálogo de acciones (zod por tipo), `executeAction`, `getModes`, `setMode` |
| `apps/improvement/server/tasks/steps.ts` | `addStep`, `approveStep`, `rejectStep`, `completeStep` |
| `apps/improvement/server/tasks/copilot.ts` | `planTask` (gateway → pasos) |
| `apps/improvement/server/ai/prompts/task.ts` | Prompt y esquema del plan |
| `apps/improvement/server/ai/gateway.ts` | `extractStructured` acepta `purpose: "tarea_plan"` |
| `apps/improvement/server/automations/rules.ts` | CRUD de reglas (solo dueño), `testRule`, `listRuns` |
| `apps/improvement/server/automations/engine.ts` | `matches`, `runAutomations(event)`, `runTimeTriggers()` |
| `apps/improvement/server/apps/records.ts` | Llama a `runAutomations` después de guardar |
| `apps/improvement/app/api/cron/automatizaciones/route.ts` + `vercel.json` | Cron diario |
| `apps/improvement/app/[org]/tareas/page.tsx` | Bandeja |
| `apps/improvement/app/[org]/tareas/nueva/page.tsx` | Apuntar o asignar una tarea |
| `apps/improvement/app/[org]/tareas/[id]/page.tsx` | Espacio de trabajo |
| `apps/improvement/app/[org]/tareas/permisos/page.tsx` | Qué puede hacer Improvement sin preguntar |
| `apps/improvement/app/[org]/automatizaciones/page.tsx`, `nueva/page.tsx`, `[id]/page.tsx` | Reglas, alta, prueba y corridas |
| `apps/improvement/app/[org]/page.tsx` | "Lo que toca hoy" lee `listInbox` |
| `apps/improvement/server/apps/sidebar.ts` | Fijos "Tareas" (todos) y "Automatizaciones" (dueño) |

---

### Task 1: Esquema y RLS

**Files:**
- Modify: `packages/db/src/schema.ts` (al final)
- Create: migración generada + `packages/db/migrations/0065_tareas_automatizaciones_rls.sql`
- Test: `apps/improvement/tests/tasks-schema.test.ts`

**Interfaces — Produces:**

```ts
export const TASK_SOURCES = ["dueno", "propia", "improvement", "automatizacion"] as const;
export const TASK_STATUSES = ["abierta", "hecha", "descartada"] as const;
export const STEP_KINDS = ["persona", "improvement"] as const;
export const STEP_STATUSES = ["pendiente", "propuesto", "hecho", "rechazado"] as const;
export const AGENT_ACTIONS = ["crear_registro", "mover_etapa", "actualizar_campos", "nota", "borrador_mensaje", "recordatorio"] as const;
export const AGENT_MODES = ["siempre", "primera_vez", "solo"] as const;
export const AUTOMATION_TRIGGERS = ["creado", "etapa", "campo", "fecha", "sin_actividad"] as const;
export const AUTOMATION_STATUSES = ["prueba", "activa", "pausada"] as const;

export const task = pgTable("task", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  assigneeId: uuid("assignee_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes"),
  source: text("source", { enum: TASK_SOURCES }).notNull(),
  status: text("status", { enum: TASK_STATUSES }).notNull().default("abierta"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  appKey: text("app_key"),           // registro relacionado (opcional)
  recordId: uuid("record_id"),
  objectiveId: uuid("objective_id").references(() => objective.id, { onDelete: "set null" }),
  ruleId: uuid("rule_id"),            // la regla que la creó, si vino de una automatización
  createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  doneAt: timestamp("done_at", { withTimezone: true }),
}, (t) => [index("idx_task_assignee").on(t.orgId, t.assigneeId, t.status)]);

export const taskStep = pgTable("task_step", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").notNull().references(() => task.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  kind: text("kind", { enum: STEP_KINDS }).notNull(),
  action: text("action", { enum: AGENT_ACTIONS }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status", { enum: STEP_STATUSES }).notNull().default("pendiente"),
  result: text("result"),             // evidencia: qué se hizo o el borrador que quedó
  doneBy: text("done_by", { enum: STEP_KINDS }),
  doneAt: timestamp("done_at", { withTimezone: true }),
}, (t) => [index("idx_task_step_task").on(t.taskId, t.position)]);

export const agentPermission = pgTable("agent_permission", {
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
  action: text("action", { enum: AGENT_ACTIONS }).notNull(),
  mode: text("mode", { enum: AGENT_MODES }).notNull(),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId, t.action] })]);

export const automationRule = pgTable("automation_rule", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  appKey: text("app_key").notNull(),
  name: text("name").notNull(),
  trigger: jsonb("trigger").$type<AutomationTrigger>().notNull(),
  conditions: jsonb("conditions").$type<AutomationCondition[]>().notNull().default(sql`'[]'::jsonb`),
  actions: jsonb("actions").$type<AutomationAction[]>().notNull(),
  status: text("status", { enum: AUTOMATION_STATUSES }).notNull().default("prueba"),
  createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("idx_automation_rule_app").on(t.orgId, t.appKey, t.status)]);

export const automationRun = pgTable("automation_run", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  ruleId: uuid("rule_id").notNull().references(() => automationRule.id, { onDelete: "cascade" }),
  recordId: uuid("record_id").notNull(),
  depth: integer("depth").notNull(),
  outcome: text("outcome", { enum: ["hecho", "prueba", "error", "tope"] }).notNull(),
  detail: text("detail").notNull(),
  day: text("day").notNull(),         // yyyy-mm-dd CDMX; idempotencia del cron
  createdAt: createdAt(),
}, (t) => [index("idx_automation_run_rule").on(t.ruleId, t.createdAt)]);
```

Los tipos `AutomationTrigger`, `AutomationCondition` y `AutomationAction` se exportan desde `schema.ts` como uniones discriminadas TS (su zod vive en `server/automations/rules.ts`):

```ts
export type AutomationTrigger =
  | { type: "creado" }
  | { type: "etapa"; to?: string }
  | { type: "campo"; field: string }
  | { type: "fecha"; field: string; days: number }      // days < 0: N días antes; 0: el día; > 0: vencida hace N
  | { type: "sin_actividad"; days: number };
export interface AutomationCondition { field: string; op: "es" | "no_es" | "mayor" | "menor" | "vacio" | "no_vacio"; value?: string | number | boolean }
export type AutomationAction =
  | { type: "crear_registro"; app: string; title: string }
  | { type: "mover_etapa"; stage: string }
  | { type: "actualizar_campos"; values: Record<string, unknown> }
  | { type: "crear_tarea"; assigneeId: string; title: string; dueInDays?: number }
  | { type: "crear_objetivo"; assigneeId: string; title: string; impactWeight: number; dueInDays: number }
  | { type: "avisar"; userId: string; text: string; channel: "in_app" | "email" }
  | { type: "experiencia_lealtad"; title: string };
```

Además, `automation_run` lleva un índice único `(rule_id, record_id, day)` parcial `where depth = 0 and outcome <> 'error'` para que el cron no repita.

**RLS (`0065_tareas_automatizaciones_rls.sql`):**

```sql
alter table task enable row level security;
create policy "assignee or owner reads tasks" on task for select using (
  assignee_id = auth.uid()
  or exists (select 1 from membership m where m.org_id = task.org_id and m.user_id = auth.uid() and m.role = 'owner'));
alter table task_step enable row level security;
create policy "steps follow their task" on task_step for select using (
  exists (select 1 from task t where t.id = task_step.task_id and (t.assignee_id = auth.uid()
    or exists (select 1 from membership m where m.org_id = t.org_id and m.user_id = auth.uid() and m.role = 'owner'))));
alter table agent_permission enable row level security;
create policy "each person reads own agent permissions" on agent_permission for select using (user_id = auth.uid());
alter table automation_rule enable row level security;
create policy "owners read automation rules" on automation_rule for select using (
  exists (select 1 from membership m where m.org_id = automation_rule.org_id and m.user_id = auth.uid() and m.role = 'owner'));
alter table automation_run enable row level security;
create policy "owners read automation runs" on automation_run for select using (
  exists (select 1 from membership m where m.org_id = automation_run.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on task, task_step, agent_permission, automation_rule, automation_run to authenticated;
```

- [ ] **Step 1: Prueba que falla** (`tests/tasks-schema.test.ts`, mismo helper RLS que `import-schema.test.ts`):
  - WHEN un empleado consulta `task` como `authenticated` THE SYSTEM SHALL devolverle solo las suyas; al dueño, todas las del org.
  - WHEN un empleado consulta `task_step`, `automation_rule` y `automation_run` THE SYSTEM SHALL no devolverle los de tareas ajenas ni ninguna regla; `agent_permission` solo las propias.
- [ ] **Step 2:** Correr: falla porque las tablas no existen.
- [ ] **Step 3:** Agregar las tablas a `schema.ts`, `pnpm db:generate`, `pnpm db:generate --custom --name tareas_automatizaciones_rls` con el SQL de arriba. **Mostrar ambos SQL a Jose Carlos y esperar su "sí"** antes de `pnpm db:migrate`.
- [ ] **Step 4:** Correr la prueba: pasa. Gate.
- [ ] **Step 5:** Commit `Fase 4 T1: tareas, permisos del copiloto y automatizaciones con RLS`.

---

### Task 2: Bandeja y ciclo de una tarea

**Files:**
- Create: `apps/improvement/server/tasks/inbox.ts`
- Test: `apps/improvement/tests/tasks-inbox.test.ts`

**Interfaces — Produces:**

```ts
export interface InboxItem { kind: "tarea" | "objetivo"; id: string; title: string; source: TaskSource | "dueno"; dueAt: Date | null; overdue: boolean; href: string; context: string | null }
export async function createTask(userId: string, orgId: string, input: unknown, opts?: { source?: "improvement" | "automatizacion"; ruleId?: string }): Promise<Result<{ id: string }>>;
export async function listInbox(userId: string, orgId: string): Promise<Result<InboxItem[]>>;
export async function getTask(userId: string, orgId: string, taskId: string): Promise<Result<TaskDetail>>; // TaskDetail = task + steps + registro (título, app) + objetivo (evidenceType)
export async function closeTask(userId: string, orgId: string, taskId: string, evidence?: unknown): Promise<Result<{ points: number | null }>>;
export async function discardTask(userId: string, orgId: string, taskId: string): Promise<Result<true>>;
```

Reglas:
- `createTask` input `{ title (1–160), notes?, assigneeId?, dueAt?, appKey?, recordId?, objectiveId? }`. Sin `assigneeId` se la apunta quien la crea (`source: "propia"`). Solo el dueño asigna a otra persona (`source: "dueno"`). Con `opts.source` la crea el sistema: el `userId` es el dueño o quien disparó la regla, y la regla ya validó. `assigneeId` debe ser miembro; si viene registro, `getRecord(assignee…)` debe dejarlo leerlo (no se asigna trabajo sobre algo que la persona no ve).
- `listInbox`: tareas `abierta` de la persona + objetivos `pending`/`in_progress` asignados a ella. Orden: vencidas primero, luego por fecha, luego sin fecha.
- `getTask`: la persona asignada o el dueño; los demás → `NOT_FOUND`.
- `closeTask`: solo la persona asignada. Si hay `objectiveId`, llama a `completeObjective(userId, orgId, objectiveId, evidence)` y devuelve sus puntos; si falla, la tarea sigue abierta y se devuelve ese error. Si hay registro, escribe en su bitácora "Tarea cerrada: <título>". Marca `hecha` + `doneAt`.
- `discardTask`: la persona asignada o el dueño; nunca toca el objetivo.

- [ ] **Step 1: Prueba que falla:**
  - WHEN un empleado se apunta una tarea THE SYSTEM SHALL ponerla en su bandeja con `source: "propia"`, y no en la de nadie más.
  - WHEN un empleado intenta asignarle una tarea a otro THE SYSTEM SHALL negarlo (`FORBIDDEN`); el dueño sí puede.
  - WHEN la persona tiene un objetivo pendiente THE SYSTEM SHALL mostrarlo en la bandeja junto a sus tareas, con lo vencido primero.
  - WHEN cierra una tarea ligada a un objetivo con evidencia THE SYSTEM SHALL completar el objetivo y devolver los puntos del ledger; sin la evidencia que pide el objetivo, la tarea sigue abierta.
  - WHEN cierra una tarea propia THE SYSTEM SHALL devolver `points: null` y no escribir en el ledger.
  - WHEN otra persona del equipo pide `getTask` de una tarea ajena THE SYSTEM SHALL responder `NOT_FOUND`.
- [ ] **Step 2:** Correr: falla.
- [ ] **Step 3:** Implementar `inbox.ts`.
- [ ] **Step 4:** Pasa. Gate. Commit `Fase 4 T2: bandeja y ciclo de una tarea`.

---

### Task 3: Catálogo de acciones y permisos del copiloto

**Files:**
- Create: `apps/improvement/server/tasks/actions.ts`, `apps/improvement/server/tasks/steps.ts`
- Test: `apps/improvement/tests/tasks-actions.test.ts`

**Interfaces — Produces:**

```ts
export const ACTION_SCHEMAS: Record<AgentAction, z.ZodType>; // payload por tipo
// crear_registro { app, title } · mover_etapa { stage } · actualizar_campos { values } · nota { body } · borrador_mensaje { to, body } · recordatorio { text, at, channel }
export const ACTION_LABELS: Record<AgentAction, string>; // "Crear un registro", "Mover de etapa"…
export async function getModes(userId: string, orgId: string): Promise<Record<AgentAction, AgentMode>>; // default "siempre"
export async function setMode(userId: string, orgId: string, action: AgentAction, mode: AgentMode): Promise<Result<true>>;
export async function executeAction(userId: string, orgId: string, t: TaskRow, action: AgentAction, payload: unknown): Promise<Result<{ result: string }>>;

// steps.ts
export async function addStep(userId: string, orgId: string, taskId: string, input: unknown): Promise<Result<{ id: string }>>;
export async function runImprovementStep(userId: string, orgId: string, stepId: string): Promise<Result<{ status: "hecho" | "propuesto" }>>; // aplica el permiso
export async function approveStep(userId: string, orgId: string, stepId: string): Promise<Result<true>>;
export async function rejectStep(userId: string, orgId: string, stepId: string): Promise<Result<true>>;
export async function completeStep(userId: string, orgId: string, stepId: string, result?: string): Promise<Result<true>>; // pasos de la persona
```

Reglas:
- `executeAction` actúa **como la persona** (`userId`), así que hereda sus permisos de sección: usa `createRecord`, `moveRecord`, `saveCustomValues` y `addNote` de `server/apps/records.ts` sobre el registro de la tarea. `borrador_mensaje` no envía nada: guarda el texto en `result`. `recordatorio` pone la fecha de la tarea (`dueAt`) para que la bandeja la suba a tiempo. (Cambio al ejecutar: un `reminder` sin objetivo no le llega a nadie.)
- `runImprovementStep`: si el modo es `solo`, ejecuta y marca `hecho` con `doneBy: "improvement"`. Con `siempre` o `primera_vez`, deja `propuesto`. `approveStep` ejecuta; si el modo era `primera_vez`, lo pasa a `solo` y anota en la bitácora del registro (o en `result`) "Desde ahora Improvement hace «<label>» sin preguntar".
- Cada paso hecho escribe en la bitácora del registro relacionado "Paso: <título> — <result>" (la evidencia que pide §7).
- Solo la persona asignada mueve los pasos de su tarea.

- [ ] **Step 1: Prueba que falla:**
  - WHEN un paso de Improvement se corre con el modo por defecto THE SYSTEM SHALL dejarlo `propuesto` sin ejecutar nada.
  - WHEN la persona lo aprueba con modo `primera_vez` THE SYSTEM SHALL ejecutarlo, pasar el modo a `solo` y correr solo el siguiente del mismo tipo.
  - WHEN la acción es `mover_etapa` sobre un registro que la persona no puede escribir THE SYSTEM SHALL fallar con `FORBIDDEN` y dejar el paso `propuesto`.
  - WHEN el payload no cumple su esquema THE SYSTEM SHALL rechazar el paso (`VALIDATION_ERROR`).
  - WHEN se ejecuta `borrador_mensaje` THE SYSTEM SHALL guardar el texto en `result` y no enviar nada.
  - WHEN se completa un paso con registro relacionado THE SYSTEM SHALL dejar la evidencia en su bitácora.
- [ ] **Step 2–4:** Falla → implementar → pasa. Gate. Commit `Fase 4 T3: catálogo de acciones y permisos del copiloto`.

---

### Task 4: Copiloto — Improvement prepara la tarea

**Files:**
- Create: `apps/improvement/server/tasks/copilot.ts`, `apps/improvement/server/ai/prompts/task.ts`
- Modify: `apps/improvement/server/ai/gateway.ts` (`purpose` de `extractStructured` suma `"tarea_plan"`)
- Test: `apps/improvement/tests/tasks-copilot.test.ts` (IA simulada con `FakeAi`, como `import-jobs.test.ts`)

**Interfaces — Produces:**

```ts
// prompts/task.ts
export const TASK_PLAN_SYSTEM: string;
export const taskPlanSchema = z.object({ steps: z.array(z.object({
  title: z.string().min(1).max(160),
  kind: z.enum(["persona", "improvement"]),
  action: z.enum(AGENT_ACTIONS).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
})).min(2).max(8) });
export function taskPlanPrompt(ctx: { title: string; notes: string | null; record: { app: string; title: string; stage: string; values: Record<string, unknown> } | null; stages: string[]; fields: { key: string; label: string; type: string }[]; today: string }): string;

// copilot.ts
export async function planTask(userId: string, orgId: string, taskId: string, provider?: SuggestionProvider): Promise<Result<{ steps: number; ran: number }>>;
```

Reglas:
- Solo la persona asignada. Si la tarea ya tiene pasos de Improvement sin terminar, no vuelve a planear (`VALIDATION_ERROR`, "Ya está preparada").
- Los pasos de Improvement con acción inválida o payload que no cumple `ACTION_SCHEMAS` se guardan como pasos de la persona sin acción: no se pierde la idea, pero no se ejecuta algo mal formado.
- Después de guardar, corre `runImprovementStep` en orden sobre los que tengan modo `solo`.
- Errores del gateway → `{ ok: false }` con el mensaje "Improvement no pudo preparar la tarea ahora; agrega los pasos a mano."

- [ ] **Step 0:** Invocar la skill `claude-api` antes de tocar el gateway.
- [ ] **Step 1: Prueba que falla:**
  - WHEN la IA devuelve 3 pasos válidos THE SYSTEM SHALL guardarlos en orden y dejar `propuesto` los de Improvement.
  - WHEN un paso trae una acción fuera del catálogo THE SYSTEM SHALL guardarlo como paso de la persona sin acción.
  - WHEN la persona ya tiene `nota` en modo `solo` THE SYSTEM SHALL ejecutar ese paso al planear.
  - WHEN el gateway falla o no hay proveedor THE SYSTEM SHALL no crear pasos y devolver el mensaje para hacerlo a mano.
  - WHEN alguien que no es la persona asignada pide planear THE SYSTEM SHALL responder `NOT_FOUND`.
- [ ] **Step 2–4:** Falla → implementar → pasa. Gate. Commit `Fase 4 T4: Improvement prepara cada tarea en pasos`.

---

### Task 5: Pantallas de tareas

**Files:**
- Create: `app/[org]/tareas/page.tsx`, `app/[org]/tareas/nueva/page.tsx`, `app/[org]/tareas/[id]/page.tsx`, `app/[org]/tareas/permisos/page.tsx`
- Modify: `app/[org]/page.tsx` ("Lo que toca hoy" usa `listInbox`, primeros 8, enlace "Ver toda mi bandeja"), `server/apps/sidebar.ts` + `components/shell/Sidebar.tsx` (fijo "Tareas"), la ficha `app/[org]/a/[app]/[id]/page.tsx` (botón "Crear tarea sobre esto" → `tareas/nueva?app=&record=`)
- Test: `tests/e2e/a11y.spec.ts` (agrega `/[org]/tareas`, `/[org]/tareas/nueva`, `/[org]/tareas/permisos`)

Contenido (todo Server Components con Server Actions; sin `"use client"`):
- **Bandeja** `/[org]/tareas`: `h1` "Tu bandeja", lista `role="list"` con título, de dónde viene ("Te la asignó el dueño", "Te la apuntaste", "La sugirió Improvement", "La creó una automatización", "Objetivo"), fecha y "Vencida" si aplica. Botón "Apuntar una tarea".
- **Nueva**: título, notas, fecha, y para el dueño un `<select name="assigneeId">` con su equipo. Campos ocultos `app`/`record` si viene de una ficha.
- **Espacio de trabajo** `/[org]/tareas/[id]`, en dos columnas (`.task-workspace`, una sola columna en teléfono):
  - Izquierda: título, registro relacionado (enlace a su ficha), objetivo si hay, y los pasos en `<ol>`. Cada paso de la persona tiene "Listo" (con un campo opcional "¿Qué quedó?"). Al final, "Agregar paso".
  - Derecha, `aside aria-label="Improvement"`: botón "Que Improvement lo prepare" (si no hay pasos de Improvement abiertos), y los pasos de Improvement con su estado. Los `propuesto` muestran qué va a hacer y los botones "Hazlo" y "No". Los `borrador_mensaje` hechos muestran el texto en un `<textarea readonly>` para copiarlo.
  - Abajo: "Cerrar tarea" (con el campo de evidencia si el objetivo la pide) y "Descartar".
- **Permisos** `/[org]/tareas/permisos`: una fila por acción del catálogo con un `<select>` de 3 modos y "Guardar". Texto: "Nada de esto sale hacia tus clientes ni mueve dinero."
- Estilos nuevos en el CSS de la app, solo con tokens.

- [ ] **Step 1:** Implementar las cuatro pantallas y los cambios de inicio, barra y ficha.
- [ ] **Step 2:** Agregar las rutas a `a11y.spec.ts`; correr `pnpm --filter improvement test:e2e tests/e2e/a11y.spec.ts`: 0 serious o critical.
- [ ] **Step 3:** Gate. Commit `Fase 4 T5: bandeja, espacio de trabajo y permisos del copiloto`.

---

### Task 6: Motor de automatizaciones por evento

**Files:**
- Create: `apps/improvement/server/automations/rules.ts`, `apps/improvement/server/automations/engine.ts`
- Modify: `apps/improvement/server/apps/records.ts` (después de guardar en `createRecord`, `moveRecord` y `saveCustomValues`)
- Test: `apps/improvement/tests/automations.test.ts`

**Interfaces — Produces:**

```ts
// rules.ts — todas solo dueño
export const ruleSchema: z.ZodType<{ name: string; appKey: string; trigger: AutomationTrigger; conditions: AutomationCondition[]; actions: AutomationAction[] }>;
export async function createRule(userId: string, orgId: string, input: unknown): Promise<Result<{ id: string }>>;
export async function setRuleStatus(userId: string, orgId: string, ruleId: string, status: AutomationStatus): Promise<Result<true>>;
export async function listRules(userId: string, orgId: string): Promise<Result<RuleRow[]>>;
export async function getRule(userId: string, orgId: string, ruleId: string): Promise<Result<RuleRow & { runs: RunRow[] }>>;
export async function testRule(userId: string, orgId: string, ruleId: string): Promise<Result<{ matches: { id: string; title: string }[] }>>; // registros actuales que cumplen condiciones

// engine.ts — interna; la llaman records.ts y el cron, que ya autorizaron
export interface AutomationEvent { orgId: string; actorId: string; appKey: string; recordId: string; type: "creado" | "etapa" | "campo"; stage?: string; fields?: string[]; depth?: number }
export function matches(rule: { trigger: AutomationTrigger; conditions: AutomationCondition[] }, event: AutomationEvent | { type: "tiempo" }, rec: AppRecord, now: Date): boolean;
export async function runAutomations(event: AutomationEvent): Promise<void>; // nunca lanza: los errores quedan en automation_run
```

Reglas:
- `createRule` valida además, contra el org: que la app y la etapa existan, que los campos existan (`listFields`), que `assigneeId`/`userId` sean miembros, que `crear_registro.app` sea una app propia y que `experiencia_lealtad` solo vaya en `clientes`. Nace en `prueba`.
- `runAutomations`: carga las reglas `prueba` y `activa` de esa app. Con `depth >= 3` registra una corrida `tope` y no sigue. Para cada regla que `matches`: en `prueba` registra `outcome: "prueba"` con el detalle de lo que habría hecho; en `activa` ejecuta las acciones **como el dueño que creó la regla** (`createdBy`; si ya no es dueño, la regla se pausa y queda una corrida `error`). Las acciones que escriben registros llaman a las funciones de `records.ts` con `depth + 1`, lo que dispara la cadena. Al final escribe `automation_run` y, si actuó, una línea en la bitácora del registro: "Automatización «<nombre>»: <detalle>".
- Llave `day` de `automation_run`: el cron usa el día de CDMX (una vez por día por registro); un evento usa el día más un id único, porque un registro puede volver a la misma etapa el mismo día. Activar o pausar una regla la deja a nombre de quien lo hizo.
- `records.ts` gana un parámetro interno opcional `opts?: { depth?: number }` en las tres funciones, y llama a `runAutomations` solo si guardó con éxito. Un error del motor nunca hace fallar el guardado.
- `crear_tarea` → `createTask(..., { source: "automatizacion", ruleId })` con el registro ligado. `crear_objetivo` → `createObjective()`. `avisar` → una tarea "Aviso: …" en la bandeja de esa persona con fecha de hoy (cambio al ejecutar: un `reminder` sin objetivo no le llega a nadie; el correo llega en la Fase 6). `experiencia_lealtad` → `grantExperience()`.

- [ ] **Step 1: Prueba que falla:**
  - WHEN el dueño crea una regla "al pasar a En consulta, crear tarea a X" THE SYSTEM SHALL guardarla en `prueba`; mover un registro solo registra una corrida `prueba` y no crea la tarea.
  - WHEN la regla está `activa` y se mueve el registro THE SYSTEM SHALL crear la tarea en la bandeja de X, ligada al registro, y dejar la línea en la bitácora.
  - WHEN no se cumple una condición (p. ej. `monto mayor 1000`) THE SYSTEM SHALL no actuar.
  - WHEN dos reglas se disparan una a otra en ciclo THE SYSTEM SHALL detenerse en el nivel 3 con una corrida `tope`.
  - WHEN un empleado intenta crear una regla o la regla apunta a una persona de otro org THE SYSTEM SHALL negarlo.
  - WHEN la acción falla THE SYSTEM SHALL registrar `error` y el guardado original queda hecho.
  - WHEN `testRule` corre THE SYSTEM SHALL listar los registros actuales que cumplen las condiciones, sin escribir nada.
- [ ] **Step 2–4:** Falla → implementar → pasa. Gate. Commit `Fase 4 T6: motor de automatizaciones por evento`.

---

### Task 7: Disparadores de tiempo y cron diario

**Files:**
- Modify: `apps/improvement/server/automations/engine.ts` (`runTimeTriggers`)
- Create: `apps/improvement/app/api/cron/automatizaciones/route.ts`
- Modify: `vercel.json` (`{ "path": "/api/cron/automatizaciones", "schedule": "0 13 * * *" }`, 7:00 CDMX)
- Test: `apps/improvement/tests/automations-time.test.ts`

**Interfaces — Produces:** `export async function runTimeTriggers(now?: Date): Promise<{ rules: number; runs: number }>`.

Reglas:
- Recorre las reglas `prueba`/`activa` de tipo `fecha` y `sin_actividad` de todos los orgs (el cron no corre en nombre de nadie; mismo patrón que `/api/cron/reminders`). `fecha`: el campo de fecha del registro, comparado por día de CDMX. `sin_actividad`: la última `record_activity` del registro (o su `updatedAt`) hace N días o más.
- Idempotencia: antes de actuar inserta la corrida con `day`; si choca con el índice único, ya actuó hoy y lo salta.
- Ruta: bearer `CRON_SECRET` exacto o 401, igual que `reminders/route.ts`.

- [ ] **Step 1: Prueba que falla:**
  - WHEN un registro tiene la fecha de entrega en 2 días y la regla dice `days: -2` THE SYSTEM SHALL actuar una vez; correr de nuevo el mismo día no repite.
  - WHEN un registro lleva 7 días sin actividad y la regla dice 7 THE SYSTEM SHALL actuar; con actividad de ayer, no.
  - WHEN la ruta llega sin el bearer correcto THE SYSTEM SHALL responder 401 sin correr nada.
- [ ] **Step 2–4:** Falla → implementar → pasa. Gate. Commit `Fase 4 T7: disparadores de tiempo y cron diario`.

---

### Task 8: Pantallas de automatizaciones

**Files:**
- Create: `app/[org]/automatizaciones/page.tsx`, `app/[org]/automatizaciones/nueva/page.tsx`, `app/[org]/automatizaciones/[id]/page.tsx`
- Modify: `server/apps/sidebar.ts` + `components/shell/Sidebar.tsx` (fijo "Automatizaciones", solo dueño)
- Test: `tests/e2e/a11y.spec.ts` (las tres rutas)

Contenido (solo dueño; los demás → 404):
- **Lista:** nombre, app, "Cuando…" en una frase, estado ("En prueba", "Activa", "Pausada") y la última corrida.
- **Nueva** (formulario por pasos en una sola página, con recarga al elegir la app):
  1. App (`<select name="app">`). Al elegirla, la página recarga con `?app=` para listar sus etapas y campos.
  2. "Cuando": tipo de disparador más su dato (etapa destino, campo, días).
  3. "Y si" (opcional, hasta 3): campo, operador y valor.
  4. "Entonces" (hasta 3): tipo de acción y sus datos (persona, título, etapa, app destino, texto, canal).
  5. "Guardar en prueba".
  El formulario arma el JSON en el servidor y lo valida con `ruleSchema`.
- **Detalle:** la regla en frases, botones "Probar con lo que ya tengo" (lista de coincidencias), "Activar", "Pausar", y la tabla de corridas (fecha, registro, resultado, detalle).

- [ ] **Step 1:** Implementar las tres pantallas y el fijo de la barra.
- [ ] **Step 2:** `a11y.spec.ts` con las tres rutas: 0 serious o critical.
- [ ] **Step 3:** Gate. Commit `Fase 4 T8: pantallas de automatizaciones`.

---

### Task 9: E2E y PR

**Files:**
- Create: `apps/improvement/tests/e2e/tareas.spec.ts`
- Create: `blueprints/improvement-odoo/fase-4-pr.md`

- [ ] **Step 1: `tareas.spec.ts`** (seed como `importar.spec.ts`: dueño + empleado con sesión propia, app propia "Pacientes" con etapas "Nuevo" y "En consulta", y un registro "Firulais").
  1. El dueño crea la regla "Al pasar a En consulta → crear tarea al empleado: Preparar expediente" y la activa.
  2. El dueño mueve a Firulais a "En consulta" desde la ficha.
  3. El empleado abre su bandeja y ve "Preparar expediente", con "La creó una automatización".
  4. Abre la tarea, agrega un paso "Llamar al dueño", lo marca listo con "Confirmado", y cierra la tarea.
  5. En la ficha de Firulais se ven en la bitácora la línea de la automatización y la del paso.
  6. axe en bandeja, espacio de trabajo y detalle de la regla.
  7. `afterAll` borra org, perfiles y usuarios de auth.
  El copiloto con IA no entra en el E2E (costaría dinero y no es determinista); su lógica la cubren las pruebas de T4 con IA simulada.
- [ ] **Step 2:** `pnpm --filter improvement test:e2e` completo y gate (improvement y summum). Commit `Fase 4 T9: E2E de tareas y automatizaciones`.
- [ ] **Step 3:** `fase-4-pr.md` con lo que entra, la verificación y lo que queda para la Fase 6 (mensajes a clientes finales, WhatsApp, agenda, plantillas aprobadas, cron cada 15 min si se pasa a Vercel Pro).

---

## Autorrevisión

- **Cobertura del spec:**
  - §7: bandeja única (T2, T5), espacio de trabajo (T5), copiloto que divide y prepara (T4), catálogo con permisos de 3 niveles (T3), "nunca mueve dinero" (catálogo cerrado), cierre con evidencia en la bitácora y puntos (T2, T3).
  - §6: disparadores creado/etapa/campo (T6), fecha y sin actividad (T7), condiciones (T6), acciones (T6, F7), `automation_run` en bitácora (T6), tope de 3 niveles (T6), modo prueba (T6, F9).
  - Se desvían por decisión a aprobar: mensajes hacia afuera, WhatsApp, agenda y plantillas aprobadas (F3, F7 → Fase 6); "dar puntos" (F2); cron diario (F6); eventos solo en las vistas genéricas (F8).
- **Tipos entre tareas:** `AGENT_ACTIONS`, `AgentMode` y los tipos de automatización nacen en T1 y se usan igual en T3–T8. `createTask(…, opts)` de T2 es el que llaman T4 y T6. `records.ts` gana `opts.depth` en T6 y T3 lo llama sin `opts`.
