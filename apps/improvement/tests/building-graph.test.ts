import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries.ts";
import { buildingShape } from "@jotapuntoce/ui/building/shapes.ts";
import { buildBuildingGraph, currentStage, distributeCells } from "../server/building/buildingGraph.ts";

describe("distributeCells", () => {
  it(
    "WHEN recibe 3 areaIds, 8 rows, 9 cols y 3 windowsPerArea THE SYSTEM SHALL devolver 3 grupos " +
      "de 3 celdas cada uno, sin celdas repetidas entre grupos",
    () => {
      const result = distributeCells(["a", "b", "c"], 8, 9, 3, 42);

      expect(result).toHaveLength(3);
      for (const group of result) {
        expect(group.cells).toHaveLength(3);
      }

      const allCells = result.flatMap((g) => g.cells.map(([r, c]) => `${r},${c}`));
      expect(new Set(allCells).size).toBe(allCells.length);
    },
  );

  it("WHEN se llama dos veces con el mismo seed THE SYSTEM SHALL devolver exactamente el mismo resultado", () => {
    const first = distributeCells(["a", "b"], 8, 9, 3, 7);
    const second = distributeCells(["a", "b"], 8, 9, 3, 7);
    expect(second).toEqual(first);
  });

  it(
    "WHEN areaIds.length * windowsPerArea excede el total de celdas del grid THE SYSTEM SHALL " +
      "reducir windowsPerArea en vez de lanzar o repetir celdas",
    () => {
      const result = distributeCells(["a", "b", "c", "d", "e"], 2, 2, 3, 1); // grid de 4 celdas, 5 áreas
      const allCells = result.flatMap((g) => g.cells.map(([r, c]) => `${r},${c}`));
      expect(new Set(allCells).size).toBe(allCells.length);
      expect(allCells.length).toBeLessThanOrEqual(4);
    },
  );
});

describe("buildBuildingGraph", () => {
  it(
    "WHEN recibe una organización y sus áreas THE SYSTEM SHALL devolver un area por cada fila, " +
      "cada una con su color real y una lista de cells no vacía",
    () => {
      const graph = buildBuildingGraph(
        { name: "Camibel", slogan: null, accentColor: null, industry: null },
        [
          { id: "area-1", name: "Ventas", color: "#22d3ee" },
          { id: "area-2", name: "Operaciones", color: "#f87171" },
        ],
      );

      expect(graph.companyName).toBe("Camibel");
      expect(graph.areas).toHaveLength(2);
      expect(graph.areas[0]).toMatchObject({ id: "area-1", name: "Ventas", color: "#22d3ee" });
      expect(graph.areas[0]!.cells.length).toBeGreaterThan(0);
    },
  );

  it(
    "WHEN la empresa es de cualquier giro THE SYSTEM SHALL repartir las ventanas dentro de la " +
      "cuadrícula de ESE giro — una celda fuera de rango es un área que el dueño nunca ve, porque " +
      "Building.tsx solo dibuja las filas y columnas que su forma tiene",
    () => {
      const areas = [
        { id: "a", name: "Ventas", color: "#22d3ee" },
        { id: "b", name: "Obra", color: "#f59e0b" },
        { id: "c", name: "Admin", color: "#a78bfa" },
      ];

      for (const giro of INDUSTRIES) {
        const forma = buildingShape(giro.id);
        const graph = buildBuildingGraph(
          { name: "Camibel", slogan: null, accentColor: null, industry: giro.id },
          areas,
        );

        for (const area of graph.areas) {
          expect(area.cells.length, giro.id).toBeGreaterThan(0);
          for (const [row, col] of area.cells) {
            expect(row, giro.id).toBeLessThan(forma.rows);
            expect(col, giro.id).toBeLessThan(forma.cols);
          }
        }
      }
    },
  );

  it("WHEN se llama dos veces con la misma organización THE SYSTEM SHALL devolver el mismo layout (determinista por nombre)", () => {
    const org = { name: "Afianza", slogan: null, accentColor: null, industry: null };
    const areas = [{ id: "x", name: "Legal", color: "#4c9b69" }];
    expect(buildBuildingGraph(org, areas)).toEqual(buildBuildingGraph(org, areas));
  });
});

describe("currentStage", () => {
  const etapa = (stageOrder: number, status: string) => ({
    stageOrder,
    status,
    stageName: `Etapa ${stageOrder}`,
  });

  it("WHEN la empresa no tiene mapa de construcción THE SYSTEM SHALL dibujarla terminada", () => {
    expect(currentStage([]).order).toBe(8);
  });

  it("WHEN hay una etapa en progreso THE SYSTEM SHALL devolver esa, aunque haya completadas", () => {
    const mapa = [
      etapa(1, "completada"),
      etapa(2, "completada"),
      etapa(3, "completada"),
      etapa(4, "en_progreso"),
      etapa(5, "bloqueada"),
    ];
    expect(currentStage(mapa)).toEqual({ order: 4, name: "Etapa 4" });
  });

  it("WHEN ninguna está en progreso THE SYSTEM SHALL devolver la última completada", () => {
    const mapa = [etapa(1, "completada"), etapa(2, "completada"), etapa(3, "bloqueada")];
    expect(currentStage(mapa).order).toBe(2);
  });

  it(
    "WHEN ninguna empezó todavía THE SYSTEM SHALL devolver la primera, no cero — un dueño recién " +
      "dado de alta ve su terreno, que es exactamente donde está",
    () => {
      const mapa = [etapa(1, "bloqueada"), etapa(2, "bloqueada")];
      expect(currentStage(mapa).order).toBe(1);
    },
  );
});
