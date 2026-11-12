// Vista tabla agrupada: cuántos y cuánto por cada opción de un campo (o por etapa si no hay opciones).
import type { ViewRecord } from "./ListView.tsx";
import { fmt, valueOf } from "./NumbersView.tsx";

type Rec = ViewRecord & { custom: Record<string, unknown> };

export function GroupedTable({
  records, groupBy, stageName,
}: { records: Rec[]; groupBy: { key: string; label: string } | null; stageName: Record<string, string> }) {
  const keyOf = (r: Rec) => (groupBy ? (typeof r.custom[groupBy.key] === "string" ? (r.custom[groupBy.key] as string) : "Sin dato") : stageName[r.stage] ?? r.stage);
  const groups = new Map<string, Rec[]>();
  for (const r of records) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
  const hasAmount = records.some((r) => r.amountCents !== null);
  const sumOf = (rs: Rec[]) => rs.reduce((s, r) => s + (valueOf(r, null) ?? 0), 0);
  return (
    <table className="view-table">
      <thead>
        <tr>
          <th scope="col">{groupBy?.label ?? "Etapa"}</th>
          <th scope="col">Cuántos</th>
          {hasAmount && <th scope="col">Monto</th>}
        </tr>
      </thead>
      <tbody>
        {[...groups].map(([g, rs]) => (
          <tr key={g}>
            <th scope="row">{g}</th>
            <td>{rs.length}</td>
            {hasAmount && <td>{fmt(sumOf(rs), true)}</td>}
          </tr>
        ))}
        {records.length === 0 && <tr><td colSpan={hasAmount ? 3 : 2} className="config-hint">Sin registros todavía.</td></tr>}
      </tbody>
      <tfoot>
        <tr><th scope="row">Total</th><td>{records.length}</td>{hasAmount && <td>{fmt(sumOf(records), true)}</td>}</tr>
      </tfoot>
    </table>
  );
}
