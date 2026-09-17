// Puente entre datos reales y buildSceneGraph — necesario porque las rutas de apps/*/app/** nunca
// importan @jotapuntoce/db directo (regla de boundaries, CLAUDE.md). sceneGraph.ts se queda puro.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, profile } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { buildSceneGraph, type SceneGraph } from "./sceneGraph.ts";

/**
 * Alcance de "equipo", resuelto ADENTRO con resolveSection — mismo patrón que listTeammates y
 * listObjectives, para que ningún llamador pueda olvidar filtrar antes de pintar los avatares. Las
 * áreas (zones) se muestran completas siempre: son estructura de la empresa (nombre + color), no
 * dato personal — el mismo listado ya lo ve cualquier invitado sin membership todavía, en
 * AcceptForm.tsx. Lo que hay que cerrar es la lista de personas y su punto de estado.
 *
 * `ninguno` → sin avatares. `area` sin área asignada (onDelete: set null) → cero, nunca la empresa
 * entera. `empresa` (y dueño, vía scopeFor) → todos.
 */
export async function loadDashboardScene(userId: string, orgId: string): Promise<SceneGraph> {
  const { membership: member, scope } = await resolveSection(userId, orgId, "equipo");

  const areas = await db.select().from(area).where(eq(area.orgId, orgId));

  if (scope === "ninguno") {
    return buildSceneGraph(areas, []);
  }

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

  const employees = members.map((m) => ({
    id: m.userId,
    name: m.fullName ?? m.email,
    objectives: objectives
      .filter((o) => o.assignedEmployeeId === m.userId)
      .map((o) => ({ status: o.status, dueDate: o.dueDate })),
  }));

  return buildSceneGraph(areas, employees);
}
