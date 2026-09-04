import { describe, expect, it } from "vitest";
import { buildBuildingGraph, distributeCells } from "../server/building/buildingGraph.ts";

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
        { name: "Camibel", slogan: null, accentColor: null },
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

  it("WHEN se llama dos veces con la misma organización THE SYSTEM SHALL devolver el mismo layout (determinista por nombre)", () => {
    const org = { name: "Afianza", slogan: null, accentColor: null };
    const areas = [{ id: "x", name: "Legal", color: "#4c9b69" }];
    expect(buildBuildingGraph(org, areas)).toEqual(buildBuildingGraph(org, areas));
  });
});
