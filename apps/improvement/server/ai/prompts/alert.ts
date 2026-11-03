// Prompt de "Explícame" en una alerta — export nombrado, nunca inline (regla .claude/rules/ia-gateway.md).
// Los números ya vienen calculados por las reglas de server/insights/alerts.ts: la IA solo redacta.
import { z } from "zod";

export const ALERT_SYSTEM_PROMPT =
  "Eres el director general de esta empresa. Te paso una alerta que ya detectaron las reglas, con sus " +
  "números. Explica en español claro y breve por qué importa, qué está en juego y qué hacer hoy. No " +
  "inventes cifras: usa solo las que te doy. Respondes SOLO con un objeto JSON, sin texto alrededor, " +
  'con la forma {"porque": string, "enJuego": string, "queHacer": string}.';

export const alertSchema = z.object({
  porque: z.string().min(1).max(600),
  enJuego: z.string().min(1).max(400),
  queHacer: z.string().min(1).max(600),
});
export type AlertExplanation = z.infer<typeof alertSchema>;

export interface AlertContext { title: string; detail: string; amount: string | null; days: number }

export function buildAlertPrompt(ctx: AlertContext): string {
  return [
    `Alerta: ${ctx.title}`,
    `Detalle: ${ctx.detail}`,
    `Días: ${ctx.days}`,
    `Dinero en juego: ${ctx.amount ?? "no aplica"}`,
  ].join("\n");
}

export const alertText = (a: AlertExplanation) => `${a.porque}\n\nEn juego: ${a.enJuego}\n\nQué hacer: ${a.queHacer}`;
