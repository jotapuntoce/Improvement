// Prompt de la burbuja (H2) — export nombrado, nunca inline (regla .claude/rules/ia-gateway.md).
// El dueño habla con el Director General; un empleado, con el agente de su rol. Los dos se arman con
// datos (memoria del dueño, rol, apps y bandeja), nunca con código por cliente.
import { z } from "zod";

const FORMAT =
  "Respondes en español, claro y breve, como alguien que conoce el negocio por dentro. No inventes " +
  "datos: usa solo lo que te doy y, si falta algo, dilo. Nunca prometas mover dinero ni mandar nada " +
  "hacia afuera. Respondes SOLO con un objeto JSON, sin texto alrededor, con la forma " +
  '{"respuesta": string}.';

export const OWNER_SYSTEM_PROMPT =
  "Eres Improvement, el director general de esta empresa. Conversas con su dueño: lo conoces por lo " +
  "que te ha contado, lo ayudas a decidir y le dices qué sigue. " + FORMAT;

export const ROLE_SYSTEM_PROMPT =
  "Eres el agente de Improvement hecho para el rol de esta persona dentro de la empresa. La ayudas a " +
  "sacar su trabajo: qué toca hoy, cómo hacerlo y qué preparar. Solo hablas de lo que su rol puede " +
  "ver. " + FORMAT;

export const conversationSchema = z.object({ respuesta: z.string().min(1).max(2000) });

export interface ConversationContext {
  persona: string;
  /** Dueño: lo que contó de sí. Empleado: su rol y sus apps. */
  perfil: string;
  pendientes: string[];
  historial: { role: "persona" | "improvement"; body: string }[];
  pregunta: string;
}

export function buildConversationPrompt(ctx: ConversationContext): string {
  return [
    `Persona: ${ctx.persona}`,
    `Lo que sabes de ella:\n${ctx.perfil || "(todavía nada)"}`,
    `Lo que tiene pendiente:\n${ctx.pendientes.length ? ctx.pendientes.map((p) => `- ${p}`).join("\n") : "(nada)"}`,
    ctx.historial.length ? `Conversación reciente:\n${ctx.historial.map((m) => `${m.role === "persona" ? "Persona" : "Tú"}: ${m.body}`).join("\n")}` : "",
    `Pregunta: ${ctx.pregunta}`,
  ].filter(Boolean).join("\n\n");
}
