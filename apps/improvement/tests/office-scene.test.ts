// Modelo puro de la escena pixel-art (oficinas-digitales paso 12). El .tsx lo cubre el e2e del paso 13.
import { describe, expect, it } from "vitest";
import { officeScene, type SceneZone } from "@jotapuntoce/ui/building/officeScene.ts";

const zona = (x: number, y: number, w: number, h: number): SceneZone => ({
  kind: "area",
  label: "Cocina",
  x,
  y,
  w,
  h,
  areaId: "a1",
  color: "#22aa66",
});
const gente = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ profileId: `p${i}`, name: `Persona ${i}`, areaId: "a1" }));

describe("officeScene", () => {
  it("WHEN la zona (1,8,11,9) recibe 3 personas THE SYSTEM SHALL sentarlas en (2,9), (4,9) y (6,9)", () => {
    const { avatars } = officeScene([zona(1, 8, 11, 9)], gente(3));
    expect(avatars.map((a) => [a.tx, a.ty])).toEqual([
      [2, 9],
      [4, 9],
      [6, 9],
    ]);
    expect(avatars[0]?.initials).toBe("P0");
  });

  it("WHEN una zona de 8×2 recibe 4 personas THE SYSTEM SHALL sentar 3 en y+1 y reportar overflow 1", () => {
    const { avatars, overflow } = officeScene([zona(1, 8, 8, 2)], gente(4));
    expect(avatars).toHaveLength(3);
    expect(avatars.every((a) => a.ty === 9)).toBe(true);
    expect(overflow).toEqual({ a1: 1 });
  });

  it("WHEN recibe una zona THE SYSTEM SHALL dar su rectángulo en píxeles ×16", () => {
    const { rects } = officeScene([zona(13, 8, 11, 9)], []);
    expect(rects[0]).toMatchObject({ px: 208, py: 128, pw: 176, ph: 144 });
  });
});
