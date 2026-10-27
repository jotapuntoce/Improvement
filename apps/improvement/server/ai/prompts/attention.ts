// Prompt de atención al cliente — export nombrado, nunca inline en el call site (regla
// .claude/rules/ia-gateway.md). Lo usa server/crm/attention.ts vía generateStructured.
import { z } from "zod";

export const ATTENTION_SYSTEM_PROMPT =
  "Eres el asesor de servicio al cliente de esta empresa. Con lo que el cliente dijo que espera " +
  "(su hiperpersonalización) y sus tratos, propones cómo atenderlo hoy y detectas si se está " +
  "incumpliendo lo que espera. Respondes SOLO con un objeto JSON, sin texto alrededor, con la forma " +
  '{"suggestionText": string, "expectativaIncumplida": boolean, "motivo": string | null}. ' +
  "`motivo` explica en una frase qué expectativa se incumple, o es null si ninguna.";

export const attentionSchema = z.object({
  suggestionText: z.string().min(1).max(1200),
  expectativaIncumplida: z.boolean(),
  motivo: z.string().max(500).nullable(),
});

export type Attention = z.infer<typeof attentionSchema>;

export interface AttentionContext {
  clientName: string;
  healthStatus: string;
  answers: { question: string; answer: string }[];
  deals: { title: string; stage: string }[];
}

export function buildAttentionPrompt(ctx: AttentionContext): string {
  const answers = ctx.answers.map((a) => `- ${a.question} ${a.answer}`).join("\n");
  const deals = ctx.deals.length ? ctx.deals.map((d) => `- ${d.title} (${d.stage})`).join("\n") : "- Sin tratos";
  return [
    `Cliente: ${ctx.clientName} (estado: ${ctx.healthStatus})`,
    "",
    "Lo que el cliente dijo que espera:",
    answers,
    "",
    "Sus tratos:",
    deals,
  ].join("\n");
}
