// Los barcos de un muelle, solo con datos de nivel muelle: nada de lo interno del barco.
import { and, eq, max } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, membershipPlan, organization, stripeAccount } from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";

/** Días que Stripe da para pagar cada factura (days_until_due de activateMembership). */
export const MEMBERSHIP_GRACE_DAYS = 7;

/**
 * Al corriente = el último pago de membresía cubre el periodo mensual en curso más los días de
 * gracia. Sin pago todavía (recién activada o nunca pagada) = no está al corriente.
 */
export function alCorriente(lastPaidAt: Date | null, now = new Date()): boolean {
  if (!lastPaidAt) return false;
  const coveredUntil = new Date(lastPaidAt);
  coveredUntil.setMonth(coveredUntil.getMonth() + 1);
  coveredUntil.setDate(coveredUntil.getDate() + MEMBERSHIP_GRACE_DAYS);
  return now <= coveredUntil;
}

export async function listDockBarcos(userId: string, muelleId: string) {
  await assertDockOwner(userId, muelleId);
  const lastPaid = db
    .select({ barcoOrgId: ledgerEntry.barcoOrgId, at: max(ledgerEntry.createdAt).as("last_paid_at") })
    .from(ledgerEntry)
    .where(and(eq(ledgerEntry.muelleOrgId, muelleId), eq(ledgerEntry.chargeKind, "membresia")))
    .groupBy(ledgerEntry.barcoOrgId)
    .as("last_paid");
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      planName: membershipPlan.name,
      chargesEnabled: stripeAccount.chargesEnabled,
      payoutsEnabled: stripeAccount.payoutsEnabled,
      lastPaidAt: lastPaid.at,
    })
    .from(organization)
    .leftJoin(membershipPlan, eq(membershipPlan.id, organization.membershipPlanId))
    .leftJoin(stripeAccount, eq(stripeAccount.orgId, organization.id))
    .leftJoin(lastPaid, eq(lastPaid.barcoOrgId, organization.id))
    .where(and(eq(organization.parentOrgId, muelleId), eq(organization.kind, "barco")))
    .orderBy(organization.name);
  const now = new Date();
  return rows.map(({ lastPaidAt, ...r }) => ({
    ...r,
    chargesEnabled: r.chargesEnabled ?? false,
    payoutsEnabled: r.payoutsEnabled ?? false,
    alCorriente: r.planName !== null && alCorriente(lastPaidAt, now),
  }));
}

export async function listMembershipPlans(userId: string, muelleId: string) {
  await assertDockOwner(userId, muelleId);
  return db
    .select({ id: membershipPlan.id, name: membershipPlan.name, monthlyAmountCents: membershipPlan.monthlyAmountCents })
    .from(membershipPlan)
    .where(eq(membershipPlan.muelleOrgId, muelleId))
    .orderBy(membershipPlan.monthlyAmountCents);
}
