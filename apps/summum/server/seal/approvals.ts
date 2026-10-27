// Firma de los dos socios sobre una evaluación del Sello: uno firma primero, OTRO aprueba. La base también
// lo exige (check seal_evaluation_otra_firma); aquí se valida antes para dar el mensaje. Mismo patrón
// que server/fees/changes.ts.
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { affiliate, organization, sealEvaluation } from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";
import type { Result } from "../result.ts";

const OTRA_FIRMA = "Necesita la firma del otro dueño.";
const YA_DECIDIDO = "Este cambio ya se decidió.";

async function pendingEvaluation(userId: string, evaluationId: string) {
  if (!z.string().uuid().safeParse(evaluationId).success) notFound();
  const [row] = await db.select().from(sealEvaluation).where(eq(sealEvaluation.id, evaluationId)).limit(1);
  if (!row) notFound();
  await assertDockOwner(userId, row.muelleOrgId);
  return row;
}

const stillPending = (id: string) => and(eq(sealEvaluation.id, id), eq(sealEvaluation.approvalStatus, "pendiente"));

export async function approveEvaluation(userId: string, evaluationId: string): Promise<Result<{ status: "pendiente" | "aprobada" }>> {
  const ev = await pendingEvaluation(userId, evaluationId);
  if (ev.approvalStatus !== "pendiente") return { ok: false, error: YA_DECIDIDO };
  if (ev.firstApproverId === userId) return { ok: false, error: OTRA_FIRMA };

  const now = new Date();
  const update = ev.firstApproverId
    ? { secondApproverId: userId, approvalStatus: "aprobada" as const, approvedAt: now, vigencia: "vigente" as const, riskSince: null }
    : { firstApproverId: userId };
  const claimed = await db
    .update(sealEvaluation)
    .set({ ...update, updatedAt: now })
    .where(stillPending(ev.id))
    .returning({ id: sealEvaluation.id });
  if (claimed.length === 0) return { ok: false, error: YA_DECIDIDO }; // otro decidió entre la lectura y el update
  return { ok: true, data: { status: ev.firstApproverId ? "aprobada" : "pendiente" } };
}

export async function rejectEvaluation(userId: string, evaluationId: string): Promise<Result<true>> {
  const ev = await pendingEvaluation(userId, evaluationId);
  if (ev.approvalStatus !== "pendiente") return { ok: false, error: YA_DECIDIDO };
  const claimed = await db
    .update(sealEvaluation)
    .set({ approvalStatus: "rechazada", updatedAt: new Date() })
    .where(stillPending(ev.id))
    .returning({ id: sealEvaluation.id });
  if (claimed.length === 0) return { ok: false, error: YA_DECIDIDO };
  return { ok: true, data: true };
}

/** Las evaluaciones del muelle, las más recientes primero, con el nombre del barco o de la afiliada. */
export async function listEvaluations(userId: string, muelleId: string) {
  await assertDockOwner(userId, muelleId);
  const rows = await db
    .select({
      evaluation: sealEvaluation,
      barcoName: organization.name,
      affiliateName: affiliate.displayName,
    })
    .from(sealEvaluation)
    .leftJoin(organization, eq(organization.id, sealEvaluation.barcoOrgId))
    .leftJoin(affiliate, eq(affiliate.id, sealEvaluation.affiliateId))
    .where(eq(sealEvaluation.muelleOrgId, muelleId))
    .orderBy(desc(sealEvaluation.lastComputedAt));
  return rows.map((r) => ({ ...r.evaluation, subjectName: r.barcoName ?? r.affiliateName ?? "" }));
}
