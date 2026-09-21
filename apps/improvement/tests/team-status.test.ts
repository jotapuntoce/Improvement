// Funciones puras — sin DOM, sin base de datos (el entorno "node" del vitest.config de
// apps/improvement es suficiente). La única suite del proyecto que no toca Supabase real.
import { describe, expect, it } from "vitest";
import { deriveStatus } from "../server/employees/teamStatus.ts";

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

describe("deriveStatus", () => {
  it(
    "WHEN una persona tiene al menos un objetivo con due_date pasado y status != 'completed' " +
      "THE SYSTEM SHALL marcarla en alerta, aunque además traiga uno en curso",
    () => {
      expect(
        deriveStatus([
          { status: "pending", dueDate: daysFromNow(-3) }, // vencido, no completado
          { status: "in_progress", dueDate: daysFromNow(10) },
        ]),
      ).toBe("alerta");
    },
  );

  it("WHEN tiene algo en curso y nada vencido THE SYSTEM SHALL marcarla activa", () => {
    expect(deriveStatus([{ status: "in_progress", dueDate: daysFromNow(10) }])).toBe("activo");
  });

  it("WHEN no tiene objetivos THE SYSTEM SHALL marcarla ok, no en alerta", () => {
    expect(deriveStatus([])).toBe("ok");
  });

  it("WHEN un objetivo vencido ya está completed THE SYSTEM SHALL no contarlo como alerta", () => {
    expect(deriveStatus([{ status: "completed", dueDate: daysFromNow(-3) }])).toBe("ok");
  });
});
