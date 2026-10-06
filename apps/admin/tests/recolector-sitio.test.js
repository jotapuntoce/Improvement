import { describe, expect, it } from "vitest";
import { recolectarSitio } from "../lib/motor/recolector/sitio.js";

// Un sitio de mentira servido por Chromium mismo: nunca sale a internet.
const PAGINAS = {
  "/": `<html><body><nav><a href="/precios">Precios</a><a href="/torneos">Torneos</a><a href="/roto">Clínicas</a><a href="/">Instagram</a><a href="/">Inicio</a></nav><h1>Club de prueba</h1><div style="width:900px">ancho fijo</div></body></html>`,
  "/precios": `<html><head><title>Precios</title></head><body>Cancha $400 por hora y media. Clase $200.</body></html>`,
  "/torneos": `<html><body>Muy pronto, en este feed encontrarás cada torneo.</body></html>`,
};
const servir = (ctx) =>
  ctx.route("https://prueba.test/**", (route) => {
    const ruta = new URL(route.request().url()).pathname;
    const html = PAGINAS[ruta];
    return html ? route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }) : route.fulfill({ status: 404, body: "no" });
  });

describe("recolectarSitio", () => {
  it("encuentra precios, pendientes, enlaces rotos, enlaces que regresan al inicio y el desborde en celular", async () => {
    const r = await recolectarSitio("https://prueba.test/", { alPrepararContexto: servir });
    expect(r.ok).toBe(true);
    const precios = r.data.paginas.find((p) => p.url.endsWith("/precios"));
    expect(precios.precios).toEqual(["$400", "$200"]);
    expect(r.data.paginas.find((p) => p.url.endsWith("/torneos")).pendientes).toEqual(["Muy pronto"]);
    expect(r.data.enlacesRotos).toEqual([{ texto: "Clínicas", href: "https://prueba.test/roto", status: 404 }]);
    expect(r.data.regresanAlInicio).toEqual([{ texto: "Instagram", href: "https://prueba.test/" }]);
    expect(r.data.celular.seSaleDeLado).toBe(true);
  }, 60_000);

  it("un sitio que no abre es un motivo, no una excepción", async () => {
    const r = await recolectarSitio("https://prueba.test/nada", { alPrepararContexto: servir });
    expect(r).toEqual({ ok: false, motivo: "El sitio respondió 404." });
  }, 60_000);
});
