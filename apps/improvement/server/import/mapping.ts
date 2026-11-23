// apps/improvement/server/import/mapping.ts
// Qué columna del archivo va a qué campo de la app. Primero lo propone la IA; si no hay IA, se
// llegó al tope o propone algo inválido, se empareja por nombre. Sin guard: solo lo llama jobs.ts.
import { extractStructured, type SuggestionProvider } from "../ai/gateway.ts";
import { MAP_SYSTEM, mapPrompt, mapSchema } from "../ai/prompts/import.ts";
import { env } from "../../lib/env.ts";
import type { FieldDef } from "../apps/fields.ts";

/** Llave = índice de columna; valor = "titulo", "ignorar" o la llave de un campo. */
export type Mapping = Record<string, string>;

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const TITLE = /^(nombre|cliente|titulo|name|razon social|nombre completo)$/;

export function mapByName(headers: string[], fields: FieldDef[]): Mapping {
  const titleAt = Math.max(0, headers.findIndex((h) => TITLE.test(plain(h))));
  return Object.fromEntries(
    headers.map((h, i) => {
      if (i === titleAt) return [String(i), "titulo"];
      const f = fields.find((f) => plain(f.label) === plain(h) || plain(f.key) === plain(h));
      return [String(i), f?.key ?? "ignorar"];
    }),
  );
}

/** Exactamente un "titulo", cada columna presente y solo llaves de campos que existen. */
export function isValidMapping(m: Mapping, headers: string[], fields: FieldDef[]): boolean {
  const keys = new Set(["titulo", "ignorar", ...fields.map((f) => f.key)]);
  return (
    headers.every((_, i) => keys.has(m[String(i)] ?? "")) &&
    Object.keys(m).length === headers.length &&
    Object.values(m).filter((v) => v === "titulo").length === 1
  );
}

export async function mapWithAi(orgId: string, headers: string[], rows: string[][], fields: FieldDef[], provider?: SuggestionProvider): Promise<Mapping | null> {
  if (!provider && !env.ANTHROPIC_API_KEY) return null;
  const r = await extractStructured({
    orgId,
    purpose: "importacion_mapeo",
    system: MAP_SYSTEM,
    prompt: mapPrompt(headers, rows.slice(0, 5), fields),
    schema: mapSchema,
    maxTokens: 4096,
    provider,
  }).catch(() => null);
  return r?.ok && isValidMapping(r.data.parsed.mapping, headers, fields) ? r.data.parsed.mapping : null;
}
