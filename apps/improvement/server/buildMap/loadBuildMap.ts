// Mapa de Construcción — de solo lectura (Non-Goals: sin comentarios/chat, sin controles de
// escritura para owner ni empleado). org_build_stage lo edita a mano Jose Carlos desde apps/admin.
import { asc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { orgBuildStage } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";

export type BuildStage = typeof orgBuildStage.$inferSelect;

// WHEN ninguna etapa está en_progreso y la última está completada THE SYSTEM SHALL marcar esa última
// como la etapa actual (criterio #3). La implementación vive en server/companies/companyList.ts,
// junto a deriveStageLabel, que aplica exactamente la misma regla de prioridad — el panel del dueño
// necesitaba la misma derivación y tenerla escrita dos veces era garantizar que una se quedara
// atrás. Se reexporta para no romper a quien ya la importaba de aquí (tests/load-build-map.test.ts).
import { deriveCurrentStageIndex } from "../companies/companyList.ts";
export { deriveCurrentStageIndex };

export interface BuildMap {
  stages: BuildStage[];
  currentIndex: number;
}

/**
 * WHEN las etapas se listan THE SYSTEM SHALL respetar stage_order ascendente (criterio #2).
 */
export async function getBuildMap(userId: string, orgId: string): Promise<BuildMap> {
  await assertMembership(userId, orgId);

  const stages = await db
    .select()
    .from(orgBuildStage)
    .where(eq(orgBuildStage.orgId, orgId))
    .orderBy(asc(orgBuildStage.stageOrder));

  return { stages, currentIndex: deriveCurrentStageIndex(stages) };
}
