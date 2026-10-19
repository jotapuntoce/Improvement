import { requireDockOwnership } from "@/server/auth/guard.ts";
import { listDockLedger, summarize } from "@/server/money/ledger.ts";
import { listDockBarcos } from "@/server/barcos/list.ts";
import { Money } from "@/components/Money.tsx";

const KINDS = ["membresia", "venta_propia", "proyecto_summum"] as const;
const KIND_LABEL = { membresia: "Membresía", venta_propia: "Venta del barco", proyecto_summum: "Proyecto Summum" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DineroPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ barco?: string; tipo?: string }> }) {
  const { muelleId } = await params;
  const { barco, tipo } = await searchParams;
  const { userId } = await requireDockOwnership(muelleId);
  const chargeKind = KINDS.find((k) => k === tipo);
  const barcoOrgId = barco && UUID.test(barco) ? barco : undefined; // un valor mal formado haría fallar el query de uuid
  const [rows, barcos] = await Promise.all([listDockLedger(userId, muelleId, { barcoOrgId, chargeKind }), listDockBarcos(userId, muelleId)]);
  const s = summarize(rows);
  return (
    <main>
      <h1>Dinero</h1>
      <p>Movido: <Money cents={s.grossCents} /> · Para Summum: <Money cents={s.feeCents} /> · Margen: {(s.marginBps / 100).toFixed(2)} %</p>
      <form>
        <select name="barco" defaultValue={barcoOrgId ?? ""}><option value="">Todos los barcos</option>{barcos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select name="tipo" defaultValue={chargeKind ?? ""}><option value="">Todos los cobros</option>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <button type="submit">Filtrar</button>
      </form>
      <table>
        <thead><tr><th>Fecha</th><th>Barco</th><th>Tipo</th><th>Monto</th><th>Summum</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.createdAt.toLocaleDateString("es-MX")}</td><td>{r.barcoName}</td><td>{KIND_LABEL[r.chargeKind]}</td>
              <td><Money cents={r.grossCents} currency={r.currency} /></td><td><Money cents={r.summumFeeCents} currency={r.currency} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
