// Nivel de responsabilidad propio + lista de empleados (owner) — §9.6 del blueprint. El owner NUNCA
// ve el número por persona (Pitfalls §02-producto-core): esta rama usa listTeamForOwner(), cuyo
// shape no trae ese campo, así que no hay forma de filtrarlo mal aquí — no existe en el dato.
import { requireOrgMembership } from "@/server/auth/guard";
import { getResponsibilityLevel, listTeamForOwner } from "@/server/employees/responsibility";

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

export default async function EquipoPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);

  if (memberRow.role === "owner") {
    const team = await listTeamForOwner(orgId);
    return (
      <main style={pageStyle}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Equipo</h1>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {team.map((member) => (
            <li key={member.userId} style={{ ...cardStyle, display: "flex", justifyContent: "space-between" }}>
              <span>{member.fullName ?? member.email}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                {member.role === "owner" ? "Dueño" : "Empleado"}
              </span>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const level = await getResponsibilityLevel(memberRow.userId, memberRow.userId, orgId);
  return (
    <main style={pageStyle}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Tu equipo</h1>
      <div style={cardStyle}>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "13px" }}>Tu nivel (últimos 90 días)</p>
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
    </main>
  );
}
