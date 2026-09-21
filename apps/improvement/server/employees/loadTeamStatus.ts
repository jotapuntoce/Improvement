// Quiénes son el equipo de una empresa, y cómo va cada quien. Es lo que cuelga del muro de
// retratos de la recepción.
//
// Antes era server/scene/loadDashboardScene.ts y devolvía un "grafo de escena" con posiciones 3D
// para el panel viejo. Se borró el panel, se borró la escena, y el nombre quedó mintiendo: esto
// nunca cargó una escena, cargó al equipo.
//
// Alcance resuelto ADENTRO con resolveSection, como todo loader de la casa, para que ninguna
// pantalla pueda olvidar filtrar antes de pintar las caras. `ninguno` → nadie. `area` sin área
// asignada (onDelete: set null) → cero, nunca la empresa entera. `empresa` (y el dueño, vía
// scopeFor) → todos.
//
// Las áreas ya no se piden aquí: la recepción las saca del grafo del edificio, que es la misma
// fila y una consulta menos.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, objective, profile } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { deriveStatus, type PersonStatus } from "./teamStatus.ts";

export interface TeamMember {
  id: string;
  name: string;
  status: PersonStatus;
}

export async function loadTeamStatus(userId: string, orgId: string): Promise<TeamMember[]> {
  const { membership: member, scope } = await resolveSection(userId, orgId, "equipo");
  if (scope === "ninguno") return [];

  const memberConditions = [eq(membership.orgId, orgId), eq(profile.isPlatformAdmin, false)];
  if (scope === "area") {
    memberConditions.push(member.areaId ? eq(membership.areaId, member.areaId) : sql`false`);
  }

  const [members, objectives] = await Promise.all([
    // Excluye a los platform admins por el mismo motivo que listTeamForOwner (server/employees/
    // responsibility.ts): entran a cada org por rol para dar soporte, pero no son parte del equipo
    // del cliente — sin este filtro el dueño veía el correo personal de Jose Carlos entre su gente.
    // Son tres los lugares que cuentan o listan personas de un org para mostrárselas al cliente —
    // este, listTeamForOwner y el KPI "equipo" de server/kpis/loadKpis.ts. Si aparece un cuarto,
    // lleva este mismo filtro.
    db
      .select({ userId: membership.userId, fullName: profile.fullName, email: profile.email })
      .from(membership)
      .innerJoin(profile, eq(profile.id, membership.userId))
      .where(and(...memberConditions)),
    db.select().from(objective).where(eq(objective.orgId, orgId)),
  ]);

  return members.map((m) => ({
    id: m.userId,
    name: m.fullName ?? m.email,
    status: deriveStatus(
      objectives
        .filter((o) => o.assignedEmployeeId === m.userId)
        .map((o) => ({ status: o.status, dueDate: o.dueDate })),
    ),
  }));
}
