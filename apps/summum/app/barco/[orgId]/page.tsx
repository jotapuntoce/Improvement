// La parte de Summum que usa el DUEÑO DEL BARCO.
import { requireBarcoOwnership } from "@/server/auth/guard.ts";
import { listBarcoLedgerForOwner } from "@/server/money/ledger.ts";
import { getAccountStatus } from "@/server/stripe/connect.ts";
import { Money } from "@/components/Money.tsx";
import { connect, sale } from "./actions.ts";

export default async function BarcoPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { orgId } = await params;
  const { error } = await searchParams;
  const { userId } = await requireBarcoOwnership(orgId);
  const account = await getAccountStatus(userId, orgId);
  const rows = await listBarcoLedgerForOwner(userId, orgId);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "24px" }}>
      <h1>Cobros</h1>
      {error && <p className="error">{error}</p>}
      {!account?.chargesEnabled ? (
        <form action={connect}><input type="hidden" name="orgId" value={orgId} /><button type="submit">Conectar mi cuenta de cobro</button></form>
      ) : (
        <form action={sale}>
          <input type="hidden" name="orgId" value={orgId} />
          <input name="description" placeholder="Concepto" required />
          <input name="amount" type="number" step="0.01" min="1" placeholder="Monto MXN" required />
          <button type="submit">Crear liga de cobro</button>
        </form>
      )}
      <table>
        <thead><tr><th>Fecha</th><th>Monto</th><th>Comisión Summum</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{r.createdAt.toLocaleDateString("es-MX")}</td><td><Money cents={r.grossCents} currency={r.currency} /></td><td><Money cents={r.summumFeeCents} currency={r.currency} /></td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
