// HTML → PDF con Chromium sin pantalla: la misma impresión del navegador con la que se hizo el Chequeo de Boreal.
// ponytail: un Chromium por PDF; si llegan muchos a la vez, reusar un navegador abierto.
import { chromium } from "playwright-core";

export async function aPdf(html) {
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: "networkidle" });
    return await pagina.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await navegador.close();
  }
}
