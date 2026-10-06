import { describe, expect, it } from "vitest";
import { contenidoSchema } from "../lib/motor/esquema.js";
import { contenidoMuestra } from "../lib/motor/muestra.js";

describe("contenidoSchema v2", () => {
  it("acepta las muestras de negocio y de emprendedor", () => {
    expect(contenidoSchema.safeParse(contenidoMuestra("creciendo")).success).toBe(true);
    expect(contenidoSchema.safeParse(contenidoMuestra("idea")).success).toBe(true);
  });

  it("un emprendedor solo puede ser etapa idea; un negocio nunca", () => {
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("idea"), etapaProspecto: "creciendo" }).success).toBe(false);
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("creciendo"), etapaProspecto: "idea" }).success).toBe(false);
  });

  it("un síntoma estimado sin supuesto no pasa", () => {
    const k = contenidoMuestra("creciendo");
    k.sintomas.items[0] = { ...k.sintomas.items[0], marca: "estimacion", supuesto: undefined };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });

  it("trato solo tu o ustedes; la guía lleva su frase a mano", () => {
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("creciendo"), trato: "usted" }).success).toBe(false);
    const k = contenidoMuestra("creciendo");
    k.bueno.guia = { texto: "Solo texto" };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });

  it("de 3 a 5 preguntas en lo que no se ve", () => {
    const k = contenidoMuestra("creciendo");
    k.noSeVe.preguntas = ["¿Una?"];
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });

  it("una fuente que no es http(s) no pasa", () => {
    const k = { ...contenidoMuestra("creciendo"), fuentes: [{ url: "javascript:alert(1)", que: "x" }] };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });
});
