// Firma de los dos (decisión de Jose Carlos y Ricardo): un dueño propone, OTRO decide. La base
// también lo exige (check fee_rate_change_otra_firma); aquí se valida antes para dar un error claro.
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { FEE_CHARGE_KINDS, feeRate, feeRateChange, organization } from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";
import type { Result } from "../result.ts";
import type { RateRow } from "./rates.ts";

const proposalSchema = z.object({
  barcoOrgId: z.string().uuid().nullable().default(null),
  chargeKind: z.enum(FEE_CHARGE_KINDS),
  percentBps: z.number().int().min(0).max(10_000),
  fixedCents: z.number().int().min(0).default(0),
});

export async function proposeFeeChange(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertDockOwner(userId, muelleId);
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Tasa inválida: porcentaje entre 0 y 100 %, cuota fija en centavos." };
  if (parsed.data.barcoOrgId) {
    const [boat] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(and(eq(organization.id, parsed.data.barcoOrgId), eq(organization.parentOrgId, muelleId)))
      .limit(1);
    if (!boat) return { ok: false, error: "Ese barco no es de este muelle." };
  }
  const [row] = await db
    .insert(feeRateChange)
    .values({ muelleOrgId: muelleId, ...parsed.data, proposedBy: userId })
    .returning({ id: feeRateChange.id });
  if (!row) throw new Error("insert de fee_rate_change no devolvió fila");
  return { ok: true, data: row };
}

export async function decideFeeChange(
  userId: string,
  changeId: string,
  decision: "aprobado" | "rechazado",
): Promise<Result<{ id: string }>> {
  const [change] = await db.select().from(feeRateChange).where(eq(feeRateChange.id, changeId)).limit(1);
  if (!change) notFound();
  await assertDockOwner(userId, change.muelleOrgId);
  if (change.proposedBy === userId) return { ok: false, error: "Necesita la firma del otro dueño." };
  if (change.decision) return { ok: false, error: "Este cambio ya se decidió." };

  const decided = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(feeRateChange)
      .set({ decidedBy: userId, decidedAt: new Date(), decision })
      .where(and(eq(feeRateChange.id, changeId), isNull(feeRateChange.decision)))
      .returning({ id: feeRateChange.id });
    if (claimed.length === 0) return false; // otro decidió entre la lectura y el update
    if (decision !== "aprobado") return true;

    const scope = and(
      eq(feeRate.muelleOrgId, change.muelleOrgId),
      change.barcoOrgId ? eq(feeRate.barcoOrgId, change.barcoOrgId) : isNull(feeRate.barcoOrgId),
      eq(feeRate.chargeKind, change.chargeKind),
    );
    const [existing] = await tx.select({ id: feeRate.id }).from(feeRate).where(scope).limit(1);
    if (existing) {
      await tx
        .update(feeRate)
        .set({ percentBps: change.percentBps, fixedCents: change.fixedCents, updatedAt: new Date() })
        .where(eq(feeRate.id, existing.id));
    } else {
      await tx.insert(feeRate).values({
        muelleOrgId: change.muelleOrgId,
        barcoOrgId: change.barcoOrgId,
        chargeKind: change.chargeKind,
        percentBps: change.percentBps,
        fixedCents: change.fixedCents,
      });
    }
    return true;
  });
  if (!decided) return { ok: false, error: "Este cambio ya se decidió." };
  return { ok: true, data: { id: changeId } };
}

export async function listRates(muelleId: string): Promise<RateRow[]> {
  return db
    .select({ barcoOrgId: feeRate.barcoOrgId, chargeKind: feeRate.chargeKind, percentBps: feeRate.percentBps, fixedCents: feeRate.fixedCents })
    .from(feeRate)
    .where(eq(feeRate.muelleOrgId, muelleId));
}

export async function listPendingChanges(muelleId: string) {
  return db
    .select()
    .from(feeRateChange)
    .where(and(eq(feeRateChange.muelleOrgId, muelleId), isNull(feeRateChange.decision)));
}
