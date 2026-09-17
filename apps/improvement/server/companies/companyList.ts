// Lógica pura del panel de empresas (/empresas) — misma derivación de etapa actual que ya usa
// apps/admin/app/improvement/page.js (deriveCurrentStageName), portada a TypeScript. Sin acceso a
// datos — server/companies/loadCompanies.ts alimenta esto con filas reales.
export interface StageRow {
  stageOrder: number;
  stageName: string;
  status: "bloqueada" | "en_progreso" | "completada";
}

export interface OrgRow {
  id: string;
  name: string;
  industry: string | null;
}

export interface CompanySummary {
  orgId: string;
  name: string;
  industry: string | null;
  stageLabel: string;
  /** Las 8 fases en orden — el tracker del panel las dibuja todas, no solo la actual. */
  stages: StageRow[];
  /** Índice dentro de `stages` de la fase donde va la empresa, o -1 si todavía no empieza. */
  currentIndex: number;
}

/**
 * WHEN hay una etapa en_progreso THE SYSTEM SHALL devolver su stageName, con prioridad sobre
 * cualquier etapa completada (criterio #1). WHEN no hay ninguna en_progreso pero la última está
 * completada THE SYSTEM SHALL devolver esa (criterio #2). WHEN no hay ninguna etapa THE SYSTEM
 * SHALL devolver "Sin etapa activa" (criterio #3).
 */
export function deriveStageLabel(stages: StageRow[]): string {
  const inProgress = stages.find((s) => s.status === "en_progreso");
  if (inProgress) return inProgress.stageName;

  const last = stages[stages.length - 1];
  if (last?.status === "completada") return last.stageName;

  return "Sin etapa activa";
}

/**
 * En qué fase va la empresa, como índice dentro de la lista ordenada. Misma prioridad que
 * deriveStageLabel — la primera en_progreso; si no hay ninguna, la última si está completada (mapa
 * terminado); si no, -1: nada que marcar todavía.
 *
 * Vive aquí, junto a deriveStageLabel, porque las dos aplican exactamente la misma regla: tenerla
 * dos veces era garantizar que una cambiara sin la otra. server/scene/buildMap.ts la reexporta para
 * sus callers.
 */
// El parámetro pide `{ status: string }` y no el union estrecho de StageRow a propósito: el otro
// caller (getBuildMap) le pasa filas crudas de org_build_stage, donde status es text y llega como
// string. La función solo compara contra dos literales, así que aceptar string es correcto y evita
// un cast en el borde de la base.
export function deriveCurrentStageIndex(stages: { status: string }[]): number {
  const inProgressIndex = stages.findIndex((s) => s.status === "en_progreso");
  if (inProgressIndex !== -1) return inProgressIndex;

  const last = stages[stages.length - 1];
  if (last && last.status === "completada") return stages.length - 1;

  return -1;
}

/**
 * WHEN buildCompanyList recibe N organizaciones THE SYSTEM SHALL devolver N CompanySummary, cada
 * uno con el stageLabel derivado únicamente de sus propias etapas (criterio #1) — nunca mezcla
 * etapas entre organizaciones distintas.
 */
export function buildCompanyList(orgs: OrgRow[], stagesByOrgId: Map<string, StageRow[]>): CompanySummary[] {
  return orgs.map((org) => {
    const stages = stagesByOrgId.get(org.id) ?? [];
    return {
      orgId: org.id,
      name: org.name,
      industry: org.industry,
      stageLabel: deriveStageLabel(stages),
      stages,
      currentIndex: deriveCurrentStageIndex(stages),
    };
  });
}
