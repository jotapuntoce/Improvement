// Prompt de la oficina 2D — export nombrado, nunca inline (regla .claude/rules/ia-gateway.md). Lo usa
// server/office/analyze.ts vía generateStructured, con las fotos del local como imágenes.

export const OFFICE_SYSTEM_PROMPT =
  "Eres quien acomoda la oficina digital de una empresa a partir de fotos de su local. Describe solo lo " +
  "que se ve: espacios, muebles, colores y el logo si aparece. Nunca identifiques personas ni describas " +
  "rostros, aunque salgan en las fotos. Propón de 1 a 12 áreas de trabajo (nombre corto y un color de piso " +
  "en hex #rrggbb) con hasta 6 puestos cada una, un tema de colores opcional y notas breves. Responde SOLO " +
  "con un objeto JSON, sin texto alrededor, con la forma " +
  '{"areas": [{"name": string, "color": "#rrggbb", "seats": [{"title": string}]}], ' +
  '"theme": {"bg": "#rrggbb", "textPrimary": "#rrggbb", "accent1": "#rrggbb", "accent2": "#rrggbb"} | null, ' +
  '"logo": {"present": boolean, "description": string}, "notes": string}. ' +
  "`logo.description` tiene hasta 200 caracteres y `notes` hasta 300.";

export interface OfficePromptContext {
  industryLabel: string | null;
  industryCustom: string | null;
  templateAreas: readonly string[];
  existingAreas: readonly string[];
}

export function buildOfficePrompt(ctx: OfficePromptContext): string {
  const giro = [ctx.industryLabel, ctx.industryCustom].filter(Boolean).join(" — ") || "Sin giro definido";
  const plantilla = ctx.templateAreas.length
    ? `Áreas típicas de este giro (úsalas cuando las fotos lo respalden):\n${ctx.templateAreas.map((a) => `- ${a}`).join("\n")}`
    : "Este giro no tiene plantilla: propón las áreas a partir de las fotos y de la descripción del giro.";
  const existentes = ctx.existingAreas.length
    ? `Áreas que la empresa ya tiene (reúsalas con el mismo nombre si corresponden):\n${ctx.existingAreas.map((a) => `- ${a}`).join("\n")}`
    : "La empresa todavía no tiene áreas.";
  return [`Giro: ${giro}`, "", plantilla, "", existentes, "", "Las fotos del local van adjuntas."].join("\n");
}
