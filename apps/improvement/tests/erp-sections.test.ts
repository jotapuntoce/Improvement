// La sección `proyectos` (server/permissions/sections.ts): se agrega al final sin mover las diez de antes.
import { describe, expect, it } from "vitest";
import { SECTION_SLUGS, scopeFor } from "../server/permissions/sections.ts";

describe("sección proyectos", () => {
  it("WHEN se lee SECTION_SLUGS THE SYSTEM SHALL conservar el prefijo de diez e incluir proyectos", () => {
    expect(SECTION_SLUGS.slice(0, 10)).toEqual([
      "mapa", "objetivos", "equipo", "clientes", "powerups", "cobros",
      "vision", "scorecard", "issues", "junta",
    ]);
    expect(SECTION_SLUGS).toContain("proyectos");
  });

  it("WHEN se resuelve el alcance THE SYSTEM SHALL dar empresa al dueño y ninguno al empleado sin tipo", () => {
    expect(scopeFor("owner", null, "proyectos")).toBe("empresa");
    expect(scopeFor("employee", null, "proyectos")).toBe("ninguno");
  });
});
