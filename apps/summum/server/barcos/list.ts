// Los barcos de un muelle, solo con datos de nivel muelle: nada de lo interno del barco.
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membershipPlan, organization, stripeAccount } from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";

export async function listDockBarcos(userId: string, muelleId: string) {
  await assertDockOwner(userId, muelleId);
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      planName: membershipPlan.name,
      chargesEnabled: stripeAccount.chargesEnabled,
      payoutsEnabled: stripeAccount.payoutsEnabled,
    })
    .from(organization)
    .leftJoin(membershipPlan, eq(membershipPlan.id, organization.membershipPlanId))
    .leftJoin(stripeAccount, eq(stripeAccount.orgId, organization.id))
    .where(and(eq(organization.parentOrgId, muelleId), eq(organization.kind, "barco")))
    .orderBy(organization.name);
  return rows.map((r) => ({ ...r, chargesEnabled: r.chargesEnabled ?? false, payoutsEnabled: r.payoutsEnabled ?? false }));
}
