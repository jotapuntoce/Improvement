// Único import de @anthropic-ai/sdk en apps/admin (regla .claude/rules/ia-gateway.md: un gateway por app; admin no
// puede importar de apps/improvement). Server-only. Spec: docs/superpowers/specs/2026-10-05-motor-chequeo-design.md.
import Anthropic from "@anthropic-ai/sdk";

// Confirmado con la skill claude-api el 2026-10-05: claude-opus-5-5, $4 / $20 por millón de tokens de entrada /
// salida, lectura de caché $0.20, escritura $5 (1.25× la entrada). Nunca escribir el id en otro lado.
export const MODELO = "claude-opus-5-5";
const PRECIO = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const HERRAMIENTAS = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: { type: "approximate", country: "MX" } },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
];
const MAX_CONTINUACIONES = 3;

let cliente;
const elCliente = () => (cliente ??= new Anthropic()); // ANTHROPIC_API_KEY del entorno

/** Dólares a partir del uso que reporta el proveedor (las búsquedas web se cobran aparte y solo se cuentan). */
export const costoUsd = (u) =>
  Math.round(((u.input * PRECIO.input + u.output * PRECIO.output + u.cacheRead * PRECIO.cacheRead + u.cacheWrite * PRECIO.cacheWrite) / 1e6) * 1e6) / 1e6;

function sumarUso(uso, u = {}) {
  uso.input += u.input_tokens ?? 0;
  uso.output += u.output_tokens ?? 0;
  uso.cacheRead += u.cache_read_input_tokens ?? 0;
  uso.cacheWrite += u.cache_creation_input_tokens ?? 0;
  uso.busquedas += u.server_tool_use?.web_search_requests ?? 0;
  uso.paginas += u.server_tool_use?.web_fetch_requests ?? 0;
}

/** El primer objeto JSON del texto, aunque venga entre cercas de código o con una frase alrededor. */
export function extraerJson(texto) {
  const ini = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (ini < 0 || fin < ini) return null;
  try {
    return JSON.parse(texto.slice(ini, fin + 1));
  } catch {
    return null;
  }
}

function mensajeDeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Falta o es inválida la ANTHROPIC_API_KEY del panel.";
  if (e instanceof Anthropic.RateLimitError) return "La IA está saturada; reintenta en unos minutos.";
  if (e instanceof Anthropic.APIError) return `La IA respondió ${e.status}: ${e.message}`;
  return `No se pudo llamar a la IA: ${e?.message ?? e}`;
}

/**
 * Una investigación con búsqueda y lectura web del lado de Anthropic. Sigue en `pause_turn` (hasta 3 veces) y devuelve
 * el último bloque de texto. Nunca lanza. `anthropic` se inyecta en pruebas.
 */
export async function investigar({ sistema, mensajes }, { anthropic } = {}) {
  const messages = [...mensajes];
  const uso = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, busquedas: 0, paginas: 0 };
  try {
    const api = anthropic ?? elCliente();
    for (let vuelta = 0; vuelta <= MAX_CONTINUACIONES; vuelta++) {
      const r = await api.beta.messages
        .stream({
          model: MODELO,
          max_tokens: 64000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "high" },
          system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
          messages,
          tools: HERRAMIENTAS,
        })
        .finalMessage();
      sumarUso(uso, r.usage);
      messages.push({ role: "assistant", content: r.content });
      if (r.stop_reason === "pause_turn") continue;
      if (r.stop_reason === "refusal") {
        return { ok: false, error: { code: "RECHAZO", mensaje: `La IA no quiso armarlo (${r.stop_details?.category ?? "sin categoría"}).` }, uso };
      }
      if (r.stop_reason === "max_tokens") return { ok: false, error: { code: "MUY_LARGO", mensaje: "La respuesta se cortó por larga." }, uso };
      const texto = r.content.filter((b) => b.type === "text").at(-1)?.text ?? "";
      return { ok: true, data: { texto, mensajes: messages, modelo: r.model }, uso };
    }
    return { ok: false, error: { code: "SIN_TERMINAR", mensaje: "La investigación no terminó en 4 vueltas." }, uso };
  } catch (e) {
    return { ok: false, error: { code: "PROVEEDOR", mensaje: mensajeDeError(e) }, uso };
  }
}
