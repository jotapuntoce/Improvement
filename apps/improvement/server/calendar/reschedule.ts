// Reprogramación pura de pendientes vencidos: cada tarea `pendiente` cuyo fin ya pasó se mueve al siguiente
// hueco libre dentro del horario laboral. Sin base ni reloj propio: todo entra por parámetro.

type Block = { startsAt: Date; endsAt: Date };
export type RescheduleTask = Block & { id: string; kind: string; status: string };
export type RescheduleResult = { moves: { id: string; startsAt: Date; endsAt: Date }[]; unplaced: string[] };

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function reschedule({
  tasks,
  busy,
  now,
  workStart = "09:00",
  workEnd = "18:00",
  // ponytail: offset fijo, usa Intl si el negocio opera en una zona con horario de verano
  utcOffsetMinutes = -360,
  stepMinutes = 15,
  horizonDays = 14,
}: {
  tasks: RescheduleTask[];
  busy: Block[];
  now: Date;
  workStart?: string;
  workEnd?: string;
  utcOffsetMinutes?: number;
  stepMinutes?: number;
  horizonDays?: number;
}): RescheduleResult {
  const step = stepMinutes * MIN;
  const off = utcOffsetMinutes * MIN;
  const ws = minutes(workStart) * MIN;
  const we = minutes(workEnd) * MIN;
  const ceil = (t: number) => Math.ceil(t / step) * step;
  // Medianoche local del día de `t`, expresada en UTC.
  const dayBase = (t: number) => Math.floor((t + off) / DAY) * DAY - off;

  const occupied = busy.map((b) => ({ s: b.startsAt.getTime(), e: b.endsAt.getTime() }));
  const limit = now.getTime() + horizonDays * DAY;
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
      if (start < base + ws) {
        start = base + ws;
        continue;
      }
      if (start + dur > base + we) {
        start = base + DAY + ws;
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
