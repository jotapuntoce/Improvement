// Catálogo global de PowerUps con balance visible — §9.6 del blueprint. Server Component: requiere
// tenencia con requireOrgMembership antes de tocar cualquier dato, mismo patrón que /[org]/objetivos.
import { revalidatePath } from "next/cache";
import { requireOrgMembership } from "@/server/auth/guard";
import { listActivePowerups, pointsBalance, redeemPowerup } from "@/server/powerups/mutations";
import { RedeemPowerupButton } from "./RedeemPowerupButton.tsx";

export default async function PowerupsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);

  const [balance, catalog] = await Promise.all([
    pointsBalance(memberRow.userId),
    listActivePowerups(),
  ]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      <div>
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>PowerUps</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: "4px 0 0" }}>
          Balance disponible:{" "}
          <strong style={{ color: "var(--text-primary)" }}>{balance} pts</strong>
        </p>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        {catalog.map((partner) => {
          const canAfford = balance >= partner.pointsCost;

          async function redeem() {
            "use server";
            const row = await requireOrgMembership(orgId);
            await redeemPowerup(row.userId, orgId, partner.id);
            revalidatePath(`/${orgId}/powerups`);
          }

          return (
            <li
              key={partner.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "16px",
                borderRadius: "var(--radius-md, 16px)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
              }}
            >
              <div>
                <p style={{ fontWeight: 600, margin: 0 }}>{partner.businessName}</p>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "4px 0 0" }}>
                  {partner.discountDescription}
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "12px", margin: "6px 0 0" }}>
                  {partner.category} · {partner.pointsCost} pts
                </p>
              </div>
              <RedeemPowerupButton action={redeem} disabled={!canAfford} />
            </li>
          );
        })}
        {catalog.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Sin PowerUps disponibles todavía.</p>
        )}
      </ul>
    </main>
  );
}
