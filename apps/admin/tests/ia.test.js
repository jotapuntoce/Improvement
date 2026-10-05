import { describe, expect, it } from "vitest";
import { costoUsd, extraerJson, investigar } from "../lib/ia.js";

const respuesta = (stop_reason, content, extra = {}) => ({
  stop_reason,
  content,
  model: "claude-opus-5-5",
  usage: { input_tokens: 1000, output_tokens: 500, server_tool_use: { web_search_requests: 1, web_fetch_requests: 2 } },
  ...extra,
});
const falso = (...respuestas) => {
  const llamadas = [];
  return {
    llamadas,
    beta: {
      messages: {
        stream: (params) => {
          llamadas.push(structuredClone(params));
          const r = respuestas.shift();
          return { finalMessage: async () => r };
        },
      },
    },
  };
};

describe("ia", () => {
  it("extraerJson tolera cercas de código y texto alrededor", () => {
    expect(extraerJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extraerJson('Listo: {"a":{"b":2}} gracias')).toEqual({ a: { b: 2 } });
    expect(extraerJson("sin json")).toBeNull();
  });

  it("costoUsd usa el precio de Opus 5.5", () => {
    expect(costoUsd({ input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 })).toBe(24);
  });

  it("continúa en pause_turn y suma el uso de cada vuelta", async () => {
    const a = falso(
      respuesta("pause_turn", [{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }]),
      respuesta("end_turn", [{ type: "text", text: "pensando" }, { type: "text", text: '{"ok":1}' }]),
    );
    const r = await investigar({ sistema: "S", mensajes: [{ role: "user", content: "hola" }] }, { anthropic: a });
    expect(r.ok).toBe(true);
    expect(r.data.texto).toBe('{"ok":1}');
    expect(r.uso).toMatchObject({ input: 2000, output: 1000, busquedas: 2, paginas: 4 });
    expect(a.llamadas[1].messages.at(-1).role).toBe("assistant"); // la vuelta 2 lleva lo que pausó
  });

  it("refusal y max_tokens son errores tipados", async () => {
    const r1 = await investigar({ sistema: "S", mensajes: [] }, { anthropic: falso(respuesta("refusal", [], { stop_details: { category: "cyber" } })) });
    expect(r1.error.code).toBe("RECHAZO");
    const r2 = await investigar({ sistema: "S", mensajes: [] }, { anthropic: falso(respuesta("max_tokens", [])) });
    expect(r2.error.code).toBe("MUY_LARGO");
    const r3 = await investigar({ sistema: "S", mensajes: [] }, { anthropic: falso(respuesta("model_context_window_exceeded", [])) });
    expect(r3.error.code).toBe("MUY_LARGO");
  });

  it("una excepción del proveedor no se lanza", async () => {
    const a = { beta: { messages: { stream: () => ({ finalMessage: async () => { throw new Error("red"); } }) } } };
    const r = await investigar({ sistema: "S", mensajes: [] }, { anthropic: a });
    expect(r).toMatchObject({ ok: false, error: { code: "PROVEEDOR" } });
  });
});
