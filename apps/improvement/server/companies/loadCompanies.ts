// Puente entre datos reales y buildCompanyList — apps/*/app/** nunca importa @jotapuntoce/db
// directo (boundaries, CLAUDE.md).
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, orgBuildStage } from "@jotapuntoce/db/schema";
import { buildCompanyList, type CompanySummary, type StageRow } from "./companyList.ts";

export async function loadCompanies(userId: string): Promise<CompanySummary[]> {
  const orgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(membership.acceptedAt));

  if (orgs.length === 0) return [];

  const orgIds = orgs.map((o) => o.id);
  const stages = await db
    .select()
    .from(orgBuildStage)
    .where(inArray(orgBuildStage.orgId, orgIds))
    .orderBy(asc(orgBuildStage.stageOrder));

  const stagesByOrgId = new Map<string, StageRow[]>();
  for (const stage of stages) {
    const list = stagesByOrgId.get(stage.orgId) ?? [];
    list.push({ stageName: stage.stageName, status: stage.status as StageRow["status"] });
    stagesByOrgId.set(stage.orgId, list);
  }

  return buildCompanyList(orgs, stagesByOrgId);
}
