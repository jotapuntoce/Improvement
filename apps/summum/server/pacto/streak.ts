// La racha y el riesgo del Pacto, puros: sin base y sin reloj propio. Los días son fechas `YYYY-MM-DD` en
// America/Mexico_City; se comparan como texto, que en ese formato ordena igual que la fecha.

export type PillarRisk = "al_dia" | "pendiente" | "peligro" | "desliz";

const MX_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function mxDate(now: Date): string {
  const parts = Object.fromEntries(MX_DATE.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** El día anterior a `day`, sin zona: aritmética de calendario en UTC. */
function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function pillarStatus({
  today,
  entryDates,
  pauses,
  since,
}: {
  today: string;
  entryDates: string[];
  pauses: { startsOn: string; endsOn: string }[];
  since: string;
}): { streak: number; risk: PillarRisk } {
  const logged = new Set(entryDates);
  // Antes de `since` no se le pedía nada: cuenta como cubierto. La posada cubre sin sumar.
  const covered = (day: string) =>
    day < since || logged.has(day) || pauses.some((p) => p.startsOn <= day && day <= p.endsOn);

  let faltas = 0;
  for (let day = today; !covered(day); day = previousDay(day)) faltas++;
  const risk: PillarRisk = faltas === 0 ? "al_dia" : faltas === 1 ? "pendiente" : faltas === 2 ? "peligro" : "desliz";

  const yesterday = previousDay(today);
  const start = covered(today) ? today : covered(yesterday) ? yesterday : null;
  let streak = 0;
  for (let day = start; day && day >= since && covered(day); day = previousDay(day)) {
    if (logged.has(day)) streak++;
  }
  return { streak, risk };
}

export function supportStatus(risks: PillarRisk[]): "bien" | "apoyo" {
  return risks.some((r) => r === "peligro" || r === "desliz") ? "apoyo" : "bien";
}
