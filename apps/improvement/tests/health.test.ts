// tests/health.test.ts — criterio #1 (GET /api/health) es integración real contra Supabase para el
// caso feliz, y un ping simulado para el caso caído (nunca se apaga la base de verdad). Los
// criterios #2 y #3 (logger) son funciones puras, sin DB.
import { afterEach, describe, expect, it, vi } from "vitest";
import { log, newRequestId } from "../lib/logger.ts";
import { GET } from "../app/api/health/route.ts";

describe("GET /api/health", () => {
  it("WHEN la base de datos responde THE SYSTEM SHALL devolver 200 con db: up", async () => {
    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db).toBe("up");
  });

  it(
    "WHEN se detiene la conectividad a la base de datos (simulado con un cliente que lanza) " +
      "THE SYSTEM SHALL responder /api/health con status distinto de 200",
    async () => {
      const res = await GET(new Request("http://localhost/api/health"), {
        ping: async () => {
          throw new Error("conexión simulada caída");
        },
      });

      expect(res.status).not.toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.db).toBe("down");
    },
  );
});

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("WHEN se registra un evento con un campo token THE SYSTEM SHALL imprimir \"[redacted]\" en vez del valor real", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    log("test_event", { token: "super-secreto-real", other: "visible" });

    expect(spy).toHaveBeenCalledTimes(1);
    const printed = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(printed.token).toBe("[redacted]");
    expect(printed.other).toBe("visible");
  });

  it("WHEN dos líneas de log se generan dentro de la misma request THE SYSTEM SHALL compartir el mismo request_id", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const requestId = newRequestId();

    log("request_started", { request_id: requestId });
    log("request_finished", { request_id: requestId });

    expect(spy).toHaveBeenCalledTimes(2);
    const first = JSON.parse(spy.mock.calls[0]?.[0] as string);
    const second = JSON.parse(spy.mock.calls[1]?.[0] as string);
    expect(first.request_id).toBe(requestId);
    expect(second.request_id).toBe(requestId);
  });
});
