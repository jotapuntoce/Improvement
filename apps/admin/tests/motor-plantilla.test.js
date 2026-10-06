import { describe, expect, it } from "vitest";
import { PORTADAS, htmlChequeo } from "../lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, EMPRENDEDOR_MUESTRA, contenidoMuestra } from "../lib/motor/muestra.js";

const negocio = (k = contenidoMuestra("creciendo")) => htmlChequeo(CHEQUEO_MUESTRA, k);
const veces = (html, s) => html.split(s).length - 1;

describe("plantilla v2", () => {
  it("cada etapa usa su portada", () => {
    for (const etapa of ["arrancando", "creciendo", "consolidado"]) {
      expect(htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra(etapa))).toContain(PORTADAS[etapa].frase);
    }
    expect(htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"))).toContain(PORTADAS.idea.frase);
  });

  it("la dedicatoria va solo en la portada", () => {
    const k = contenidoMuestra("creciendo");
    expect(veces(negocio(k), k.portada.dedicatoria)).toBe(1);
  });

  it("la página 2 es el texto del dueño, conjugado", () => {
    const tu = negocio();
    expect(tu).toContain("¿Por qué hice esto?");
    expect(tu).toContain("Revisé <b>Café Ejemplo</b> porque mi objetivo es ayudar");
    expect(tu).toContain("Tu negocio tiene el potencial que le viste al inicio.");
    const ustedes = negocio({ ...contenidoMuestra("creciendo"), trato: "ustedes" });
    expect(ustedes).toContain("Su negocio tiene el potencial que le vieron al inicio.");
    expect(ustedes).toContain("me reflejo en su negocio.");
    const idea = htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"));
    expect(idea).toContain("Revisé tu idea porque");
    expect(idea).toContain("Tu idea tiene el potencial que le viste al inicio.");
  });

  it("cada sección abre con su guía y su frase a mano", () => {
    const html = negocio();
    expect(html).toContain('<p class="lead">Tienes algo que no se compra: <span class="hand">gente que quiere volver.</span></p>');
    expect(html).toContain('<span class="hand">Sin costo,</span> y la mayoría en una tarde.');
  });

  it("lo bueno, los síntomas, la receta y lo que no se ve como el original", () => {
    const html = negocio();
    expect(html).toContain("Lo que más conecta con tu gente");
    expect(html).toContain("<em>120</em>");
    expect(html).toContain("Lo que vimos");
    expect(html).toContain("Por qué importa");
    expect(html).toContain("Estimación");
    expect(html).toContain("10 cafés de $60 por día hábil");
    expect(html).toContain("Para dimensionar:");
    expect(html).toContain("¿Qué pasa el día que tú no estás?");
    expect(html).toContain("¿Lo platicamos?");
    expect(html).toContain("WhatsApp 444 849 6561");
  });

  it("escapa el texto de la IA y nunca muestra notas internas", () => {
    const k = contenidoMuestra("creciendo");
    k.bueno.patron = '<script>alert("x")</script>';
    const html = negocio(k);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Respuestas cortas pero cálidas.");
    expect(html).not.toContain("Mensaje mencionando a su abuela.");
  });

  it("el emprendedor ve lo que lo mueve, su idea, sus pasos y el siguiente nivel", () => {
    const html = htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"));
    expect(html).toContain("Lo que te mueve");
    expect(html).toContain("Tus primeros pasos");
    expect(html).toContain("El Kit Arranque");
    expect(veces(html, '<section class="page')).toBe(6);
  });

  it("incrusta los tokens y el monograma", () => {
    const html = negocio();
    expect(html).toContain("--brand-navy");
    expect(html).toContain("data:image/svg+xml;base64,");
    expect(veces(html, '<section class="page')).toBe(6);
  });
});
