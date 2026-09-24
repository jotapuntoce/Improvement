import { describe, expect, it } from "vitest";
import { hexToRgb, stageScale } from "../components/login/brainScene.js";

describe("hexToRgb", () => {
  it("lee la forma corta que deja el pipeline de CSS (#fff) igual que la larga", () => {
    expect(hexToRgb("#fff")).toEqual([1, 1, 1]);
    expect(hexToRgb(" #ffffff ")).toEqual([1, 1, 1]);
    expect(hexToRgb("#ff4a4a")).toEqual([1, 0x4a / 255, 0x4a / 255]);
  });
});

describe("stageScale", () => {
  it("la composición de 710×686 cabe completa", () => {
    expect(stageScale(710, 686)).toBe(1);
    expect(stageScale(1420, 686)).toBe(1); // manda el alto
    expect(stageScale(1420, 1372)).toBe(2);
  });

  it("en teléfono vertical la tarjeta de 440px usa el ancho útil", () => {
    expect(stageScale(375, 812)).toBeCloseTo((375 - 32) / 440);
  });
});
