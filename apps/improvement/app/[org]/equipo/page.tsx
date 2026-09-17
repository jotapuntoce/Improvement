// Nivel de responsabilidad propio + lista de empleados (owner) — §9.6 del blueprint. El owner NUNCA
// ve el número por persona (Pitfalls §02-producto-core): esta rama usa listTeamForOwner(), cuyo
// shape no trae ese campo, así que no hay forma de filtrarlo mal aquí — no existe en el dato.
import Link from "next/link";
import { requireSection } from "@/server/auth/guard";
import { getResponsibilityLevel, listTeamForOwner } from "@/server/employees/responsibility";
import { listTeammates } from "@/server/employees/teammates";
import { listLiveInvitations } from "@/server/invitations/loadInvitations";

const pageStyle = {
  minHeight: "100vh",
  background: "var(--bg)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-geist-sans), sans-serif",
  padding: "32px 24px",
  display: "flex",
  flexDirection: "column" as const,
  gap: "20px",
  maxWidth: "560px",
  margin: "0 auto",
};

const cardStyle = {
  padding: "16px",
  borderRadius: "var(--radius-md, 16px)",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
};

// Botones de Equipo (owner): mismo look que .panel-cta/.panel-btn-ghost de globals.css, pero en
// style={} porque esta página entera usa objetos inline (pageStyle/cardStyle) y no clases CSS — meter
// una className aquí sería incoherente con el resto del archivo.
const primaryLinkStyle = {
  padding: "10px 18px",
  borderRadius: "var(--radius-sm, 10px)",
  fontWeight: 600,
  fontSize: "14px",
  textDecoration: "none",
  background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
  color: "var(--bg)",
};

const ghostLinkStyle = {
  padding: "10px 18px",
  borderRadius: "var(--radius-sm, 10px)",
  border: "1px solid var(--border-strong)",
  fontSize: "14px",
  textDecoration: "none",
  color: "var(--text-secondary)",
};

export default async function EquipoPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const { membership: memberRow, scope } = await requireSection(orgId, "equipo");

  if (memberRow.role === "owner") {
    const team = await listTeamForOwner(orgId);
    const invitaciones = await listLiveInvitations(orgId);
    return (
      <main style={pageStyle}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Equipo</h1>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link href={`/${orgId}/equipo/invitar`} style={primaryLinkStyle}>
            Invitar a alguien
          </Link>
          <Link href={`/${orgId}/equipo/permisos`} style={ghostLinkStyle}>
            Tipos de permiso
          </Link>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {team.map((member) => (
            <li key={member.userId} style={{ ...cardStyle, display: "flex", justifyContent: "space-between" }}>
              <span>{member.fullName ?? member.email}</span>
              <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                {member.role === "owner" ? "Dueño" : "Empleado"}
              </span>
            </li>
          ))}
        </ul>
        {invitaciones.length > 0 && (
          <section>
            <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Invitaciones sin usar</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {invitaciones.map((inv) => (
                <li key={inv.id} style={cardStyle}>
                  {inv.email} · {inv.typeName ?? "sin tipo"} · vence el{" "}
                  {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(inv.expiresAt)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    );
  }

  const level = await getResponsibilityLevel(memberRow.userId, memberRow.userId, orgId);
  const companeros = await listTeammates(orgId, scope === "area" ? memberRow.areaId : null);
  return (
    <main style={pageStyle}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Tu equipo</h1>
      <div style={cardStyle}>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "13px" }}>Tu nivel (últimos 90 días)</p>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "32px",
            fontWeight: 700,
            background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {level}%
        </p>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
        {companeros.map((c) => (
          <li key={c.userId} style={cardStyle}>
            <p style={{ margin: 0 }}>{c.fullName ?? c.email}</p>
            {c.jobTitle && (
              <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "13px" }}>{c.jobTitle}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
