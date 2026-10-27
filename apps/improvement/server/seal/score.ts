// El puntaje del Sello Cénit de un barco o una afiliada, calculado desde el expediente. Vive en
// Improvement porque los requisitos `kpi` usan los adaptadores de server/kpis/sources.ts. No corre en
// nombre de nadie: lo llaman el cron del Sello y las pruebas. Requisitos, puntos y mínimo son filas.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { affiliate, muelleSettings, sealRequirement, sealRequirementResult } from "@jotapuntoce/db/schema";
import { computeKpiValues, kpiSource } from "../kpis/sources.ts";

export const sealKpiConfigSchema = z.object({
  source: z.string(),
  config: z.unknown().default({}),
  op: z.enum(["gte", "lte"]),
  threshold: z.number().finite(),
});

export type SealSubject = { kind: "barco"; orgId: string } | { kind: "afiliada"; affiliateId: string };

export interface SealScore {
  score: number;
  minScore: number | null;
  meets: boolean;
  detail: { requirementId: string; met: boolean; points: number }[];
}

type Requirement = typeof sealRequirement.$inferSelect;

/** Un requisito `kpi` se cumple solo con config válida, fuente que consulta la base y un org donde medir. */
async function kpiMet(req: Requirement, orgId: string | null): Promise<boolean> {
  const parsed = sealKpiConfigSchema.safeParse(req.config);
  if (!parsed.success || !orgId || !kpiSource(parsed.data.source)?.load) return false;
  const { source, config, op, threshold } = parsed.data;
  const id = req.id;
  const values = await computeKpiValues([{ id, orgId, label: "", hint: null, source, config, manualValue: null, format: "numero" }]);
  const value = values.get(id) ?? 0;
  return op === "gte" ? value >= threshold : value <= threshold;
}

export async function computeSealScore(subject: SealSubject, muelleId: string): Promise<SealScore> {
  const [requirements, [settings], results, kpiOrgId] = await Promise.all([
    db
      .select()
      .from(sealRequirement)
      .where(and(eq(sealRequirement.muelleOrgId, muelleId), eq(sealRequirement.active, true)))
      .orderBy(asc(sealRequirement.code)),
    db.select({ minSealScore: muelleSettings.minSealScore }).from(muelleSettings).where(eq(muelleSettings.muelleOrgId, muelleId)),
    db
      .select({ requirementId: sealRequirementResult.requirementId })
      .from(sealRequirementResult)
      .where(
        and(
          eq(sealRequirementResult.muelleOrgId, muelleId),
          eq(sealRequirementResult.met, true),
          subject.kind === "barco"
            ? eq(sealRequirementResult.barcoOrgId, subject.orgId)
            : eq(sealRequirementResult.affiliateId, subject.affiliateId),
        ),
      ),
    subject.kind === "barco"
      ? subject.orgId
      : db
          .select({ barcoOrgId: affiliate.barcoOrgId })
          .from(affiliate)
          .where(eq(affiliate.id, subject.affiliateId))
          .then(([row]) => row?.barcoOrgId ?? null),
  ]);

  const metManual = new Set(results.map((r) => r.requirementId));
  const detail = await Promise.all(
    requirements.map(async (req) => ({
      requirementId: req.id,
      points: req.points,
      met: req.source === "manual" ? metManual.has(req.id) : await kpiMet(req, kpiOrgId),
    })),
  );

  const score = detail.reduce((sum, d) => sum + (d.met ? d.points : 0), 0);
  const minScore = settings?.minSealScore ?? null;
  return { score, minScore, meets: minScore !== null && score >= minScore, detail };
}
