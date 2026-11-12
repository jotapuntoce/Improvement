// Vista calendario: el mes en cuadrícula, cada registro en el día de su campo fecha.
import Link from "next/link";
import type { ViewRecord } from "./ListView.tsx";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-11" → primer día del mes en UTC; inválido o ausente → el mes de hoy. */
function monthOf(mes: string | undefined): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
  const now = new Date();
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
const ym = (d: Date) => d.toISOString().slice(0, 7);

export function CalendarView({
  base, records, dateKey, dateLabel, mes,
}: { base: string; records: (ViewRecord & { custom: Record<string, unknown> })[]; dateKey: string; dateLabel: string; mes?: string }) {
  const start = monthOf(mes);
  const prev = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const lead = (start.getUTCDay() + 6) % 7; // lunes primero
  const days = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const byDay = new Map<string, ViewRecord[]>();
  for (const r of records) {
    const d = r.custom[dateKey];
    if (typeof d === "string") byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const sinFecha = records.filter((r) => typeof r.custom[dateKey] !== "string").length;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <section aria-labelledby="cal-mes">
      <header className="view-cal-head">
        <Link href={`${base}?vista=calendario&mes=${ym(prev)}`} aria-label="Mes anterior">←</Link>
        <h2 id="cal-mes" className="config-card-title">{MONTH.format(start)} · por {dateLabel.toLowerCase()}</h2>
        <Link href={`${base}?vista=calendario&mes=${ym(next)}`} aria-label="Mes siguiente">→</Link>
      </header>
      <div className="view-cal" role="grid">
        {DAYS.map((d) => <div key={d} role="columnheader" className="view-cal-dow">{d}</div>)}
        {cells.map((day, i) => {
          if (day === null) return <div key={`x${i}`} aria-hidden="true" />;
          const iso = `${ym(start)}-${String(day).padStart(2, "0")}`;
          const items = byDay.get(iso) ?? [];
          return (
            <div key={iso} role="gridcell" className="view-cal-day" aria-label={`${day}, ${items.length} registros`}>
              <span className="view-cal-num">{day}</span>
              {items.map((r) => <Link key={r.id} href={`${base}/${r.id}`} className="view-cal-item">{r.title}</Link>)}
            </div>
          );
        })}
      </div>
      {sinFecha > 0 && <p className="config-hint">{sinFecha} sin {dateLabel.toLowerCase()} — no salen en el calendario.</p>}
    </section>
  );
}
