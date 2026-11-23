// Acomodo puro de la oficina 2D (oficinas-digitales paso 10, §4 "Acomodo de la oficina").
import { describe, expect, it } from "vitest";
import { industryAreas } from "@jotapuntoce/ui/building/industries.ts";
import { OFFICE_GRID, officeLayout, type OfficeZoneLayout } from "@jotapuntoce/ui/building/officeLayout.ts";

const areas = (names: string[]) => names.map((name, i) => ({ id: `a${i}`, name }));
const overlap = (a: OfficeZoneLayout, b: OfficeZoneLayout) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("officeLayout", () => {
  it("WHEN recibe la plantilla de restaurante y Ventas, Cocina, Caja THE SYSTEM SHALL dar el ejemplo de §4", () => {
    const zonas = officeLayout(industryAreas("restaurante"), areas(["Ventas", "Cocina", "Caja"]));
    expect(zonas.filter((z) => z.kind === "area").map(({ label, x, y, w, h }) => ({ label, x, y, w, h }))).toEqual([
      { label: "Cocina", x: 1, y: 8, w: 11, h: 9 },
      { label: "Caja", x: 13, y: 8, w: 11, h: 9 },
      { label: "Ventas", x: 25, y: 8, w: 11, h: 9 },
    ]);
    expect(zonas.slice(3).map((z) => z.kind)).toEqual(["direccion", "sala", "recepcion"]);
  });

  it("WHEN recibe de 1 a 12 áreas THE SYSTEM SHALL caber en 40×24 sin encimarse", () => {
    for (let n = 1; n <= 12; n++) {
      const zonas = officeLayout([], areas(Array.from({ length: n }, (_, i) => `Área ${i + 1}`)));
      expect(zonas).toHaveLength(n + 3);
      for (const z of zonas) {
        expect(z.x).toBeGreaterThanOrEqual(1);
        expect(z.y).toBeGreaterThanOrEqual(1);
        expect(z.w).toBeGreaterThan(0);
        expect(z.h).toBeGreaterThan(0);
        expect(z.x + z.w).toBeLessThanOrEqual(OFFICE_GRID.cols);
        expect(z.y + z.h).toBeLessThanOrEqual(OFFICE_GRID.rows);
      }
      for (let i = 0; i < zonas.length; i++)
        for (let j = i + 1; j < zonas.length; j++) expect(overlap(zonas[i]!, zonas[j]!), `n=${n} ${i}/${j}`).toBe(false);
    }
  });

  it("WHEN recibe 13 áreas THE SYSTEM SHALL lanzar RangeError", () => {
    expect(() => officeLayout([], areas(Array.from({ length: 13 }, (_, i) => `A${i}`)))).toThrow(RangeError);
  });
});
