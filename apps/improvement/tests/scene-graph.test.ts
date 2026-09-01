// Funciones puras — sin DOM, sin Canvas, sin jsdom, sin base de datos (regla del propio criterio
// #3: el entorno "node" del vitest.config de apps/improvement es suficiente). Primera suite de
// toda la sesión que no toca Supabase real.
import { describe, expect, it } from "vitest";
import { buildSceneGraph, shouldAutoRotate } from "../server/scene/sceneGraph.ts";

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

const AREAS = [
  { id: "area-1", name: "Ventas", color: "#7c5cff" },
  { id: "area-2", name: "Operaciones", color: "#22d3ee" },
  { id: "area-3", name: "Soporte", color: "#10b981" },
];

describe("buildSceneGraph", () => {
  it("WHEN recibe 3 áreas y 5 empleados THE SYSTEM SHALL devolver zones.length === 3 y avatars.length === 5", () => {
    const employees = Array.from({ length: 5 }, (_, i) => ({
      id: `emp-${i}`,
      name: `Empleado ${i}`,
      objectives: [],
    }));

    const graph = buildSceneGraph(AREAS, employees);

    expect(graph.zones.length).toBe(3);
    expect(graph.avatars.length).toBe(5);
  });

  it(
    "WHEN un empleado tiene al menos un objetivo con due_date pasado y status != 'completed' " +
      "THE SYSTEM SHALL marcar su avatar con estado alerta",
    () => {
      const employees = [
        {
          id: "emp-vencido",
          name: "Con objetivo vencido",
          objectives: [
            { status: "pending", dueDate: daysFromNow(-3) }, // vencido, no completado
            { status: "in_progress", dueDate: daysFromNow(10) },
          ],
        },
        {
          id: "emp-al-dia",
          name: "Sin vencidos",
          objectives: [{ status: "in_progress", dueDate: daysFromNow(10) }],
        },
        {
          id: "emp-sin-objetivos",
          name: "Sin objetivos",
          objectives: [],
        },
      ];

      const graph = buildSceneGraph(AREAS, employees);

      const conVencido = graph.avatars.find((a) => a.id === "emp-vencido");
      const alDia = graph.avatars.find((a) => a.id === "emp-al-dia");
      const sinObjetivos = graph.avatars.find((a) => a.id === "emp-sin-objetivos");

      expect(conVencido?.status).toBe("alerta");
      expect(alDia?.status).toBe("activo");
      expect(sinObjetivos?.status).toBe("ok");
    },
  );

  it("WHEN un objetivo vencido ya está completed THE SYSTEM SHALL no contarlo como alerta", () => {
    const employees = [
      {
        id: "emp-completado",
        name: "Completado a tiempo",
        objectives: [{ status: "completed", dueDate: daysFromNow(-3) }],
      },
    ];

    const graph = buildSceneGraph(AREAS, employees);

    expect(graph.avatars[0]?.status).toBe("ok");
  });
});

describe("shouldAutoRotate", () => {
  it("WHEN shouldAutoRotate(true) se llama THE SYSTEM SHALL devolver false", () => {
    expect(shouldAutoRotate(true)).toBe(false);
  });

  it("WHEN shouldAutoRotate(false) se llama THE SYSTEM SHALL devolver true", () => {
    expect(shouldAutoRotate(false)).toBe(true);
  });
});
