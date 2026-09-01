// Mapa de Construcción — de solo lectura (Non-Goals: sin comentarios/chat, sin controles de
// escritura para owner ni empleado). org_build_stage lo edita a mano Jose Carlos desde apps/admin.
import { asc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { orgBuildStage } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";

export type BuildStage = typeof orgBuildStage.$inferSelect;

/**
 * WHEN ninguna etapa está en_progreso y la última está completada THE SYSTEM SHALL marcar esa
 * última como la etapa actual (criterio #3). Prioridad: la primera en_progreso; si no hay ninguna,
 * la última si está completada (mapa terminado); si no, -1 — nada que marcar "estás aquí" todavía.
 * Función pura — separada de getBuildMap() para poder probar la derivación sin tocar la base.
 */
export function deriveCurrentStageIndex(stages: Pick<BuildStage, "status">[]): number {
  const inProgressIndex = stages.findIndex((s) => s.status === "en_progreso");
  if (inProgressIndex !== -1) return inProgressIndex;

  const last = stages[stages.length - 1];
  if (last && last.status === "completada") return stages.length - 1;

  return -1;
}

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
