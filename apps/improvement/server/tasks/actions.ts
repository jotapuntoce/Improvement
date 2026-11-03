// apps/improvement/server/tasks/actions.ts
// El catálogo cerrado de lo que Improvement puede hacer dentro de una tarea, y cuándo lo hace sin
// preguntar. Cada acción corre COMO LA PERSONA (sus permisos de sección, nunca más) y ninguna sale
// hacia clientes finales ni mueve dinero: el borrador de mensaje se queda como texto para copiar.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { AGENT_ACTIONS, AGENT_MODES, agentPermission, task, type AgentAction, type AgentMode } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { addNote, createRecord, moveRecord, saveCustomValues } from "../apps/records.ts";
import type { TaskRow } from "./inbox.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

export const ACTION_SCHEMAS = {
  crear_registro: z.object({ app: z.string().min(1).max(60), title: z.string().trim().min(1).max(120) }),
  mover_etapa: z.object({ stage: z.string().min(1).max(60) }),
  actualizar_campos: z.object({ values: z.record(z.string(), z.unknown()) }),
  nota: z.object({ body: z.string().trim().min(1).max(2000) }),
  borrador_mensaje: z.object({ to: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(4000) }),
  // Un recordatorio para la propia persona: pone la fecha de la tarea, así la bandeja la sube a tiempo.
  recordatorio: z.object({ at: z.coerce.date() }),
} satisfies Record<AgentAction, z.ZodType>;

export const ACTION_LABELS: Record<AgentAction, string> = {
  crear_registro: "Crear un registro",
  mover_etapa: "Mover de etapa",
  actualizar_campos: "Llenar campos",
  nota: "Escribir notas en la bitácora",
  borrador_mensaje: "Preparar borradores de mensaje",
  recordatorio: "Ponerte recordatorios",
};

/** El modo de cada acción para esta persona; sin fila, "pregúntame siempre". */
export async function getModes(userId: string, orgId: string): Promise<Record<AgentAction, AgentMode>> {
  await assertMembership(userId, orgId);
  const rows = await db
    .select({ action: agentPermission.action, mode: agentPermission.mode })
    .from(agentPermission)
    .where(and(eq(agentPermission.orgId, orgId), eq(agentPermission.userId, userId)));
  const modes = Object.fromEntries(AGENT_ACTIONS.map((a) => [a, "siempre"])) as Record<AgentAction, AgentMode>;
  for (const r of rows) modes[r.action] = r.mode;
  return modes;
}

/** Cada quien cambia solo los suyos. */
export async function setMode(userId: string, orgId: string, action: unknown, mode: unknown): Promise<Result<true>> {
  await assertMembership(userId, orgId);
  const parsed = z.object({ action: z.enum(AGENT_ACTIONS), mode: z.enum(AGENT_MODES) }).safeParse({ action, mode });
  if (!parsed.success) return fail("Ese permiso no existe.");
  await db
    .insert(agentPermission)
    .values({ orgId, userId, ...parsed.data })
    .onConflictDoUpdate({ target: [agentPermission.orgId, agentPermission.userId, agentPermission.action], set: { mode: parsed.data.mode, updatedAt: new Date() } });
  return { ok: true, data: true };
}

/** Ejecuta una acción del catálogo sobre la tarea, como la persona. Interna: la llama steps.ts ya autorizado. */
export async function executeAction(userId: string, orgId: string, t: TaskRow, action: AgentAction, raw: unknown): Promise<Result<{ result: string }>> {
  const parsed = ACTION_SCHEMAS[action].safeParse(raw);
  if (!parsed.success) return fail("Improvement armó mal este paso; hazlo a mano.");
  const p = parsed.data as Record<string, unknown>;
  const needsRecord = action === "mover_etapa" || action === "actualizar_campos" || action === "nota";
  if (needsRecord && (!t.appKey || !t.recordId)) return fail("Esta tarea no tiene un registro relacionado.");
  const app = t.appKey!;
  const id = t.recordId!;
  switch (action) {
    case "crear_registro": {
      const r = await createRecord(userId, orgId, p.app as string, p.title as string);
      return r.ok ? { ok: true, data: { result: `Registro creado: ${p.title as string}` } } : r;
    }
    case "mover_etapa": {
      const r = await moveRecord(userId, orgId, app, id, p.stage as string);
      return r.ok ? { ok: true, data: { result: `Etapa: ${p.stage as string}` } } : r;
    }
    case "actualizar_campos": {
      const r = await saveCustomValues(userId, orgId, app, id, p.values);
      return r.ok ? { ok: true, data: { result: `Campos: ${Object.keys(r.data).join(", ")}` } } : r;
    }
    case "nota": {
      const r = await addNote(userId, orgId, app, id, p.body as string);
      return r.ok ? { ok: true, data: { result: p.body as string } } : r;
    }
    case "borrador_mensaje":
      return { ok: true, data: { result: `Para ${p.to as string}:\n${p.body as string}` } };
    case "recordatorio": {
      const at = p.at as Date;
      await db.update(task).set({ dueAt: at }).where(eq(task.id, t.id));
      return { ok: true, data: { result: `Te lo recuerdo el ${at.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}` } };
    }
  }
}
