import { describe, expect, it } from "vitest";
import { buildCompanyList, deriveStageLabel } from "../server/companies/companyList.ts";

describe("deriveStageLabel", () => {
  it("WHEN hay una etapa en_progreso THE SYSTEM SHALL devolver su stageName aunque haya otras completadas", () => {
    const label = deriveStageLabel([
      { stageName: "Análisis", status: "completada" },
      { stageName: "Diseño", status: "en_progreso" },
    ]);
    expect(label).toBe("Diseño");
  });

  it("WHEN no hay ninguna en_progreso pero la última está completada THE SYSTEM SHALL devolver esa", () => {
    expect(deriveStageLabel([{ stageName: "Análisis", status: "completada" }])).toBe("Análisis");
  });

  it("WHEN no hay ninguna etapa THE SYSTEM SHALL devolver 'Sin etapa activa'", () => {
    expect(deriveStageLabel([])).toBe("Sin etapa activa");
  });
});

describe("buildCompanyList", () => {
  it("WHEN hay 2 organizaciones con etapas propias THE SYSTEM SHALL no mezclar las etapas de una con el resumen de la otra", () => {
    const orgs = [
      { id: "org-a", name: "Camibel" },
      { id: "org-b", name: "Afianza" },
    ];
    const stagesByOrgId = new Map([
      ["org-a", [{ stageName: "Análisis", status: "en_progreso" as const }]],
      ["org-b", [{ stageName: "Diseño", status: "completada" as const }]],
    ]);

    expect(buildCompanyList(orgs, stagesByOrgId)).toEqual([
      { orgId: "org-a", name: "Camibel", stageLabel: "Análisis" },
      { orgId: "org-b", name: "Afianza", stageLabel: "Diseño" },
    ]);
  });

  it("WHEN una organización no tiene ninguna fila en stagesByOrgId THE SYSTEM SHALL devolverle 'Sin etapa activa', no lanzar", () => {
    const orgs = [{ id: "org-a", name: "Camibel" }];
    expect(buildCompanyList(orgs, new Map())).toEqual([
      { orgId: "org-a", name: "Camibel", stageLabel: "Sin etapa activa" },
    ]);
  });
});
