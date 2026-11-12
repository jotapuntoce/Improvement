// Vista números: cifras grandes. Cuántos hay, cuánto suman y cuánto hay en cada etapa.
import type { ViewRecord } from "./ListView.tsx";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-MX");

type Rec = ViewRecord & { custom: Record<string, unknown> };

/** El valor que se suma: el campo elegido (dinero en centavos) o el monto base de la app. */
export function valueOf(r: Rec, sum: { key: string; type: "dinero" | "numero" } | null): number | null {
  if (!sum) return r.amountCents;
  const v = r.custom[sum.key];
  return typeof v === "number" ? v : null;
}
export const fmt = (n: number, money: boolean) => (money ? MXN.format(n / 100) : NUM.format(n));

export function NumbersView({
  records, stages, sum,
}: { records: Rec[]; stages: { key: string; name: string }[]; sum: { key: string; label: string; type: "dinero" | "numero" } | null }) {
  const money = !sum || sum.type === "dinero";
  const vals = records.map((r) => valueOf(r, sum));
  const hasSum = vals.some((v) => v !== null);
  const total = vals.reduce<number>((s, v) => s + (v ?? 0), 0);
  const label = sum?.label ?? "Monto";
  return (
    <div className="view-stats">
      <p className="view-stat"><span className="view-stat-num">{NUM.format(records.length)}</span> registros</p>
      {hasSum && <p className="view-stat"><span className="view-stat-num">{fmt(total, money)}</span> {label.toLowerCase()} en total</p>}
      {stages.map((s) => {
        const mine = records.filter((r) => r.stage === s.key);
        const t = mine.reduce((acc, r) => acc + (valueOf(r, sum) ?? 0), 0);
        return (
          <p key={s.key} className="view-stat view-stat-small">
            <span className="view-stat-num">{NUM.format(mine.length)}</span> en {s.name}
            {hasSum && <span className="config-hint"> · {fmt(t, money)}</span>}
          </p>
        );
      })}
    </div>
  );
}
