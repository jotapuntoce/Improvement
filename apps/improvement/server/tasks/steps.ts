// apps/improvement/server/tasks/steps.ts
// Los pasos de una tarea. Los de la persona se marcan listos con lo que quedó; los de Improvement se
// ejecutan solos solo si el permiso de esa persona para esa acción es "hazlo solo", y si no, quedan
// propuestos hasta que los apruebe. Todo paso hecho deja su evidencia en la bitácora del registro.
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { AGENT_ACTIONS, task, taskStep, type AgentAction } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { addNote } from "../apps/records.ts";
import { ACTION_LABELS, ACTION_SCHEMAS, executeAction, getModes, setMode } from "./actions.ts";
import type { StepRow, TaskRow } from "./inbox.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

export interface NewStep { title: string; kind: "persona" | "improvement"; action?: AgentAction; payload?: Record<string, unknown> }

/** Solo la persona asignada mueve los pasos de su tarea; para los demás no existen. */
async function mine(userId: string, orgId: string, stepId: string): Promise<{ step: StepRow; t: TaskRow } | null> {
  await assertMembership(userId, orgId);
  if (!z.uuid().safeParse(stepId).success) return null;
  const [row] = await db
    .select({ step: taskStep, t: task })
    .from(taskStep)
    .innerJoin(task, eq(task.id, taskStep.taskId))
    .where(and(eq(taskStep.id, stepId), eq(taskStep.orgId, orgId)));
  return row && row.t.assigneeId === userId && row.t.status === "abierta" ? row : null;
}

async function evidence(userId: string, orgId: string, t: TaskRow, text: string) {
  if (t.appKey && t.recordId) await addNote(userId, orgId, t.appKey, t.recordId, text);
}

/**
 * Agrega pasos al final de la tarea. Interna: la llaman addStep y el copiloto ya autorizados. Un
 * paso de Improvement con acción tiene que cumplir el esquema de su acción, o no se guarda.
 */
export async function appendImprovementSteps(orgId: string, taskId: string, steps: NewStep[]): Promise<string[]> {
  for (const s of steps) {
    if (s.action && !ACTION_SCHEMAS[s.action].safeParse(s.payload ?? {}).success) throw new Error(`Payload inválido para ${s.action}`);
  }
  const [{ last } = { last: null }] = await db.select({ last: max(taskStep.position) }).from(taskStep).where(eq(taskStep.taskId, taskId));
  const start = (last ?? -1) + 1;
  if (steps.length === 0) return [];
  const rows = await db
    .insert(taskStep)
    .values(steps.map((s, i) => ({ orgId, taskId, position: start + i, title: s.title, kind: s.kind, action: s.action ?? null, payload: s.payload ?? {} })))
    .returning({ id: taskStep.id });
  return rows.map((r) => r.id);
}

/** La persona agrega un paso suyo. */
export async function addStep(userId: string, orgId: string, taskId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertMembership(userId, orgId);
  const parsed = z.object({ title: z.string().trim().min(1, "Escribe el paso.").max(160) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Escribe el paso.");
  if (!z.uuid().safeParse(taskId).success) return fail("Esa tarea no existe.", "NOT_FOUND");
  const [t] = await db.select().from(task).where(and(eq(task.id, taskId), eq(task.orgId, orgId)));
  if (!t || t.assigneeId !== userId || t.status !== "abierta") return fail("Esa tarea no existe.", "NOT_FOUND");
  const [id] = await appendImprovementSteps(orgId, taskId, [{ title: parsed.data.title, kind: "persona" }]);
  return { ok: true, data: { id: id! } };
}

async function run(userId: string, orgId: string, step: StepRow, t: TaskRow): Promise<Result<true>> {
  const action = z.enum(AGENT_ACTIONS).parse(step.action);
  const r = await executeAction(userId, orgId, t, action, step.payload);
  if (!r.ok) return r;
  await db.update(taskStep).set({ status: "hecho", result: r.data.result, doneBy: "improvement", doneAt: new Date() }).where(eq(taskStep.id, step.id));
  // La nota ya quedó en la bitácora por sí misma; las demás acciones dejan su línea de evidencia.
  if (action !== "nota") await evidence(userId, orgId, t, `Paso: ${step.title} — ${r.data.result}`);
  return { ok: true, data: true };
}

/** Un paso de Improvement: lo hace si la persona le dio "hazlo solo"; si no, lo deja propuesto. */
export async function runImprovementStep(userId: string, orgId: string, stepId: string): Promise<Result<{ status: "hecho" | "propuesto" }>> {
  const m = await mine(userId, orgId, stepId);
  if (!m || m.step.kind !== "improvement" || !m.step.action) return fail("Ese paso no existe.", "NOT_FOUND");
  if (m.step.status === "hecho" || m.step.status === "rechazado") return fail("Ese paso ya se resolvió.");
  await db.update(taskStep).set({ status: "propuesto" }).where(eq(taskStep.id, stepId));
  const mode = (await getModes(userId, orgId))[m.step.action];
  if (mode !== "solo") return { ok: true, data: { status: "propuesto" } };
  const r = await run(userId, orgId, m.step, m.t);
  return r.ok ? { ok: true, data: { status: "hecho" } } : r;
}

/** "Hazlo": ejecuta lo propuesto. Con "la primera vez", desde ahora esa acción ya no pregunta. */
export async function approveStep(userId: string, orgId: string, stepId: string): Promise<Result<true>> {
  const m = await mine(userId, orgId, stepId);
  if (!m || m.step.kind !== "improvement" || !m.step.action) return fail("Ese paso no existe.", "NOT_FOUND");
  if (m.step.status !== "propuesto") return fail("Ese paso no está esperando tu visto bueno.");
  const r = await run(userId, orgId, m.step, m.t);
  if (!r.ok) return r;
  const action = m.step.action;
  if ((await getModes(userId, orgId))[action] === "primera_vez") {
    await setMode(userId, orgId, action, "solo");
    await evidence(userId, orgId, m.t, `Desde ahora Improvement hace «${ACTION_LABELS[action]}» sin preguntar.`);
  }
  return { ok: true, data: true };
}

export async function rejectStep(userId: string, orgId: string, stepId: string): Promise<Result<true>> {
  const m = await mine(userId, orgId, stepId);
  if (!m || m.step.kind !== "improvement") return fail("Ese paso no existe.", "NOT_FOUND");
  if (m.step.status === "hecho") return fail("Ese paso ya se hizo.");
  await db.update(taskStep).set({ status: "rechazado", doneAt: new Date() }).where(eq(taskStep.id, stepId));
  return { ok: true, data: true };
}

/** La persona marca su paso como listo, con lo que quedó. */
export async function completeStep(userId: string, orgId: string, stepId: string, result?: string): Promise<Result<true>> {
  const m = await mine(userId, orgId, stepId);
  if (!m || m.step.kind !== "persona") return fail("Ese paso no existe.", "NOT_FOUND");
  if (m.step.status === "hecho") return fail("Ese paso ya está listo.");
  const text = z.string().trim().max(2000).optional().safeParse(result || undefined);
  if (!text.success) return fail("Lo que quedó es demasiado largo.");
  await db.update(taskStep).set({ status: "hecho", result: text.data ?? null, doneBy: "persona", doneAt: new Date() }).where(eq(taskStep.id, stepId));
  await evidence(userId, orgId, m.t, text.data ? `Paso: ${m.step.title} — ${text.data}` : `Paso: ${m.step.title}`);
  return { ok: true, data: true };
}
