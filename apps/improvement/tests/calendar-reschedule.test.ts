// Reprogramación pura: hueco tras un ocupado, salto al día siguiente, dos tareas sin encimarse y filtros.
import { describe, expect, it } from "vitest";
import { reschedule, type RescheduleTask } from "@/server/calendar/reschedule.ts";

const d = (iso: string) => new Date(iso);
const tarea = (id: string, startsAt: string, endsAt: string, extra: Partial<RescheduleTask> = {}): RescheduleTask => ({
  id,
  kind: "tarea",
  status: "pendiente",
  startsAt: d(startsAt),
  endsAt: d(endsAt),
  ...extra,
});
const iso = (r: ReturnType<typeof reschedule>) => r.moves.map((m) => [m.id, m.startsAt.toISOString(), m.endsAt.toISOString()]);

describe("reschedule", () => {
  it("WHEN hay un ocupado 16:30–17:30Z THE SYSTEM SHALL mover la tarea de 45 min a 17:30–18:15Z", () => {
    const r = reschedule({
      tasks: [tarea("a", "2026-11-18T15:00:00Z", "2026-11-18T15:45:00Z")],
      busy: [{ startsAt: d("2026-11-18T16:30:00Z"), endsAt: d("2026-11-18T17:30:00Z") }],
      now: d("2026-11-18T16:10:00Z"),
    });
    expect(iso(r)).toEqual([["a", "2026-11-18T17:30:00.000Z", "2026-11-18T18:15:00.000Z"]]);
  });

  it("WHEN son las 17:40 locales THE SYSTEM SHALL mover la tarea a las 09:00 locales del día siguiente", () => {
    const r = reschedule({ tasks: [tarea("a", "2026-11-18T15:00:00Z", "2026-11-18T15:45:00Z")], busy: [], now: d("2026-11-18T23:40:00Z") });
    expect(iso(r)).toEqual([["a", "2026-11-19T15:00:00.000Z", "2026-11-19T15:45:00.000Z"]]);
  });

  it("WHEN hay dos tareas vencidas THE SYSTEM SHALL colocarlas sin encimarse, en su orden original", () => {
    const r = reschedule({
      tasks: [tarea("segunda", "2026-11-18T15:00:00Z", "2026-11-18T15:30:00Z"), tarea("primera", "2026-11-18T14:00:00Z", "2026-11-18T15:00:00Z")],
      busy: [],
      now: d("2026-11-18T16:10:00Z"),
    });
    expect(iso(r)).toEqual([
      ["primera", "2026-11-18T16:15:00.000Z", "2026-11-18T17:15:00.000Z"],
      ["segunda", "2026-11-18T17:15:00.000Z", "2026-11-18T17:45:00.000Z"],
    ]);
  });

  it("WHEN una tarea está hecha, no vence o no es tarea THE SYSTEM SHALL dejarla fuera", () => {
    const r = reschedule({
      tasks: [
        tarea("hecha", "2026-11-18T15:00:00Z", "2026-11-18T15:45:00Z", { status: "hecho" }),
        tarea("futura", "2026-11-18T18:00:00Z", "2026-11-18T18:45:00Z"),
        tarea("evento", "2026-11-18T15:00:00Z", "2026-11-18T15:45:00Z", { kind: "evento" }),
      ],
      busy: [],
      now: d("2026-11-18T16:10:00Z"),
    });
    expect(r).toEqual({ moves: [], unplaced: [] });
  });

  it("WHEN no hay hueco en el horizonte THE SYSTEM SHALL devolverla en unplaced", () => {
    const r = reschedule({ tasks: [tarea("larga", "2026-11-18T00:00:00Z", "2026-11-18T10:00:00Z")], busy: [], now: d("2026-11-18T16:10:00Z") });
    expect(r).toEqual({ moves: [], unplaced: ["larga"] });
  });
});
