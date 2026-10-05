import { describe, expect, it } from "vitest";
import { PORTADAS, htmlChequeo } from "../lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, EMPRENDEDOR_MUESTRA, contenidoMuestra } from "../lib/motor/muestra.js";

describe("plantilla", () => {
  it("cada etapa usa su portada", () => {
    for (const etapa of ["arrancando", "creciendo", "consolidado"]) {
      expect(htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra(etapa))).toContain(PORTADAS[etapa].frase);
    }
    expect(htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"))).toContain(PORTADAS.idea.frase);
  });

  it("escapa el texto de la IA", () => {
    const k = { ...contenidoMuestra("creciendo"), porQue: '<script>alert("x")</script>' };
    const html = htmlChequeo(CHEQUEO_MUESTRA, k);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("las notas internas y las fuentes nunca van al PDF", () => {
    const html = htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo"));
    expect(html).not.toContain("Respuestas cortas pero cálidas.");
    expect(html).not.toContain("Mensaje mencionando a su abuela.");
  });

  it("marca dato y estimación con su supuesto", () => {
    const html = htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo"));
    expect(html).toContain("Estimación");
    expect(html).toContain("10 cafés de $60 por día hábil");
  });

  it("el emprendedor ve su idea, sus pasos y el siguiente nivel", () => {
    const html = htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"));
    expect(html).toContain("Tus primeros pasos");
    expect(html).toContain("El Kit Arranque");
  });

  it("incrusta los tokens y el monograma, sin depender de archivos externos salvo las fuentes", () => {
    const html = htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo"));
    expect(html).toContain("--brand-navy");
    expect(html).toContain("data:image/svg+xml;base64,");
  });
});
