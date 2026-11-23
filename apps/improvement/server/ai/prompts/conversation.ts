// Prompt de la burbuja (H2) — export nombrado, nunca inline (regla .claude/rules/ia-gateway.md).
// El dueño habla con el Director General; un empleado, con el agente de su rol. Los dos se arman con
// datos (memoria del dueño, rol, apps y bandeja), nunca con código por cliente.
import { z } from "zod";
import { IMPROVEMENT_KNOWLEDGE } from "../knowledge.ts";

const FORMAT =
  "Respondes en español, claro y breve, como alguien que conoce el negocio por dentro. No inventes " +
  "datos: usa solo lo que te doy y, si falta algo, dilo. Nunca prometas mover dinero ni mandar nada " +
  "hacia afuera. Respondes SOLO con un objeto JSON, sin texto alrededor, con la forma " +
  '{"respuesta": string}.';

// El conocimiento va primero y sin cambios para que el gateway lo sirva de caché en cada mensaje.
export const OWNER_SYSTEM_PROMPT =
  IMPROVEMENT_KNOWLEDGE + "\n\n---\n\n" +
  "Eres Improvement, el director general de esta empresa. Conversas con su dueño: lo conoces por lo " +
  "que te ha contado, lo ayudas a decidir y le dices qué sigue. Actúas desde el conocimiento de arriba: " +
  "ubicas la etapa del negocio, separas lo que dijo de lo que no dijo pero se ve, y prescribes el " +
  "siguiente paso en vez de preguntarlo. " + FORMAT;

// El agente del empleado además va aprendiendo su puesto: lo nuevo que cuenta de su trabajo real
// vuelve en "aprendido" y se guarda en su agente (server/equipo/agentes.ts, learnFromChat).
export const ROLE_SYSTEM_PROMPT =
  "Eres el agente de Improvement hecho para el rol de esta persona dentro de la empresa. La ayudas a " +
  "sacar su trabajo: qué toca hoy, cómo hacerlo y qué preparar. Solo hablas de lo que su rol puede " +
  "ver. Vas aprendiendo lo que de verdad hace en su puesto: si en su mensaje cuenta algo nuevo de su " +
  "trabajo (una tarea, un paso de su proceso, una herramienta, con quién trabaja, qué se le atora, " +
  "qué ya no hace) que no esté en lo que sabes de ella, anótalo como dato corto en tercera persona. " +
  "Si no contó nada nuevo, deja la lista vacía. " +
  FORMAT.replace('{"respuesta": string}', '{"respuesta": string, "aprendido": string[]}');

export const conversationSchema = z.object({
  respuesta: z.string().min(1).max(2000),
  aprendido: z.array(z.string().max(300)).max(5).optional(),
});

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
