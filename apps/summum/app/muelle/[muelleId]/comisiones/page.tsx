import { requireDockOwnership } from "@/server/auth/guard.ts";
import { listPendingChanges, listRates } from "@/server/fees/changes.ts";
import { listDockBarcos } from "@/server/barcos/list.ts";
import { decide, propose } from "./actions.ts";

const KIND_LABEL = { venta_propia: "Venta del barco", proyecto_summum: "Proyecto Summum" } as const;
const pct = (bps: number) => `${(bps / 100).toFixed(2)} %`;
const fixed = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function ComisionesPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const { userId } = await requireDockOwnership(muelleId);
  const [rates, pending, barcos] = await Promise.all([listRates(muelleId), listPendingChanges(muelleId), listDockBarcos(userId, muelleId)]);
  const boatName = (id: string | null) => (id ? barcos.find((b) => b.id === id)?.name ?? "—" : "Todos (de fábrica)");

  return (
    <main>
      <h1>Comisiones</h1>
      {error && <p className="error">{error}</p>}
      <ul>
        {rates.map((r) => (
          <li key={`${r.barcoOrgId}-${r.chargeKind}`}>{KIND_LABEL[r.chargeKind]} · {boatName(r.barcoOrgId)} · {pct(r.percentBps)} + {fixed(r.fixedCents)}</li>
        ))}
        {rates.length === 0 && <li>Sin comisiones todavía: ningún barco puede cobrar hasta que haya una.</li>}
      </ul>

      <h2>Proponer cambio</h2>
      <form action={propose}>
        <input type="hidden" name="muelleId" value={muelleId} />
        <select name="chargeKind">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="barcoOrgId"><option value="">Todos (de fábrica)</option>{barcos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <label>% <input name="percent" type="number" step="0.01" min="0" max="100" required /></label>
        <label>Cuota fija $ <input name="fixed" type="number" step="0.01" min="0" defaultValue="0" /></label>
        <button type="submit">Proponer</button>
      </form>

      <h2>Esperando la otra firma</h2>
      <ul>
        {pending.map((c) => (
          <li key={c.id}>
            {KIND_LABEL[c.chargeKind]} · {boatName(c.barcoOrgId)} · {pct(c.percentBps)} + {fixed(c.fixedCents)}
            {c.proposedBy === userId ? (
              <em> — propuesta tuya, falta la firma del otro dueño</em>
            ) : (
              <form action={decide} style={{ display: "inline-flex" }}>
                <input type="hidden" name="muelleId" value={muelleId} />
                <input type="hidden" name="changeId" value={c.id} />
                <button name="decision" value="aprobado">Aprobar</button>
                <button name="decision" value="rechazado">Rechazar</button>
              </form>
            )}
          </li>
        ))}
        {pending.length === 0 && <li>Nada pendiente.</li>}
      </ul>
    </main>
  );
}
