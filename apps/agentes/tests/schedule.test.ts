// Cadencia, contrato de tareas con Improvement y cliente HTTP del worker (oficinas-digitales paso 23).
import { describe, expect, it } from "vitest";
import { TAREAS } from "../../improvement/server/agents/tareas.ts";
import { callTarea, readConfig } from "../src/client.ts";
import { TAREAS_WORKER, tareasDue } from "../src/schedule.ts";

describe("contrato", () => {
  it("WHEN se compara TAREAS_WORKER con TAREAS THE SYSTEM SHALL tener el mismo conjunto", () => {
    expect([...TAREAS_WORKER].sort()).toEqual([...TAREAS].sort());
  });
});

describe("tareasDue", () => {
  it("WHEN son las 10:00Z THE SYSTEM SHALL dar las 6; a las 10:07Z solo heartbeat, encargos y butacas", () => {
    expect(tareasDue(new Date("2026-11-18T10:00:00Z"))).toEqual([...TAREAS_WORKER]);
    expect(tareasDue(new Date("2026-11-18T10:07:00Z"))).toEqual(["heartbeat", "encargos", "butacas"]);
  });
});

describe("cliente", () => {
  const config = { baseUrl: "https://imp.example.com", secret: "s3" };

  it("WHEN callTarea corre THE SYSTEM SHALL hacer POST con el bearer a /api/agentes/<tarea>", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    expect(await callTarea(config, "heartbeat", fakeFetch)).toEqual({ tarea: "heartbeat", ok: true, status: 200 });
    expect(calls[0]?.url).toBe("https://imp.example.com/api/agentes/heartbeat");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer s3");
  });

  it("WHEN fetch rechaza THE SYSTEM SHALL devolver ok false sin lanzar", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await callTarea(config, "encargos", failing)).toEqual({ tarea: "encargos", ok: false, status: 0 });
  });

  it("WHEN falta AGENTS_API_SECRET THE SYSTEM SHALL listarla en missing", () => {
    expect(readConfig({ IMPROVEMENT_API_URL: "https://imp.example.com" })).toEqual({ ok: false, missing: ["AGENTS_API_SECRET"] });
    expect(readConfig({ IMPROVEMENT_API_URL: "https://imp.example.com/", AGENTS_API_SECRET: "x" })).toEqual({
      ok: true,
      baseUrl: "https://imp.example.com",
      secret: "x",
    });
  });
});
