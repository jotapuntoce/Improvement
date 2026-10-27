// Vista lista: una fila por registro, con el total de montos al pie cuando la app los tiene.
import Link from "next/link";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export interface ViewRecord { id: string; title: string; subtitle: string | null; stage: string; amountCents: number | null }

export function ListView({ base, records, stageName }: { base: string; records: ViewRecord[]; stageName: Record<string, string> }) {
  const hasAmount = records.some((r) => r.amountCents !== null);
  const total = records.reduce((s, r) => s + (r.amountCents ?? 0), 0);
  return (
    <table className="view-table">
      <thead>
        <tr>
          <th scope="col">Nombre</th>
          <th scope="col">Relacionado</th>
          <th scope="col">Etapa</th>
          {hasAmount && <th scope="col">Monto</th>}
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.id}>
            <th scope="row"><Link href={`${base}/${r.id}`}>{r.title}</Link></th>
            <td>{r.subtitle ?? "—"}</td>
            <td>{stageName[r.stage] ?? r.stage}</td>
            {hasAmount && <td>{r.amountCents === null ? "—" : MXN.format(r.amountCents / 100)}</td>}
          </tr>
        ))}
        {records.length === 0 && (
          <tr><td colSpan={hasAmount ? 4 : 3} className="config-hint">Sin registros todavía.</td></tr>
        )}
      </tbody>
      {hasAmount && (
        <tfoot>
          <tr><th scope="row" colSpan={3}>Total</th><td>{MXN.format(total / 100)}</td></tr>
        </tfoot>
      )}
    </table>
  );
}
