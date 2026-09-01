// Plantilla del prompt de sugerencias — export nombrado, nunca inline en gateway.ts (regla
// .claude/rules/ia-gateway.md: "No repitas el prompt como una cadena inline en la ruta API").
import { z } from "zod";

export type SuggestionCategory = "upgrade" | "servicio_cliente";

// Todo lo que persiste en ai_suggestion.based_on son ids de filas del org, nunca contenido libre
// (comentario del esquema en packages/db/src/schema.ts) — el modelo solo ve nombres/estados, la
// app decide qué ids quedan como evidencia.
export interface SuggestionContext {
  category: SuggestionCategory;
  areas: { id: string; name: string }[];
  objectives: { id: string; title: string; status: string; impactWeight: number }[];
  clients: { id: string; name: string; healthStatus: string }[];
}

export const suggestionSchema = z.object({
  suggestionText: z.string().min(1),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

const CATEGORY_LABEL: Record<SuggestionCategory, string> = {
  upgrade: "una mejora operativa o de crecimiento para el negocio",
  servicio_cliente: "una acción concreta de servicio al cliente",
};

export const SUGGESTION_SYSTEM_PROMPT =
  "Eres el asesor de negocio de Improvement, el producto de JotaPuntoCe. Analizas el estado " +
  "actual de una empresa cliente (áreas, objetivos, clientes) y propones una sola sugerencia " +
  "concreta y accionable, en español, dirigida al dueño del negocio. Responde ÚNICAMENTE con un " +
  'objeto JSON de la forma {"suggestionText": string} — sin texto antes, después, ni fuera del JSON.';

export function buildSuggestionPrompt(context: SuggestionContext): string {
  const areasList = context.areas.map((a) => `- ${a.name}`).join("\n") || "(sin áreas registradas)";
  const objectivesList =
    context.objectives
      .map((o) => `- ${o.title} (peso ${o.impactWeight}, estado: ${o.status})`)
      .join("\n") || "(sin objetivos registrados)";
  const clientsList =
    context.clients.map((c) => `- ${c.name} (salud: ${c.healthStatus})`).join("\n") ||
    "(sin clientes registrados)";

  return [
    `Genera ${CATEGORY_LABEL[context.category]} para esta empresa.`,
    "",
    "Áreas:",
    areasList,
    "",
    "Objetivos:",
    objectivesList,
    "",
    "Clientes:",
    clientsList,
  ].join("\n");
}
