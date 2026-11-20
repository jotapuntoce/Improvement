// Disponibilidad de una página de reservas (puro): horario semanal + ocupados → inicios libres de un día.
import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM.");
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const range = z.tuple([hhmm, hhmm]).refine(([a, b]) => toMin(a) < toMin(b), "El inicio va antes del fin.");

// Llaves "1" (lunes) … "7" (domingo), ISO.
export const weeklyHoursSchema = z.partialRecord(z.enum(["1", "2", "3", "4", "5", "6", "7"]), z.array(range));
export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;

const MIN = 60_000;
// ponytail: offset fijo (America/Mexico_City sin horario de verano desde 2022), usa Intl si cambia.
export const UTC_OFFSET_MINUTES = -360;

export function availableSlots({
  date,
  weeklyHours,
  durationMinutes,
  busy,
  now,
}: {
  date: string; // YYYY-MM-DD, día local
  weeklyHours: WeeklyHours;
  durationMinutes: number;
  busy: { startsAt: Date; endsAt: Date }[];
  now: Date;
}): string[] {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(midnightUtc)) return [];
  const isoDay = String(((new Date(midnightUtc).getUTCDay() + 6) % 7) + 1) as keyof WeeklyHours;
  const base = midnightUtc - UTC_OFFSET_MINUTES * MIN; // medianoche local en UTC
  const dur = durationMinutes * MIN;
  const slots: string[] = [];
  for (const [from, to] of weeklyHours[isoDay] ?? []) {
    for (let s = base + toMin(from) * MIN; s + dur <= base + toMin(to) * MIN; s += dur) {
      if (s <= now.getTime()) continue;
      if (busy.some((b) => b.startsAt.getTime() < s + dur && b.endsAt.getTime() > s)) continue;
      slots.push(new Date(s).toISOString());
    }
  }
  return slots;
}
