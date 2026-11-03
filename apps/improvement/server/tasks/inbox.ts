// apps/improvement/server/tasks/inbox.ts
// La bandeja única de cada persona: sus tareas abiertas y sus objetivos pendientes, juntos y sin
// copiar filas. Una tarea la apunta la persona misma, el dueño, Improvement o una automatización;
// solo los objetivos pagan puntos, así que cerrar una tarea ligada a uno lo completa por la vía de
// siempre (completeObjective) y una tarea suelta no paga nada.
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { membership, objective, task, taskStep, type TaskSource } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { addNote, getAppMeta, getRecord } from "../apps/records.ts";
import { completeObjective } from "../objectives/mutations.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

export type TaskRow = typeof task.$inferSelect;
export type StepRow = typeof taskStep.$inferSelect;
export interface InboxItem { kind: "tarea" | "objetivo"; id: string; title: string; source: TaskSource; dueAt: Date | null; overdue: boolean; href: string }
export interface TaskDetail extends TaskRow {
  steps: StepRow[];
  record: { appName: string; title: string; href: string } | null;
  objective: { title: string; evidenceType: string } | null;
}

const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const input = z.object({
  title: z.string().trim().min(1, "Escribe qué hay que hacer.").max(160),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
  assigneeId: z.preprocess(blankToUndefined, z.uuid().optional()),
  dueAt: z.preprocess(blankToUndefined, z.coerce.date().optional()),
  appKey: z.preprocess(blankToUndefined, z.string().max(60).optional()),
  recordId: z.preprocess(blankToUndefined, z.uuid().optional()),
  objectiveId: z.preprocess(blankToUndefined, z.uuid().optional()),
});

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/**
 * Apunta una tarea. Sin assigneeId se la apunta quien la crea. Solo el dueño asigna a otra persona.
 * opts.source lo pone el sistema (copiloto o automatización), que ya autorizó a quien la dispara.
 */
export async function createTask(
  userId: string,
  orgId: string,
  raw: unknown,
  opts: { source?: "improvement" | "automatizacion"; ruleId?: string } = {},
): Promise<Result<{ id: string }>> {
  const me = await assertMembership(userId, orgId);
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const { assigneeId = userId, appKey, recordId, objectiveId, ...rest } = parsed.data;
  if (assigneeId !== userId && me.role !== "owner") return fail("Solo el dueño asigna trabajo a otras personas.", "FORBIDDEN");
  const [target] = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(and(eq(membership.userId, assigneeId), eq(membership.orgId, orgId)));
  if (!target) return fail("Esa persona no es de tu equipo.", "NOT_FOUND");
  // No se asigna trabajo sobre algo que la persona no puede ver.
  if (appKey || recordId) {
    if (!appKey || !recordId) return fail("Falta el registro.");
    if (!(await getRecord(assigneeId, orgId, appKey, recordId)).ok) return fail("Esa persona no puede ver ese registro.", "FORBIDDEN");
  }
  if (objectiveId) {
    const [obj] = await db
      .select({ assignee: objective.assignedEmployeeId })
      .from(objective)
      .where(and(eq(objective.id, objectiveId), eq(objective.orgId, orgId)));
    if (!obj) return fail("Ese objetivo no es de esta empresa.", "NOT_FOUND");
    if (obj.assignee !== assigneeId) return fail("Ese objetivo es de otra persona.");
  }
  const source: TaskSource = opts.source ?? (assigneeId === userId ? "propia" : "dueno");
  const [row] = await db
    .insert(task)
    .values({ ...rest, orgId, assigneeId, appKey, recordId, objectiveId, source, ruleId: opts.ruleId, createdBy: userId })
    .returning({ id: task.id });
  return { ok: true, data: { id: row!.id } };
}

