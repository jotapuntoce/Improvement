import { requireOrgMembership } from "@/server/auth/guard.ts";
import { loadBuilding } from "@/server/building/loadBuilding.ts";
import { BuildingExperience } from "./BuildingExperience.tsx";

export default async function EmpresaBuildingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);
  const graph = await loadBuilding(memberRow.userId, orgId);

  return <BuildingExperience orgId={orgId} graph={graph} />;
}
