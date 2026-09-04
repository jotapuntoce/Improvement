// Puente entre datos reales y buildBuildingGraph — apps/*/app/** nunca importa @jotapuntoce/db
// directo (boundaries, CLAUDE.md). Mismo patrón que server/scene/loadDashboardScene.ts.
import { asc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, organization } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { buildBuildingGraph, type BuildingGraph } from "./buildingGraph.ts";

export async function loadBuilding(userId: string, orgId: string): Promise<BuildingGraph> {
  await assertMembership(userId, orgId);

  const [org] = await db
    .select({ name: organization.name, slogan: organization.slogan, accentColor: organization.accentColor })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) throw new Error(`organization ${orgId} no existe`);

  const areas = await db
    .select({ id: area.id, name: area.name, color: area.color })
    .from(area)
    .where(eq(area.orgId, orgId))
    .orderBy(asc(area.createdAt));

  return buildBuildingGraph(org, areas);
}
