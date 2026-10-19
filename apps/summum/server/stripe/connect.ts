// Las acciones de Stripe del casco. Todas reciben Stripe por parámetro (StripeDeps) para poder
// probarlas sin red; las rutas pasan getStripe(). El dinero de las ventas cae en la cuenta del
// barco: Summum solo toma su application_fee (spec: Summum no retiene dinero).
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { membership, membershipPlan, organization, profile, stripeAccount } from "@jotapuntoce/db/schema";
import { assertBarcoOwner, assertDockOwner } from "../auth/guard.ts";
import { listRates } from "../fees/changes.ts";
import { feeCents, pickRate } from "../fees/rates.ts";
import type { Result } from "../result.ts";

export type StripeDeps = {
  stripe: Pick<Stripe, "accounts" | "accountLinks" | "checkout" | "customers" | "subscriptions">;
  baseUrl: string;
};

export const SALE_METADATA = z.object({
  barco_org_id: z.string().uuid(),
  muelle_org_id: z.string().uuid(),
  charge_kind: z.enum(["venta_propia", "proyecto_summum"]),
  percent_bps: z.coerce.number().int(),
  fixed_cents: z.coerce.number().int(),
});

async function accountRow(orgId: string) {
  const [row] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, orgId)).limit(1);
  return row ?? null;
}

export async function startOnboarding(userId: string, barcoId: string, deps: StripeDeps): Promise<Result<{ url: string }>> {
  await assertBarcoOwner(userId, barcoId);
  let row = await accountRow(barcoId);
  if (!row?.stripeAccountId) {
    const account = await deps.stripe.accounts.create({
      country: "MX",
      controller: { stripe_dashboard: { type: "express" }, fees: { payer: "application" }, losses: { payments: "application" } },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { barco_org_id: barcoId },
    });
    row = await db
      .insert(stripeAccount)
      .values({ orgId: barcoId, stripeAccountId: account.id })
      .onConflictDoUpdate({ target: stripeAccount.orgId, set: { stripeAccountId: account.id, updatedAt: new Date() } })
      .returning()
      .then((r) => r[0] ?? null);
  }
  const link = await deps.stripe.accountLinks.create({
    account: row!.stripeAccountId!,
    type: "account_onboarding",
    refresh_url: `${deps.baseUrl}/barco/${barcoId}`,
    return_url: `${deps.baseUrl}/barco/${barcoId}`,
  });
  return { ok: true, data: { url: link.url } };
}

const saleSchema = z.object({
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
});

export async function createSaleLink(userId: string, barcoId: string, input: unknown, deps: StripeDeps): Promise<Result<{ url: string }>> {
  const { muelleId } = await assertBarcoOwner(userId, barcoId);
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Monto en centavos enteros positivos y una descripción." };
  const row = await accountRow(barcoId);
  if (!row?.stripeAccountId || !row.chargesEnabled) return { ok: false, error: "Tu cuenta de cobro aún no está verificada." };

  const rate = pickRate(await listRates(muelleId), barcoId, "venta_propia");
  if (!rate) return { ok: false, error: "Summum aún no tiene comisión para este tipo de cobro." };

  const fee = feeCents(parsed.data.amountCents, rate);
  const session = await deps.stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "mxn", unit_amount: parsed.data.amountCents, product_data: { name: parsed.data.description } } }],
      payment_intent_data: {
        application_fee_amount: fee,
        metadata: {
          barco_org_id: barcoId,
          muelle_org_id: muelleId,
          charge_kind: "venta_propia",
          percent_bps: String(rate.percentBps),
          fixed_cents: String(rate.fixedCents),
        },
      },
      success_url: `${deps.baseUrl}/barco/${barcoId}?cobro=ok`,
      cancel_url: `${deps.baseUrl}/barco/${barcoId}`,
    },
    { stripeAccount: row.stripeAccountId },
  );
  if (!session.url) return { ok: false, error: "Stripe no devolvió la liga de cobro." };
  return { ok: true, data: { url: session.url } };
}

export async function activateMembership(
  userId: string,
  muelleId: string,
  barcoId: string,
  planId: string,
  deps: StripeDeps,
): Promise<Result<{ subscriptionId: string }>> {
  await assertDockOwner(userId, muelleId);
  const [boat] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(eq(organization.id, barcoId), eq(organization.parentOrgId, muelleId)))
    .limit(1);
  if (!boat) return { ok: false, error: "Ese barco no es de este muelle." };
  const [plan] = await db
    .select()
    .from(membershipPlan)
    .where(and(eq(membershipPlan.id, planId), eq(membershipPlan.muelleOrgId, muelleId)))
    .limit(1);
  if (!plan) return { ok: false, error: "Ese nivel no existe en este muelle." };

  let row = await accountRow(barcoId);
  if (!row?.stripeCustomerId) {
    const [owner] = await db
      .select({ email: profile.email })
      .from(membership)
      .innerJoin(profile, eq(profile.id, membership.userId))
      .where(and(eq(membership.orgId, barcoId), eq(membership.role, "owner")))
      .limit(1);
    const customer = await deps.stripe.customers.create({ email: owner?.email, metadata: { barco_org_id: barcoId } });
    row = await db
      .insert(stripeAccount)
      .values({ orgId: barcoId, stripeCustomerId: customer.id })
      .onConflictDoUpdate({ target: stripeAccount.orgId, set: { stripeCustomerId: customer.id, updatedAt: new Date() } })
      .returning()
      .then((r) => r[0] ?? null);
  }
  const sub = await deps.stripe.subscriptions.create({
    customer: row!.stripeCustomerId!,
    items: [{ price: plan.stripePriceId }],
    collection_method: "send_invoice",
    days_until_due: 7,
    metadata: { barco_org_id: barcoId, muelle_org_id: muelleId },
  });
  await db.update(organization).set({ membershipPlanId: plan.id, updatedAt: new Date() }).where(eq(organization.id, barcoId));
  return { ok: true, data: { subscriptionId: sub.id } };
}
