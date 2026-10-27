// La racha y el riesgo del Pacto (server/pacto/streak.ts): puros, sin base.
import { describe, expect, it } from "vitest";
import { mxDate, pillarStatus, supportStatus } from "../server/pacto/streak.ts";

const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${from + i}`);
const status = (entryDates: string[], pauses: { startsOn: string; endsOn: string }[] = [], since = "2026-10-01") =>
  pillarStatus({ today: "2026-10-26", entryDates, pauses, since });

describe("mxDate", () => {
  it("WHEN recibe 05:59Z o 06:00Z del 27 de octubre THE SYSTEM SHALL devolver el 26 y el 27 en Ciudad de México", () => {
    expect(mxDate(new Date("2026-10-27T05:59:00Z"))).toBe("2026-10-26");
    expect(mxDate(new Date("2026-10-27T06:00:00Z"))).toBe("2026-10-27");
  });
});

describe("pillarStatus", () => {
  it("WHEN cambian los registros y la posada THE SYSTEM SHALL contar la racha y el riesgo de cada caso", () => {
    expect(status(days(23, 25))).toEqual({ streak: 3, risk: "pendiente" });
    expect(status(days(23, 26))).toEqual({ streak: 4, risk: "al_dia" });
    expect(status(days(20, 22), [{ startsOn: "2026-10-23", endsOn: "2026-10-25" }])).toEqual({ streak: 3, risk: "pendiente" });
    expect(status(["2026-10-24"])).toEqual({ streak: 0, risk: "peligro" });
    expect(status(["2026-10-22"])).toEqual({ streak: 0, risk: "desliz" });
  });

  it("WHEN se aceptó hoy y no hay registros THE SYSTEM SHALL devolver 0 y pendiente", () => {
    expect(status([], [], "2026-10-26")).toEqual({ streak: 0, risk: "pendiente" });
  });
});

describe("supportStatus", () => {
  it("WHEN algún pilar está en peligro o desliz THE SYSTEM SHALL pedir apoyo; si no, bien", () => {
    expect(supportStatus(["al_dia", "pendiente"])).toBe("bien");
    expect(supportStatus(["al_dia", "peligro"])).toBe("apoyo");
    expect(supportStatus(["desliz"])).toBe("apoyo");
  });
});
