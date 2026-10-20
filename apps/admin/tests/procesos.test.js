import { describe, expect, it } from "vitest";
import path from "node:path";
import { listProyectos, resolveArchivo } from "@/lib/procesos.js";

const BASE = path.join(__dirname, "..", "procesos");

describe("expedientes de proceso", () => {
  it("WHEN se pide un archivo fuera de procesos/ THE SYSTEM SHALL negarlo", () => {
    expect(resolveArchivo(["..", "lib", "db.js"], BASE)).toBeNull();
    expect(resolveArchivo(["jotapuntoce", "..", "..", ".env.local"], BASE)).toBeNull();
    expect(resolveArchivo([path.resolve(BASE, "..", "package.json")], BASE)).toBeNull();
  });

  it("WHEN se pide un archivo real de un expediente THE SYSTEM SHALL resolverlo", () => {
    expect(resolveArchivo(["jotapuntoce", "2026-09-25-admin-marca", "bitacora.md"], BASE)).toBe(
      path.join(BASE, "jotapuntoce", "2026-09-25-admin-marca", "bitacora.md"),
    );
  });

  it("WHEN hay carpetas de proyecto THE SYSTEM SHALL listarlas con su estilo y conteo", () => {
    const jpc = listProyectos(BASE).find((p) => p.slug === "jotapuntoce");
    expect(jpc).toMatchObject({ nombre: "JotaPuntoCe", estilo: "jotapuntoce" });
    expect(jpc.total).toBeGreaterThanOrEqual(1);
  });
});
