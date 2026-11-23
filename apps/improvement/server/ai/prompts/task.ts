// Prompt del copiloto de tareas — export nombrado, nunca inline en el call site (regla
// .claude/rules/ia-gateway.md). Lo usa server/tasks/copilot.ts vía extractStructured.
import { z } from "zod";

export const TASK_PLAN_SYSTEM =
  "Preparas una tarea de un negocio pequeño en pasos concretos, de 2 a 8, en orden. Cada paso es " +
  '"persona" (lo hace quien tiene la tarea: llamar, visitar, decidir) o "improvement" (lo haces tú ' +
  "con una acción del catálogo). Acciones: crear_registro {app, title}, mover_etapa {stage: llave " +
  "de una etapa de la lista}, actualizar_campos {values}, nota {body}, borrador_mensaje {to, body} " +
  "(solo el texto, nunca se envía), recordatorio {at: fecha ISO}. Solo usa mover_etapa, " +
  "actualizar_campos y nota si la tarea tiene un registro. No inventes datos que no te dieron. " +
  "Respondes SOLO con un objeto JSON, sin texto alrededor, con la forma " +
  '{"steps": [{"title": string, "kind": "persona" | "improvement", "action"?: string, "payload"?: object}]}.';

// La acción se valida aquí solo por nombre; su payload lo revisa ACTION_SCHEMAS al guardar, y un
// paso que no cumple se convierte en paso de la persona en vez de tirar todo el plan.
export const taskPlanSchema = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        kind: z.enum(["persona", "improvement"]),
        action: z.string().max(40).optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(2)
    .max(8),
});

export interface TaskPlanContext {
  title: string;
  notes: string | null;
  dueAt: Date | null;
  record: { appName: string; title: string; stage: string; stages: { key: string; name: string }[] } | null;
}

export function taskPlanPrompt(ctx: TaskPlanContext): string {
  const lines = [`Tarea: ${ctx.title}`];
  if (ctx.notes) lines.push(`Notas: ${ctx.notes}`);
  if (ctx.dueAt) lines.push(`Fecha: ${ctx.dueAt.toISOString()}`);
  if (ctx.record) {
    lines.push(`Registro: ${ctx.record.title} (${ctx.record.appName}), etapa actual: ${ctx.record.stage}`);
    lines.push(`Etapas: ${ctx.record.stages.map((s) => `${s.key} = ${s.name}`).join(", ") || "(ninguna)"}`);
  } else {
    lines.push("Sin registro relacionado.");
  }
  return lines.join("\n");
}
