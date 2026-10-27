// La semana del Scorecard: lunes en America/Mexico_City. Única fuente — nadie más calcula un lunes ni
// usa getDay() sobre la hora del servidor (.claude/rules/direccion.md). Módulo puro: sin base, sin next/*.

export const SCORECARD_WEEKS = 13;

const OFFSET: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
});

/** El lunes (`YYYY-MM-DD`) de la semana de `now`, contado en hora de Ciudad de México. */
export function weekStart(now: Date): string {
  const p = Object.fromEntries(FMT.formatToParts(now).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  d.setUTCDate(d.getUTCDate() - (OFFSET[p.weekday ?? "Mon"] ?? 0));
  return d.toISOString().slice(0, 10);
}

/** `count` lunes desde `currentWeekStart` hacia atrás, el más reciente primero. */
export function recentWeeks(currentWeekStart: string, count: number): string[] {
  const d = new Date(`${currentWeekStart}T00:00:00Z`);
  const weeks: string[] = [];
  for (let i = 0; i < count; i++) {
    weeks.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return weeks;
}

export function isOnTrack(value: number, goal: number, direction: "gte" | "lte"): boolean {
  return direction === "gte" ? value >= goal : value <= goal;
}
