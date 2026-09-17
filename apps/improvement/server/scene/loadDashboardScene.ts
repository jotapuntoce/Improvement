// Puente entre datos reales y buildSceneGraph — necesario porque las rutas de apps/*/app/** nunca
// importan @jotapuntoce/db directo (regla de boundaries, CLAUDE.md). sceneGraph.ts se queda puro.
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, profile } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { buildSceneGraph, type SceneGraph } from "./sceneGraph.ts";

export async function loadDashboardScene(userId: string, orgId: string): Promise<SceneGraph> {
  await assertMembership(userId, orgId);

  const [areas, members, objectives] = await Promise.all([
    db.select().from(area).where(eq(area.orgId, orgId)),
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
      .where(and(eq(membership.orgId, orgId), eq(profile.isPlatformAdmin, false))),
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
