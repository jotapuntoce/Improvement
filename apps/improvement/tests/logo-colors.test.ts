// Colores del logo: los más frecuentes, sin fondo blanco, negro ni transparente.
import { describe, expect, it } from "vitest";
import { dominantColors } from "../components/brand/dominantColors.ts";

const px = (n: number, rgba: [number, number, number, number]) => Array.from({ length: n }, () => rgba).flat();

describe("colores del logo", () => {
  it("WHEN el logo trae rojo, azul y fondo THE SYSTEM SHALL devolver rojo y azul en orden de frecuencia", () => {
    const data = new Uint8ClampedArray([
      ...px(10, [255, 0, 0, 255]),
      ...px(5, [0, 0, 255, 255]),
      ...px(20, [255, 255, 255, 255]),
      ...px(20, [0, 0, 0, 255]),
      ...px(30, [0, 200, 0, 0]),
    ]);
    expect(dominantColors(data)).toEqual(["#ff0000", "#0000ff"]);
  });

  it("WHEN el logo es solo fondo THE SYSTEM SHALL no proponer colores", () => {
    expect(dominantColors(new Uint8ClampedArray(px(10, [255, 255, 255, 255])))).toEqual([]);
  });
});
