// Reprogramación pura de pendientes vencidos: cada tarea `pendiente` cuyo fin ya pasó se mueve al siguiente
// hueco libre dentro del horario laboral. Sin base ni reloj propio: todo entra por parámetro.
import { UTC_OFFSET_MINUTES } from "./availability.ts";

type Block = { startsAt: Date; endsAt: Date };
export type RescheduleTask = Block & { id: string; kind: string; status: string };
export type RescheduleResult = { moves: { id: string; startsAt: Date; endsAt: Date }[]; unplaced: string[] };

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
// Horario laboral 09:00-18:00 local, pasos de 15 min, hasta 14 días adelante.
const WORK_START = 9 * 60 * MIN;
const WORK_END = 18 * 60 * MIN;
const STEP = 15 * MIN;
const HORIZON_DAYS = 14;

export function reschedule({ tasks, busy, now }: { tasks: RescheduleTask[]; busy: Block[]; now: Date }): RescheduleResult {
  const off = UTC_OFFSET_MINUTES * MIN;
  const ceil = (t: number) => Math.ceil(t / STEP) * STEP;
  // Medianoche local del día de `t`, expresada en UTC.
  const dayBase = (t: number) => Math.floor((t + off) / DAY) * DAY - off;

  const occupied = busy.map((b) => ({ s: b.startsAt.getTime(), e: b.endsAt.getTime() }));
  const limit = now.getTime() + HORIZON_DAYS * DAY;
  const result: RescheduleResult = { moves: [], unplaced: [] };

  const due = tasks
    .filter((t) => t.kind === "tarea" && t.status === "pendiente" && t.endsAt.getTime() <= now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (const task of due) {
    const dur = task.endsAt.getTime() - task.startsAt.getTime();
    let start = ceil(now.getTime());
    let placed = false;
    while (start + dur <= limit) {
      const base = dayBase(start);
      if (start < base + WORK_START) {
        start = base + WORK_START;
        continue;
      }
      if (start + dur > base + WORK_END) {
        start = base + DAY + WORK_START;
        continue;
      }
      const clash = occupied.find((b) => b.s < start + dur && b.e > start);
      if (clash) {
        start = ceil(clash.e);
        continue;
      }
      occupied.push({ s: start, e: start + dur });
      result.moves.push({ id: task.id, startsAt: new Date(start), endsAt: new Date(start + dur) });
      placed = true;
      break;
    }
    if (!placed) result.unplaced.push(task.id);
  }
  return result;
}
