// Cobros del barco: lo que se cobró y la comisión de Summum. Conectar la cuenta y crear ligas de
// cobro se hace en Summum (las llaves de Stripe no entran a Improvement); aquí solo el enlace.
import { requireSection } from "@/server/auth/guard.ts";
import { listOrgLedger } from "@/server/cobros/ledger.ts";
import { env } from "@/lib/env.ts";

const KIND_LABEL: Record<string, string> = { venta_propia: "Venta", membresia: "Membresía", proyecto_summum: "Proyecto" };

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export default async function CobrosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const { membership: me } = await requireSection(orgId, "cobros");
  const rows = await listOrgLedger(me.userId, orgId);
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "32px 24px", maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Cobros</h1>
      {env.NEXT_PUBLIC_SUMMUM_URL && (
        <a href={`${env.NEXT_PUBLIC_SUMMUM_URL}/barco/${orgId}`} style={{ color: "var(--accent-2)" }}>
          Conectar tu cuenta o crear una liga de cobro en Summum →
        </a>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        {rows.map((r) => (
          <li key={r.id} style={{ padding: "16px", borderRadius: "var(--radius-md, 16px)", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            {r.createdAt.toLocaleDateString("es-MX")} · {KIND_LABEL[r.chargeKind] ?? r.chargeKind} · {money(r.grossCents, r.currency)} · Summum: {money(r.summumFeeCents, r.currency)}
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p style={{ color: "var(--text-secondary)" }}>Sin cobros todavía.</p>}
    </main>
  );
}
