// Lógica pura del panel de empresas (/empresas) — misma derivación de etapa actual que ya usa
// apps/admin/app/improvement/page.js (deriveCurrentStageName), portada a TypeScript. Sin acceso a
// datos — server/companies/loadCompanies.ts alimenta esto con filas reales.
export interface StageRow {
  stageName: string;
  status: "bloqueada" | "en_progreso" | "completada";
}

export interface OrgRow {
  id: string;
  name: string;
}

export interface CompanySummary {
  orgId: string;
  name: string;
  stageLabel: string;
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
 * WHEN buildCompanyList recibe N organizaciones THE SYSTEM SHALL devolver N CompanySummary, cada
 * uno con el stageLabel derivado únicamente de sus propias etapas (criterio #1) — nunca mezcla
 * etapas entre organizaciones distintas.
 */
export function buildCompanyList(orgs: OrgRow[], stagesByOrgId: Map<string, StageRow[]>): CompanySummary[] {
  return orgs.map((org) => ({
    orgId: org.id,
    name: org.name,
    stageLabel: deriveStageLabel(stagesByOrgId.get(org.id) ?? []),
  }));
}
