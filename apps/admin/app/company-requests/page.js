// Solicitudes de auto-registro de empresa — un cliente ya logueado en apps/improvement pide agregar
// otra empresa a su portafolio (app/empresas/page.tsx allá), Jose Carlos aprueba o rechaza aquí.
// Aprobar crea el organization real + membership(owner) + primera etapa del mapa (actions.js),
// mismo resultado final que provisionar un prospecto, sin la parte de crear cuenta nueva.
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { companyRequest, profile } from "@jotapuntoce/db/schema";
import { approveCompanyRequestAction, rejectCompanyRequestAction } from "./actions.js";

const STATUS_LABEL = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

// Mismos 8 giros que packages/ui/src/building/industries.ts (apps/admin es JS puro, sin este
// import cross-package todavía — duplicado deliberado de una lista de 8 valores, no vale la pena el
// acoplamiento por esto solo).
const INDUSTRY_LABEL = {
  restaurante: "Restaurante",
  retail: "Tienda / Retail",
  servicios: "Servicios profesionales",
  salud: "Salud",
  construccion: "Construcción",
  tecnologia: "Tecnología",
  manufactura: "Manufactura",
  otro: "Otro",
};

export default async function CompanyRequestsPage() {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: companyRequest.id,
      companyName: companyRequest.companyName,
      industry: companyRequest.industry,
      status: companyRequest.status,
      createdAt: companyRequest.createdAt,
      requesterName: profile.fullName,
      requesterEmail: profile.email,
    })
    .from(companyRequest)
    .innerJoin(profile, eq(profile.id, companyRequest.requesterId))
    .orderBy(desc(companyRequest.createdAt));

  const pending = rows.filter((r) => r.status === "pending");
  const reviewed = rows.filter((r) => r.status !== "pending");

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <Link href="/" className="page-back-link">
            ← Dashboard
          </Link>
          <h2>Solicitudes de empresa</h2>
          <p className="topbar-subtitle">Auto-registro de clientes ya logueados en Improvement.</p>
        </div>
      </section>

      {pending.length === 0 ? (
        <p className="empty-hint">Sin solicitudes pendientes.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {pending.map((r) => {
            async function approve() {
              "use server";
              await approveCompanyRequestAction(r.id);
              revalidatePath("/company-requests");
            }
            async function reject() {
              "use server";
              await rejectCompanyRequestAction(r.id);
              revalidatePath("/company-requests");
            }

            return (
              <li
                key={r.id}
                className="product-card"
                style={{
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p style={{ fontWeight: 600, margin: 0 }}>
                    {r.companyName}
                    {r.industry && (
                      <span className="product-desc" style={{ fontWeight: 400 }}>
                        {" "}
                        · {INDUSTRY_LABEL[r.industry] ?? r.industry}
                      </span>
                    )}
                  </p>
                  <p className="product-desc" style={{ margin: "4px 0 0" }}>
                    {r.requesterName ?? r.requesterEmail} · {r.requesterEmail}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <form action={approve}>
                    <button type="submit" className="btn btn-primary">
                      Aprobar
                    </button>
                  </form>
                  <form action={reject}>
                    <button type="submit" className="btn btn-ghost" style={{ color: "var(--danger)" }}>
                      Rechazar
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reviewed.length > 0 && (
        <>
          <h3 style={{ margin: "8px 0 0" }}>Ya revisadas</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            {reviewed.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {r.companyName} <span className="product-desc">· {r.requesterEmail}</span>
                </span>
                <span className="category-chip" style={{ "--chip-color": "var(--accent-2)" }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
