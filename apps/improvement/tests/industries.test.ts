import { describe, expect, it } from "vitest";
import {
  BASE_INDUSTRIES,
  INDUSTRIES,
  INDUSTRY_CATEGORIES,
  industryAreas,
  isIndustry,
} from "@jotapuntoce/ui/building/industries.ts";
import { buildingPalette } from "@jotapuntoce/ui/building/palettes.ts";
import { buildingShape } from "@jotapuntoce/ui/building/shapes.ts";

describe("catálogo de giros", () => {
  it("WHEN se lee INDUSTRIES THE SYSTEM SHALL empezar con los 8 giros de hoy, mismas etiquetas y orden", () => {
    expect(INDUSTRIES.slice(0, 8).map((i) => [i.id, i.label])).toEqual([
      ["restaurante", "Restaurante"],
      ["retail", "Tienda / Retail"],
      ["servicios", "Servicios profesionales"],
      ["salud", "Salud"],
      ["construccion", "Construcción"],
      ["tecnologia", "Tecnología"],
      ["manufactura", "Manufactura"],
      ["otro", "Otro"],
    ]);
    expect(INDUSTRIES).toHaveLength(30);
  });

  it("WHEN isIndustry recibe un giro nuevo THE SYSTEM SHALL devolver true", () => {
    for (const id of ["wedding_planner", "clinica", "hotel", "despacho", "taller", "inmobiliaria", "desarrolladora"]) {
      expect(isIndustry(id)).toBe(true);
    }
    expect(isIndustry("inventado")).toBe(false);
  });

  it("WHEN se dibuja clinica THE SYSTEM SHALL usar la forma y la paleta de salud, su base", () => {
    expect(buildingShape("clinica")).toEqual(buildingShape("salud"));
    expect(buildingPalette("clinica")).toEqual(buildingPalette("salud"));
  });

  it("WHEN se recorre INDUSTRIES THE SYSTEM SHALL tener ids únicos, categoría y base válidas y ≤ 12 áreas", () => {
    const ids = INDUSTRIES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set<string>(INDUSTRY_CATEGORIES.map((c) => c.id));
    const bases = new Set<string>(BASE_INDUSTRIES);
    for (const i of INDUSTRIES) {
      expect(categories.has(i.category)).toBe(true);
      expect(bases.has(i.base)).toBe(true);
      expect(i.areas.length).toBeLessThanOrEqual(12);
    }
    for (const id of BASE_INDUSTRIES) {
      expect(INDUSTRIES.find((i) => i.id === id)?.base).toBe(id);
    }
    expect(industryAreas("otro")).toEqual([]);
    expect(industryAreas("inventado")).toEqual([]);
  });
});
