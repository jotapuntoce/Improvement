// La semana del Scorecard (módulo puro): lunes en Ciudad de México, sin importar la hora del servidor.
import { describe, expect, it } from "vitest";
import { SCORECARD_WEEKS, isOnTrack, recentWeeks, weekStart } from "../server/direccion/scorecard/week.ts";

describe("weekStart", () => {
  it("WHEN es domingo 23:59 en CDMX THE SYSTEM SHALL seguir en la semana anterior", () => {
    expect(weekStart(new Date("2026-10-26T05:59:00Z"))).toBe("2026-10-19");
  });

  it("WHEN es lunes 00:00 en CDMX THE SYSTEM SHALL abrir la semana nueva", () => {
    expect(weekStart(new Date("2026-10-26T06:00:00Z"))).toBe("2026-10-26");
  });

  it("WHEN cae en el antiguo horario de verano THE SYSTEM SHALL usar UTC-6 igual", () => {
    expect(weekStart(new Date("2026-04-06T05:59:00Z"))).toBe("2026-03-30");
  });

  it("WHEN la semana cruza el año THE SYSTEM SHALL devolver el lunes de diciembre", () => {
    expect(weekStart(new Date("2027-01-01T03:00:00Z"))).toBe("2026-12-28");
  });
});

describe("recentWeeks / isOnTrack", () => {
  it("WHEN se piden 13 semanas THE SYSTEM SHALL devolver 13 lunes del más reciente al más viejo", () => {
    const weeks = recentWeeks("2026-10-19", SCORECARD_WEEKS);
    expect(weeks).toHaveLength(13);
    expect(weeks[0]).toBe("2026-10-19");
    expect(weeks[1]).toBe("2026-10-12");
    expect(weeks[12]).toBe("2026-07-27");
  });

  it("WHEN el valor iguala la meta THE SYSTEM SHALL contarlo en meta en ambas direcciones", () => {
    expect(isOnTrack(10, 10, "gte")).toBe(true);
    expect(isOnTrack(10, 10, "lte")).toBe(true);
    expect(isOnTrack(9, 10, "gte")).toBe(false);
    expect(isOnTrack(11, 10, "lte")).toBe(false);
  });
});
