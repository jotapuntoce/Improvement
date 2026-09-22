// Puente entre datos reales y buildBuildingGraph — apps/*/app/** nunca importa @jotapuntoce/db
// directo (boundaries, CLAUDE.md). Mismo patrón que server/employees/loadTeamStatus.ts.
import { asc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, organization, orgBuildStage } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { buildBuildingGraph, type BuildingGraph } from "./buildingGraph.ts";

export async function loadBuilding(userId: string, orgId: string): Promise<BuildingGraph> {
  await assertMembership(userId, orgId);

  const [org] = await db
    .select({
      name: organization.name,
      slogan: organization.slogan,
      accentColor: organization.accentColor,
      industry: organization.industry,
    })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) throw new Error(`organization ${orgId} no existe`);

  const [areas, stages] = await Promise.all([
    db
      .select({
        id: area.id,
        name: area.name,
        color: area.color,
        description: area.description,
        icon: area.icon,
      })
      .from(area)
      .where(eq(area.orgId, orgId))
      .orderBy(asc(area.createdAt)),
    // La MISMA fuente que el tracker del panel (org_build_stage). El edificio no calcula su
    // propio avance: lee el de siempre, así los dos no pueden contradecirse.
    db
      .select({
        status: orgBuildStage.status,
        stageName: orgBuildStage.stageName,
        stageOrder: orgBuildStage.stageOrder,
      })
      .from(orgBuildStage)
      .where(eq(orgBuildStage.orgId, orgId))
      .orderBy(asc(orgBuildStage.stageOrder)),
  ]);

  return buildBuildingGraph(org, areas, stages);
}
