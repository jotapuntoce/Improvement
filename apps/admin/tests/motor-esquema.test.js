import { describe, expect, it } from "vitest";
import { contenidoSchema } from "../lib/motor/esquema.js";
import { contenidoMuestra } from "../lib/motor/muestra.js";

describe("contenidoSchema", () => {
  it("acepta la muestra de negocio y la de emprendedor", () => {
    expect(contenidoSchema.safeParse(contenidoMuestra("creciendo")).success).toBe(true);
    expect(contenidoSchema.safeParse(contenidoMuestra("idea")).success).toBe(true);
  });

  it("un emprendedor solo puede ser etapa idea; un negocio nunca", () => {
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("idea"), etapaProspecto: "creciendo" }).success).toBe(false);
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("creciendo"), etapaProspecto: "idea" }).success).toBe(false);
  });

  it("una estimación sin supuesto no pasa", () => {
    const k = contenidoMuestra("creciendo");
    k.patogenos[0] = { ...k.patogenos[0], marca: "estimacion", supuesto: undefined };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });

  it("faltan piezas → no pasa", () => {
    const { pastillas, ...sinPastillas } = contenidoMuestra("creciendo");
    expect(pastillas.length).toBeGreaterThan(0);
    expect(contenidoSchema.safeParse(sinPastillas).success).toBe(false);
  });

  it("una fuente con url que no es http(s) no pasa", () => {
    const k = contenidoMuestra("creciendo");
    k.fuentes[0] = { ...k.fuentes[0], url: "javascript:alert(1)" };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });
});
