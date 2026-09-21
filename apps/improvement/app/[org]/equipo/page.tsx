// Nivel de responsabilidad propio + lista de empleados (owner) — §9.6 del blueprint. El owner NUNCA
// ve el número por persona (Pitfalls §02-producto-core): esta rama usa listTeamForOwner(), cuyo
// shape no trae ese campo, así que no hay forma de filtrarlo mal aquí — no existe en el dato.
import Link from "next/link";
import { requireSection } from "@/server/auth/guard";
import { getResponsibilityLevel, listTeamForOwner } from "@/server/employees/responsibility";
import { listTeammates } from "@/server/employees/teammates";
import { listLiveInvitations } from "@/server/invitations/loadInvitations";

export default async function EquipoPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const { membership: memberRow } = await requireSection(orgId, "equipo");

  if (memberRow.role === "owner") {
    const team = await listTeamForOwner(orgId);
    const invitaciones = await listLiveInvitations(orgId);
    return (
      <main className="config-page">
        <h1 className="config-title">Equipo</h1>
        <div className="permiso-actions">
          <Link href={`/${orgId}/equipo/invitar`} className="panel-cta">
            Invitar a alguien
          </Link>
          <Link href={`/${orgId}/equipo/permisos`} className="panel-btn-ghost">
            Tipos de permiso
          </Link>
        </div>
        <ul className="equipo-list">
          {team.map((member) => (
            <li key={member.userId} className="config-card">
              {/* La ficha es donde el dueño le cambia el acceso o lo da de baja. El suyo propio
                  también abre — la ficha explica ahí por qué no se puede editar. */}
              <Link href={`/${orgId}/equipo/${member.userId}`} className="equipo-row">
                <span>{member.fullName ?? member.email}</span>
                <span className="equipo-role">{member.role === "owner" ? "Dueño" : "Empleado"}</span>
              </Link>
            </li>
          ))}
        </ul>
        {invitaciones.length > 0 && (
          <>
            <h2 className="config-card-title">Invitaciones sin usar</h2>
            <ul className="equipo-list">
              {invitaciones.map((inv) => (
                <li key={inv.id} className="config-card">
                  {inv.email} · {inv.typeName ?? "sin tipo"} · vence el{" "}
                  {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(inv.expiresAt)}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    );
  }

  const level = await getResponsibilityLevel(memberRow.userId, memberRow.userId, orgId);
  const companeros = await listTeammates(memberRow.userId, orgId);
  return (
    <main className="config-page">
      <h1 className="config-title">Tu equipo</h1>
      <div className="config-card">
        <p className="config-hint">Tu nivel (últimos 90 días)</p>
        <p className="equipo-nivel">{level}%</p>
      </div>
      <ul className="equipo-list">
        {companeros.map((c) => (
          <li key={c.userId} className="config-card">
            <p className="equipo-name">{c.fullName ?? c.email}</p>
            {c.jobTitle && <p className="config-hint">{c.jobTitle}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
