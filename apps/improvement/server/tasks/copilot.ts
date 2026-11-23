// apps/improvement/server/tasks/copilot.ts
// "Que Improvement lo prepare": parte una tarea en pasos. Los pasos de Improvement quedan
// propuestos y solo corren solos los que la persona ya le dio "hazlo solo". Un paso que el modelo
// armó mal no tira el plan: se guarda como paso de la persona, sin acción.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { AGENT_ACTIONS, appModel, appStage, task, taskStep } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { extractStructured, type SuggestionProvider } from "../ai/gateway.ts";
import { TASK_PLAN_SYSTEM, taskPlanPrompt, taskPlanSchema, type TaskPlanContext } from "../ai/prompts/task.ts";
import { getAppMeta, getRecord } from "../apps/records.ts";
import { ACTION_SCHEMAS } from "./actions.ts";
import { appendImprovementSteps, runImprovementStep, type NewStep } from "./steps.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

const isAction = z.enum(AGENT_ACTIONS);

/** Lo que el modelo devolvió, ya convertido en pasos que se pueden guardar. */
function toSteps(raw: z.infer<typeof taskPlanSchema>["steps"]): NewStep[] {
  return raw.map((s) => {
    const action = isAction.safeParse(s.action);
    if (s.kind === "improvement" && action.success && ACTION_SCHEMAS[action.data].safeParse(s.payload ?? {}).success) {
      return { title: s.title, kind: "improvement", action: action.data, payload: s.payload ?? {} };
    }
    return { title: s.title, kind: "persona" };
  });
}

export async function planTask(userId: string, orgId: string, taskId: string, provider?: SuggestionProvider): Promise<Result<{ steps: number; done: number }>> {
  await assertMembership(userId, orgId);
  if (!z.uuid().safeParse(taskId).success) return fail("Esa tarea no existe.", "NOT_FOUND");
  const [t] = await db.select().from(task).where(and(eq(task.id, taskId), eq(task.orgId, orgId)));
  if (!t || t.assigneeId !== userId || t.status !== "abierta") return fail("Esa tarea no existe.", "NOT_FOUND");
  const open = await db
    .select({ id: taskStep.id })
    .from(taskStep)
    .where(and(eq(taskStep.taskId, taskId), eq(taskStep.kind, "improvement"), eq(taskStep.status, "propuesto")));
  if (open.length) return fail("Ya está preparada.");

  let record: TaskPlanContext["record"] = null;
  if (t.appKey && t.recordId) {
    const [meta, rec, stages] = await Promise.all([
      getAppMeta(orgId, t.appKey),
      getRecord(userId, orgId, t.appKey, t.recordId),
      db
        .select({ key: appStage.key, name: appStage.name })
        .from(appStage)
        .innerJoin(appModel, eq(appModel.id, appStage.appId))
        .where(and(eq(appStage.orgId, orgId), eq(appModel.key, t.appKey)))
        .orderBy(asc(appStage.position)),
    ]);
    if (meta && rec.ok) record = { appName: meta.name, title: rec.data.title, stage: rec.data.stage, stages };
  }

  const plan = await extractStructured({
    orgId,
    purpose: "tarea_plan",
    system: TASK_PLAN_SYSTEM,
    prompt: taskPlanPrompt({ title: t.title, notes: t.notes, dueAt: t.dueAt, record }),
    schema: taskPlanSchema,
    maxTokens: 4000,
    provider,
  });
  if (!plan.ok) return fail("Improvement no pudo preparar la tarea ahora; agrega los pasos a mano.", "AI_UNAVAILABLE");

  const steps = toSteps(plan.data.parsed.steps);
  const ids = await appendImprovementSteps(orgId, taskId, steps);
  let done = 0;
  for (const [i, id] of ids.entries()) {
    if (steps[i]!.kind !== "improvement") continue;
    const r = await runImprovementStep(userId, orgId, id);
    if (r.ok && r.data.status === "hecho") done++;
  }
  return { ok: true, data: { steps: ids.length, done } };
}
