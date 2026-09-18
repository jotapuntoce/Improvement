// Plantilla del prompt del agente revisor — export nombrado, nunca inline en gateway.ts (regla
// .claude/rules/ia-gateway.md).
//
// Qué revisa y qué NO revisa, porque es la parte que se puede desviar sola:
//
// Revisa si lo entregado corresponde a lo que se pidió. Nada más. No califica esfuerzo, no compara
// personas, no mide productividad y no opina de quien lo hizo — no recibe su nombre siquiera. El
// producto ya prohíbe que nadie lea el nivel de responsabilidad de otro (no negociable #4); un
// revisor que emitiera juicios sobre la persona abriría esa misma puerta por otro lado.
//
// Y su veredicto NO quita puntos. Los puntos ya se pagaron al completarse. Una revisión rechazada
// le dice al dueño y a quien lo hizo que falta algo, no les cobra una multa: un sistema que quita
// lo ya ganado enseña a no entregar evidencia, que es lo contrario de lo que se busca.
import { z } from "zod";

export const reviewSchema = z.object({
  verdict: z.enum(["aprobada", "rechazada"]),
  note: z.string().min(1).max(400),
});

export type Review = z.infer<typeof reviewSchema>;

export interface ReviewContext {
  title: string;
  description: string | null;
  /** Qué clase de evidencia se pidió: un enlace, una nota, un número, un archivo. */
  evidenceLabel: string;
  evidenceValue: string;
  /** La necesidad de la empresa que este objetivo atendía, si atendía alguna. */
  needTitle: string | null;
}

export const REVIEW_SYSTEM_PROMPT =
  "Eres el revisor de entregas de Improvement, el producto de JotaPuntoCe. Recibes un objetivo de " +
  "una empresa y la evidencia que alguien entregó para darlo por terminado. Tu única pregunta es: " +
  "¿esta evidencia corresponde a lo que se pidió? Responde en español, con una nota breve y " +
  "concreta dirigida a la persona que lo entregó. Reglas que no rompes: no juzgas a la persona, no " +
  "hablas de su esfuerzo ni de su productividad, no la comparas con nadie, y si rechazas dices " +
  "exactamente qué falta para que se pueda corregir. Ante la duda apruebas: un rechazo sin razón " +
  "clara hace más daño que una entrega floja que pasa. Responde ÚNICAMENTE con un objeto JSON de " +
  'la forma {"verdict": "aprobada" | "rechazada", "note": string} — sin texto fuera del JSON.';

export function buildReviewPrompt(c: ReviewContext): string {
  return [
    "Objetivo:",
    c.title,
    c.description ? `Detalle: ${c.description}` : "",
    "",
    `Lo que se pidió entregar: ${c.evidenceLabel}`,
    "Lo que se entregó:",
    c.evidenceValue,
    "",
    c.needTitle
      ? `Este objetivo atendía esta necesidad de la empresa: ${c.needTitle}`
      : "Este objetivo no atendía ninguna necesidad registrada.",
  ]
    .filter(Boolean)
    .join("\n");
}
