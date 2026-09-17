import { describe, expect, it } from "vitest";
import { buildCompanyList, deriveStageLabel, type StageRow } from "../server/companies/companyList.ts";

describe("deriveStageLabel", () => {
  it("WHEN hay una etapa en_progreso THE SYSTEM SHALL devolver su stageName aunque haya otras completadas", () => {
    const label = deriveStageLabel([
      { stageOrder: 1, stageName: "Análisis", status: "completada" },
      { stageOrder: 2, stageName: "Diseño", status: "en_progreso" },
    ]);
    expect(label).toBe("Diseño");
  });

  it("WHEN no hay ninguna en_progreso pero la última está completada THE SYSTEM SHALL devolver esa", () => {
    expect(deriveStageLabel([{ stageOrder: 1, stageName: "Análisis", status: "completada" }])).toBe(
      "Análisis",
    );
  });

  it("WHEN no hay ninguna etapa THE SYSTEM SHALL devolver 'Sin etapa activa'", () => {
    expect(deriveStageLabel([])).toBe("Sin etapa activa");
  });
});

describe("buildCompanyList", () => {
  it("WHEN hay 2 organizaciones con etapas propias THE SYSTEM SHALL no mezclar las etapas de una con el resumen de la otra", () => {
    const orgs = [
      { id: "org-a", name: "Camibel", industry: "servicios" },
      { id: "org-b", name: "Afianza", industry: null },
    ];
    const stagesA = [{ stageOrder: 1, stageName: "Análisis", status: "en_progreso" as const }];
    const stagesB = [{ stageOrder: 1, stageName: "Diseño", status: "completada" as const }];
    const stagesByOrgId = new Map<string, StageRow[]>([
      ["org-a", stagesA],
      ["org-b", stagesB],
    ]);

    expect(buildCompanyList(orgs, stagesByOrgId)).toEqual([
      {
        orgId: "org-a",
        name: "Camibel",
        industry: "servicios",
        stageLabel: "Análisis",
        stages: stagesA,
        currentIndex: 0,
      },
      {
        orgId: "org-b",
        name: "Afianza",
        industry: null,
        stageLabel: "Diseño",
        stages: stagesB,
        currentIndex: 0,
      },
    ]);
  });

  it("WHEN una organización no tiene ninguna fila en stagesByOrgId THE SYSTEM SHALL devolverle 'Sin etapa activa', no lanzar", () => {
    const orgs = [{ id: "org-a", name: "Camibel", industry: null }];
    expect(buildCompanyList(orgs, new Map())).toEqual([
      {
        orgId: "org-a",
        name: "Camibel",
        industry: null,
        stageLabel: "Sin etapa activa",
        stages: [],
        currentIndex: -1,
      },
    ]);
  });
});