/** Tareas abiertas y objetivos pendientes de la persona: lo vencido primero, luego por fecha. */
export async function listInbox(userId: string, orgId: string): Promise<Result<InboxItem[]>> {
  await assertMembership(userId, orgId);
  const now = Date.now();
  const [tasks, objectives] = await Promise.all([
    db
      .select({ id: task.id, title: task.title, source: task.source, dueAt: task.dueAt })
      .from(task)
      .where(and(eq(task.orgId, orgId), eq(task.assigneeId, userId), eq(task.status, "abierta"))),
    db
      .select({ id: objective.id, title: objective.title, dueAt: objective.dueDate })
      .from(objective)
      .where(and(eq(objective.orgId, orgId), eq(objective.assignedEmployeeId, userId), inArray(objective.status, ["pending", "in_progress"]))),
  ]);
  const items: InboxItem[] = [
    ...tasks.map((t) => ({ kind: "tarea" as const, ...t, overdue: !!t.dueAt && t.dueAt.getTime() < now, href: `/${orgId}/tareas/${t.id}` })),
    ...objectives.map((o) => ({ kind: "objetivo" as const, ...o, source: "dueno" as const, overdue: o.dueAt.getTime() < now, href: `/${orgId}/objetivos` })),
  ];
  const at = (i: InboxItem) => i.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return { ok: true, data: items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || at(a) - at(b)) };
}

/** La tarea si quien pide es la persona asignada o el dueño; para los demás no existe. */
async function visible(userId: string, orgId: string, taskId: string): Promise<{ row: TaskRow; isOwner: boolean } | null> {
  const me = await assertMembership(userId, orgId);
  if (!isUuid(taskId)) return null;
  const [row] = await db.select().from(task).where(and(eq(task.id, taskId), eq(task.orgId, orgId)));
  if (!row) return null;
  const isOwner = me.role === "owner";
  return row.assigneeId === userId || isOwner ? { row, isOwner } : null;
}

export async function getTask(userId: string, orgId: string, taskId: string): Promise<Result<TaskDetail>> {
  const v = await visible(userId, orgId, taskId);
  if (!v) return fail("Esa tarea no existe.", "NOT_FOUND");
  const { row } = v;
  const steps = await db.select().from(taskStep).where(eq(taskStep.taskId, row.id)).orderBy(asc(taskStep.position));
  let record: TaskDetail["record"] = null;
  if (row.appKey && row.recordId) {
    const [meta, rec] = await Promise.all([getAppMeta(orgId, row.appKey), getRecord(userId, orgId, row.appKey, row.recordId)]);
    if (meta && rec.ok) record = { appName: meta.name, title: rec.data.title, href: `/${orgId}/a/${row.appKey}/${row.recordId}` };
  }
  let obj: TaskDetail["objective"] = null;
  if (row.objectiveId) {
    const [o] = await db.select({ title: objective.title, evidenceType: objective.evidenceType }).from(objective).where(eq(objective.id, row.objectiveId));
    obj = o ?? null;
  }
  return { ok: true, data: { ...row, steps, record, objective: obj } };
}

/** Solo la persona asignada la cierra. Con objetivo, lo completa (y paga) o la tarea sigue abierta. */
export async function closeTask(userId: string, orgId: string, taskId: string, evidence?: unknown): Promise<Result<{ points: number | null }>> {
  const v = await visible(userId, orgId, taskId);
  if (!v) return fail("Esa tarea no existe.", "NOT_FOUND");
  const { row } = v;
  if (row.assigneeId !== userId) return fail("Solo quien tiene la tarea la cierra.", "FORBIDDEN");
  if (row.status !== "abierta") return fail("Esa tarea ya está cerrada.");
  let points: number | null = null;
  if (row.objectiveId) {
    const [obj] = await db.select({ status: objective.status }).from(objective).where(eq(objective.id, row.objectiveId));
    if (obj && obj.status !== "completed") {
      const done = await completeObjective(userId, orgId, row.objectiveId, evidence);
      if (!done.ok) return fail(done.error.message, done.error.code);
      points = done.data.points;
    }
  }
  await db.update(task).set({ status: "hecha", doneAt: new Date() }).where(eq(task.id, row.id));
  if (row.appKey && row.recordId) await addNote(userId, orgId, row.appKey, row.recordId, `Tarea cerrada: ${row.title}`);
  return { ok: true, data: { points } };
}

/** La persona asignada o el dueño la quitan de la bandeja; nunca toca el objetivo. */
export async function discardTask(userId: string, orgId: string, taskId: string): Promise<Result<true>> {
  const v = await visible(userId, orgId, taskId);
  if (!v) return fail("Esa tarea no existe.", "NOT_FOUND");
  if (v.row.status !== "abierta") return fail("Esa tarea ya está cerrada.");
  await db.update(task).set({ status: "descartada", doneAt: new Date() }).where(eq(task.id, v.row.id));
  return { ok: true, data: true };
}
