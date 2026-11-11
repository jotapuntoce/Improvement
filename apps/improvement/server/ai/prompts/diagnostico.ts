// Prompt del primer análisis de Improvement (arranque): con lo que el dueño contó de su negocio y del
// resultado que espera de su ERP/CRM, arma el diagnóstico 360° inicial — lo que dijo, lo que no dijo
// pero se ve y lo que falta saber — y las necesidades con severidad. Export nombrado, nunca inline
// (regla .claude/rules/ia-gateway.md).
import { z } from "zod";
import { IMPROVEMENT_KNOWLEDGE } from "../knowledge.ts";

export const DIAGNOSTICO_SYSTEM_PROMPT =
  IMPROVEMENT_KNOWLEDGE + "\n\n---\n\n" +
  "Eres Improvement, el director general de esta empresa. El dueño acaba de contarte cómo está su " +
  "negocio y qué espera ver en su ERP/CRM. Haz el primer análisis aplicando el conocimiento de arriba: " +
  "ubica la etapa, recorre las áreas de las que hay algo que decir y separa en cada una lo que dijo, lo " +
  "que no dijo pero se ve y lo que falta saber. Convierte los hallazgos en necesidades con severidad " +
  "(1 leve, 2 moderada, 3 crítica) y fuente ('dueno' si él lo dijo, 'improvement' si lo deduces tú). " +
  "No inventes números ni datos: si algo falta, va en 'faltaSaber'. Habla de tú, en español claro y " +
  "breve. Respondes SOLO con un objeto JSON, sin texto alrededor, con la forma " +
  '{"resumen": string, "etapa": "nano"|"micro"|"pequena"|"mediana"|"grande", "industrial": boolean, ' +
  '"areas": [{"area": string, "dijo": string, "seVe": string, "faltaSaber": string}], ' +
  '"necesidades": [{"titulo": string, "detalle": string, "severidad": 1|2|3, "fuente": "dueno"|"improvement"}], ' +
  '"siguientePaso": string}.';

const texto = (max: number) => z.string().trim().max(max);

export const diagnosticoSchema = z.object({
  resumen: texto(1200).min(1),
  etapa: z.enum(["nano", "micro", "pequena", "mediana", "grande"]),
  industrial: z.boolean(),
  areas: z
    .array(z.object({ area: texto(60).min(1), dijo: texto(600), seVe: texto(600), faltaSaber: texto(600) }))
    .max(13),
  necesidades: z
    .array(z.object({
      titulo: texto(120).min(1),
      detalle: texto(800),
      severidad: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      fuente: z.enum(["dueno", "improvement"]),
    }))
    .max(12),
  siguientePaso: texto(600).min(1),
});
export type Diagnostico = z.infer<typeof diagnosticoSchema>;

export interface DiagnosticoContext {
  negocio: { nombre: string; giro: string | null; equipo: string | null; ciudad: string | null };
  /** Lo que el dueño contestó, pregunta y respuesta. */
  respuestas: { question: string; answer: string }[];
}

export function buildDiagnosticoPrompt(ctx: DiagnosticoContext): string {
  const { nombre, giro, equipo, ciudad } = ctx.negocio;
  return [
    `Negocio: ${nombre}`,
    `Giro: ${giro ?? "(sin decir)"} · Equipo: ${equipo ?? "(sin decir)"} · Ciudad: ${ciudad ?? "(sin decir)"}`,
    `Lo que contó el dueño:\n${ctx.respuestas.map((r) => `- ${r.question}\n  "${r.answer}"`).join("\n") || "(nada todavía)"}`,
  ].join("\n\n");
}
