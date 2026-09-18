// La fórmula de puntos, probada sin base de datos: points.ts es un módulo puro a propósito para que
// la regla de negocio se pueda discutir mirando estos números y no una consulta.
import { describe, expect, it } from "vitest";
import {
  basePoints,
  enablementPoints,
  scoreObjective,
  NO_NEED_FACTOR,
  REPETITION_CAP,
} from "../server/objectives/points.ts";

const base = { impactWeight: 40, kind: "non_ipa" as const, repetitions: 0 };

describe("scoreObjective", () => {
  it("WHEN el objetivo no atiende ninguna necesidad THE SYSTEM SHALL pagarle la mitad", () => {
    expect(scoreObjective({ ...base, needSeverity: null })).toBe(
      basePoints(40) * NO_NEED_FACTOR,
    );
  });

  it("WHEN atiende una necesidad THE SYSTEM SHALL pagar más entre más grave sea", () => {
    const leve = scoreObjective({ ...base, needSeverity: 1 });
    const moderada = scoreObjective({ ...base, needSeverity: 2 });
    const critica = scoreObjective({ ...base, needSeverity: 3 });

    expect(leve).toBe(400);
    expect(moderada).toBe(500);
    expect(critica).toBe(600);
  });

  it(
    "WHEN un IPA y un non-IPA tienen el mismo peso y la misma necesidad THE SYSTEM SHALL pagarles " +
      "exactamente lo mismo al completarse — la clase de trabajo no cambia el pago directo",
    () => {
      const ipa = scoreObjective({ ...base, kind: "ipa", needSeverity: 2 });
      const nonIpa = scoreObjective({ ...base, kind: "non_ipa", needSeverity: 2 });
      expect(ipa).toBe(nonIpa);
    },
  );

  it("WHEN se repite el mismo trabajo THE SYSTEM SHALL pagar más, hasta un techo", () => {
    const primera = scoreObjective({ ...base, needSeverity: 1, repetitions: 0 });
    const decima = scoreObjective({ ...base, needSeverity: 1, repetitions: 10 });
    const centesima = scoreObjective({ ...base, needSeverity: 1, repetitions: 100 });

    expect(decima).toBeGreaterThan(primera);
    expect(centesima).toBe(Math.round(primera * (1 + REPETITION_CAP)));
    expect(centesima).toBe(decima);
  });

  it(
    "WHEN se comparan 20 tareas chicas sueltas contra 1 tarea grande ligada a una necesidad " +
      "crítica THE SYSTEM SHALL hacer que gane la ligada — la regla contra el relleno de tareas",
    () => {
      const sueltas = 20 * scoreObjective({ impactWeight: 5, kind: "non_ipa", needSeverity: null, repetitions: 0 });
      const ligada = scoreObjective({ impactWeight: 100, kind: "non_ipa", needSeverity: 3, repetitions: 0 });
      expect(ligada).toBeGreaterThan(sueltas);
    },
  );
});

describe("enablementPoints", () => {
  it("WHEN nadie habilitó el ingreso THE SYSTEM SHALL no repartir nada", () => {
    expect(enablementPoints(600, 0)).toBe(0);
  });

  it("WHEN varios habilitaron THE SYSTEM SHALL repartir la misma bolsa entre todos", () => {
    expect(enablementPoints(600, 1)).toBe(300);
    expect(enablementPoints(600, 2)).toBe(150);
    expect(enablementPoints(600, 3)).toBe(100);
  });
});
