import { describe, expect, it } from "vitest";
import { aPdf } from "../lib/motor/pdf.js";
import { htmlChequeo } from "../lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, contenidoMuestra } from "../lib/motor/muestra.js";

describe("pdf", () => {
  it("imprime la plantilla a un PDF de varias páginas", async () => {
    const pdf = await aPdf(htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo")));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(6);
  }, 60_000); // abre Chromium y descarga las fuentes de Google
});
