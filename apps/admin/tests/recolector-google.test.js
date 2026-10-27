import { describe, expect, it } from "vitest";
import { recolectarGoogle } from "../lib/motor/recolector/google.js";

const ENV = { GOOGLE_PLACES_API_KEY: "llave" };
const PLACE = {
  displayName: { text: "Boreal club de Padel" },
  formattedAddress: "Cordillera Central 252, San Luis Potosí",
  rating: 4.8,
  userRatingCount: 10,
  googleMapsUri: "https://maps.google.com/?cid=1",
  reviews: [
    { rating: 5, text: { text: "x" }, originalText: { text: "el mejor  lugar\nde padel" }, authorAttribution: { displayName: "Anapao Padilla" }, relativePublishTimeDescription: "hace 3 meses" },
  ],
};
const responde = (cuerpo) => {
  const f = async (u, opts) => ((f.llamada = { u, opts }), { json: async () => cuerpo });
  return f;
};

describe("google", () => {
  it("resume calificación, opiniones y reseñas en su idioma original", async () => {
    const f = responde({ places: [PLACE] });
    const r = await recolectarGoogle("Boreal, San Luis Potosí", { fetch: f, env: ENV });
    expect(r.data).toMatchObject({ calificacion: 4.8, opiniones: 10, nombre: "Boreal club de Padel" });
    expect(r.data.resenas[0]).toEqual({ autor: "Anapao Padilla", estrellas: 5, texto: "el mejor lugar de padel", cuando: "hace 3 meses" });
    expect(f.llamada.opts.headers["X-Goog-Api-Key"]).toBe("llave");
    expect(JSON.parse(f.llamada.opts.body).textQuery).toBe("Boreal, San Luis Potosí");
  });

  it("sin llave, sin consulta, sin resultado o con error: motivo sin la llave", async () => {
    expect((await recolectarGoogle("x", { env: {} })).motivo).toMatch(/GOOGLE_PLACES_API_KEY/);
    expect((await recolectarGoogle(undefined, { env: ENV })).ok).toBe(false);
    expect((await recolectarGoogle("x", { fetch: responde({}), env: ENV })).motivo).toMatch(/no encontró/);
    const r = await recolectarGoogle("x", { fetch: responde({ error: { message: "API key not valid" } }), env: ENV });
    expect(r.motivo).toMatch(/API key not valid/);
    expect(r.motivo).not.toContain("llave");
  });
});
