import { requireDockOwnership } from "@/server/auth/guard.ts";
import { listDockBarcos } from "@/server/barcos/list.ts";

const estado = (b: { chargesEnabled: boolean; payoutsEnabled: boolean }) =>
  b.payoutsEnabled ? "Cobra y recibe depósitos" : b.chargesEnabled ? "Cobra" : "Sin verificar";

export default async function BarcosPage({ params }: { params: Promise<{ muelleId: string }> }) {
  const { muelleId } = await params;
  const { userId } = await requireDockOwnership(muelleId, `/muelle/${muelleId}/barcos`);
  const barcos = await listDockBarcos(userId, muelleId);
  return (
    <main>
      <h1>Barcos</h1>
      <table>
        <thead><tr><th>Empresa</th><th>Membresía</th><th>Cuenta de cobro</th></tr></thead>
        <tbody>
          {barcos.map((b) => (
            <tr key={b.id}><td>{b.name}</td><td>{b.planName ?? "Sin nivel"}</td><td>{estado(b)}</td></tr>
          ))}
        </tbody>
      </table>
      {barcos.length === 0 && <p>Todavía no hay barcos colgados de este muelle.</p>}
    </main>
  );
}
