import { describe, expect, it } from "vitest";
import { METODO, mensajeDe, senales } from "../lib/motor/metodo.js";
import { CHEQUEO_MUESTRA, EMPRENDEDOR_MUESTRA } from "../lib/motor/muestra.js";

describe("método", () => {
  it("las señales salen de la fila, no de la IA", () => {
    expect(senales(CHEQUEO_MUESTRA)).toEqual({ minutosEntrevista: 7, horasHastaEntrevista: 0.3, palabras: [8, 5, 5] });
    expect(senales({ ...CHEQUEO_MUESTRA, entrevistaAt: null, entrevistaSegundos: null, respuestas: null })).toEqual({
      minutosEntrevista: null,
      horasHastaEntrevista: null,
      palabras: [],
    });
  });

  it("el mensaje lleva datos, respuestas tal cual, señales y la nota", () => {
    const m = mensajeDe({ ...CHEQUEO_MUESTRA, notas: "Lo conoce Ricardo" }, { nota: "No menciones precios" });
    expect(m).toContain("Café Ejemplo");
    expect(m).toContain("Por mi abuela, que tostaba café en casa.");
    expect(m).toContain("https://ejemplo.com");
    expect(m).toContain("Lo conoce Ricardo");
    expect(m).toContain("No menciones precios");
  });

  it("sin redes y emprendedor se dicen explícito", () => {
    const m = mensajeDe({ ...EMPRENDEDOR_MUESTRA, enlaces: {}, sinRedes: true });
    expect(m).toContain("Tipo: emprendedor");
    expect(m).toContain("no tiene redes sociales");
  });

  it("el método trae las reglas que no se rompen", () => {
    for (const regla of ["dato", "estimacion", "Plática", "Kit Arranque", "ÚNICAMENTE un objeto JSON"]) expect(METODO).toContain(regla);
  });
});
