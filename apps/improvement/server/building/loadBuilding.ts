// Puente entre datos reales y buildBuildingGraph — apps/*/app/** nunca importa @jotapuntoce/db
// directo (boundaries, CLAUDE.md). Mismo patrón que server/scene/loadDashboardScene.ts.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, organization } from "@jotapuntoce/db/schema";
import { buildBuildingGraph, type BuildingGraph } from "./buildingGraph.ts";

export async function loadBuilding(orgId: string): Promise<BuildingGraph> {
  const [org] = await db
    .select({ name: organization.name, slogan: organization.slogan, accentColor: organization.accentColor })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) throw new Error(`organization ${orgId} no existe`);

  const areas = await db
    .select({ id: area.id, name: area.name, color: area.color })
    .from(area)
    .where(eq(area.orgId, orgId));

  return buildBuildingGraph(org, areas);
}
