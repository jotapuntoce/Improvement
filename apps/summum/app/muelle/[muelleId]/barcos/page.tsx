import { requireDockOwnership } from "@/server/auth/guard.ts";
import { listDockBarcos, listMembershipPlans } from "@/server/barcos/list.ts";
import { errorMessage } from "@/server/error-codes.ts";
import { activate, createPlan } from "./actions.ts";

const estado = (b: { chargesEnabled: boolean; payoutsEnabled: boolean }) =>
  b.payoutsEnabled ? "Cobra y recibe depósitos" : b.chargesEnabled ? "Cobra" : "Sin verificar";
const pesos = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function BarcosPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const { userId } = await requireDockOwnership(muelleId, `/muelle/${muelleId}/barcos`);
  const [barcos, plans] = await Promise.all([listDockBarcos(userId, muelleId), listMembershipPlans(userId, muelleId)]);
  return (
    <main>
      <h1>Barcos</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
      <table>
        <thead><tr><th>Empresa</th><th>Membresía</th><th>Pago</th><th>Cuenta de cobro</th></tr></thead>
        <tbody>
          {barcos.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>
                {b.planName ?? (plans.length ? (
                  <form action={activate} style={{ display: "inline-flex", gap: "8px" }}>
                    <input type="hidden" name="muelleId" value={muelleId} />
                    <input type="hidden" name="barcoId" value={b.id} />
                    <select name="planId" aria-label={`Nivel para ${b.name}`}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    <button type="submit">Activar membresía</button>
                  </form>
                ) : "Sin nivel")}
              </td>
              <td>{b.planName ? (b.alCorriente ? "Al corriente" : "Pendiente") : "—"}</td>
              <td>{estado(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {barcos.length === 0 && <p>Todavía no hay barcos colgados de este muelle.</p>}

      <h2>Niveles de membresía</h2>
      <ul>
        {plans.map((p) => <li key={p.id}>{p.name} · {pesos(p.monthlyAmountCents)} al mes</li>)}
        {plans.length === 0 && <li>Sin niveles todavía: crea uno para poder activar membresías.</li>}
      </ul>
      <form action={createPlan}>
        <input type="hidden" name="muelleId" value={muelleId} />
        <label>Nombre <input name="name" maxLength={80} required /></label>
        <label>Precio mensual $ (MXN) <input name="price" type="number" step="0.01" min="0.01" required /></label>
        <button type="submit">Crear nivel</button>
      </form>
    </main>
  );
}
