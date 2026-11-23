// Prompts de la importación — export nombrado, nunca inline en el call site (regla
// .claude/rules/ia-gateway.md). Los usa server/import/** vía extractStructured.
import { z } from "zod";

// ── Leer la tabla de un PDF o una foto ───────────────────────────────────────────────────────────

export const READ_TABLE_SYSTEM =
  "Lees documentos de negocios pequeños (listas de clientes, pedidos, inventarios, libretas " +
  "fotografiadas) y sacas su tabla principal. Una fila por registro; las celdas como texto, tal " +
  "cual se ven, sin inventar ni completar nada. Si una celda no se lee, va vacía. Respondes SOLO " +
  'con un objeto JSON, sin texto alrededor, con la forma {"headers": string[], "rows": string[][]}. ' +
  "Si el documento no trae encabezados, nómbralos tú por lo que contienen.";

export const readTableSchema = z.object({
  headers: z.array(z.string().max(120)).min(1).max(60),
  rows: z.array(z.array(z.string().max(2000)).max(60)).max(5000),
});

export function readTablePrompt(fileName: string): string {
  return `Archivo: ${fileName}\nDevuelve su tabla principal.`;
}

// ── Proponer el mapeo de columnas a campos ───────────────────────────────────────────────────────

export const MAP_SYSTEM =
  "Ayudas al dueño de un negocio a importar una hoja a su sistema. Para cada columna decides a " +
  'qué campo va: "titulo" (el nombre del registro; exactamente una columna), la llave de un ' +
  'campo existente, o "ignorar" si no corresponde a ninguno. Te guías por el encabezado y por los ' +
  "valores de ejemplo. Respondes SOLO con un objeto JSON, sin texto alrededor, con la forma " +
  '{"mapping": {"<índice de columna>": "titulo" | "<llave>" | "ignorar"}}.';

export const mapSchema = z.object({ mapping: z.record(z.string().regex(/^\d+$/), z.string().min(1).max(60)) });

export interface MapField { key: string; label: string; type: string; options: string[] }

export function mapPrompt(headers: string[], sample: string[][], fields: MapField[]): string {
  const cols = headers.map((h, i) => `${i}. ${h} — ejemplos: ${sample.map((r) => r[i] ?? "").filter(Boolean).slice(0, 5).join(" | ") || "(vacío)"}`);
  const campos = fields.length
    ? fields.map((f) => `- ${f.key}: ${f.label} (${f.type}${f.options.length ? `: ${f.options.join(", ")}` : ""})`)
    : ["- (la app no tiene campos extra; solo el nombre del registro)"];
  return ["Columnas:", ...cols, "", "Campos de la app:", ...campos].join("\n");
}
