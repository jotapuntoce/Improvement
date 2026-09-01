// Puente entre datos reales y buildSceneGraph — necesario porque las rutas de apps/*/app/** nunca
// importan @jotapuntoce/db directo (regla de boundaries, CLAUDE.md). sceneGraph.ts se queda puro.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, profile } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { buildSceneGraph, type SceneGraph } from "./sceneGraph.ts";

export async function loadDashboardScene(userId: string, orgId: string): Promise<SceneGraph> {
  await assertMembership(userId, orgId);

  const [areas, members, objectives] = await Promise.all([
    db.select().from(area).where(eq(area.orgId, orgId)),
    db
      .select({ userId: membership.userId, fullName: profile.fullName, email: profile.email })
      .from(membership)
      .innerJoin(profile, eq(profile.id, membership.userId))
      .where(eq(membership.orgId, orgId)),
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
