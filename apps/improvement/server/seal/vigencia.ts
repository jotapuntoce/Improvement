// La vigencia continua del Sello Cénit: el cron recalcula el puntaje de cada barco y afiliada activa de
// cada muelle, mueve la vigencia de sus certificados y deja una evaluación pendiente a quien ya cumple.
// No corre en nombre de nadie: solo lo llaman app/api/cron/sello/route.ts (tras el bearer) y las pruebas.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, muelleSettings, organization, SEAL_VIGENCIA, sealEvaluation } from "@jotapuntoce/db/schema";
import { computeSealScore, type SealSubject } from "./score.ts";

export type Vigencia = (typeof SEAL_VIGENCIA)[number];

const DAY_MS = 86_400_000;

/** Transición pura. `reevaluacion` no vuelve sola a `vigente`: eso exige una aprobación nueva de los socios. */
export function nextVigencia({
  vigencia,
  meets,
  riskSince,
  now,
  graceDays,
}: {
  vigencia: Vigencia;
  meets: boolean;
  riskSince: Date | null;
  now: Date;
  graceDays: number;
}): { vigencia: Vigencia; riskSince: Date | null } {
  const dias = riskSince ? (now.getTime() - riskSince.getTime()) / DAY_MS : 0;
  switch (vigencia) {
    case "vigente":
      return meets ? { vigencia: "vigente", riskSince: null } : { vigencia: "en_riesgo", riskSince: now };
    case "en_riesgo":
      if (meets) return { vigencia: "vigente", riskSince: null };
      return { vigencia: dias >= graceDays ? "reevaluacion" : "en_riesgo", riskSince };
    case "reevaluacion":
      return { vigencia: dias >= 2 * graceDays ? "suspendido" : "reevaluacion", riskSince };
    case "suspendido":
      return { vigencia: "suspendido", riskSince };
  }
}

const subjectWhere = (s: SealSubject) =>
  s.kind === "barco" ? eq(sealEvaluation.barcoOrgId, s.orgId) : eq(sealEvaluation.affiliateId, s.affiliateId);

export async function runSealCycle({ now = new Date(), muelleId }: { now?: Date; muelleId?: string } = {}) {
  const totals = { evaluated: 0, transitions: 0, pending: 0 };
  const muelles = await db
    .select({ muelleOrgId: muelleSettings.muelleOrgId, graceDays: muelleSettings.graceDays })
    .from(muelleSettings)
    .where(muelleId ? eq(muelleSettings.muelleOrgId, muelleId) : undefined);

  for (const { muelleOrgId, graceDays } of muelles) {
    const [barcos, affiliates] = await Promise.all([
      db.select({ id: organization.id }).from(organization).where(eq(organization.parentOrgId, muelleOrgId)),
      db
        .select({ id: affiliate.id })
        .from(affiliate)
        .where(and(eq(affiliate.muelleOrgId, muelleOrgId), eq(affiliate.status, "activa"))),
    ]);
    const subjects: SealSubject[] = [
      ...barcos.map((b) => ({ kind: "barco" as const, orgId: b.id })),
      ...affiliates.map((a) => ({ kind: "afiliada" as const, affiliateId: a.id })),
    ];

    // ponytail: un sujeto a la vez; en lotes si un muelle crece a cientos de sujetos.
    for (const subject of subjects) {
      const { score, minScore, meets } = await computeSealScore(subject, muelleOrgId);
      totals.evaluated++;

      const [cert] = await db
        .select()
        .from(sealEvaluation)
        .where(
          and(
            subjectWhere(subject),
            eq(sealEvaluation.muelleOrgId, muelleOrgId),
            eq(sealEvaluation.approvalStatus, "aprobada"),
            inArray(sealEvaluation.vigencia, ["vigente", "en_riesgo", "reevaluacion"]),
          ),
        )
        .orderBy(desc(sealEvaluation.approvedAt))
        .limit(1);

      if (cert?.vigencia) {
        const next = nextVigencia({ vigencia: cert.vigencia, meets, riskSince: cert.riskSince, now, graceDays });
        if (next.vigencia !== cert.vigencia) totals.transitions++;
        await db
          .update(sealEvaluation)
          .set({ score, minScore, lastComputedAt: now, vigencia: next.vigencia, riskSince: next.riskSince })
          .where(eq(sealEvaluation.id, cert.id));
        continue;
      }
      if (!meets) continue;

      // Una sola pendiente por sujeto: el índice parcial uq_seal_eval_pending_* la hace upsert.
      const isBarco = subject.kind === "barco";
      await db
        .insert(sealEvaluation)
        .values({
          muelleOrgId,
          subjectKind: subject.kind,
          barcoOrgId: isBarco ? subject.orgId : null,
          affiliateId: isBarco ? null : subject.affiliateId,
          score,
          minScore,
          lastComputedAt: now,
        })
        .onConflictDoUpdate({
          target: isBarco ? sealEvaluation.barcoOrgId : sealEvaluation.affiliateId,
          targetWhere: sql`${sealEvaluation.approvalStatus} = 'pendiente'`,
          set: { score, minScore, lastComputedAt: now },
        });
      totals.pending++;
    }
  }
  return totals;
}
