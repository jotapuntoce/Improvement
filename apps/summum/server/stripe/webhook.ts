// El ÚNICO lugar que escribe ledger_entry (spec §3). Idempotente por stripe_object_id único: Stripe
// reintenta, y un segundo aviso del mismo cobro no duplica dinero. Lo desconocido se registra y no
// escribe nada — nunca se inventa un barco.
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, organization, payment, stripeAccount } from "@jotapuntoce/db/schema";
import { SALE_METADATA } from "./connect.ts";

export function verifyEvent(rawBody: string, signature: string | null, secret: string): Stripe.Event | null {
  if (!signature) return null;
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return null;
  }
}

const accountSchema = z.object({ id: z.string(), charges_enabled: z.boolean(), payouts_enabled: z.boolean(), details_submitted: z.boolean() });
const intentSchema = z.object({
  id: z.string(),
  amount_received: z.number().int().positive(),
  application_fee_amount: z.number().int().nonnegative().nullable(),
  currency: z.string(),
  metadata: SALE_METADATA,
});
const invoiceSchema = z.object({ id: z.string(), customer: z.string(), amount_paid: z.number().int().positive(), currency: z.string() });

function skip(reason: string, event: Stripe.Event) {
  console.warn(`[stripe] ${event.type} ${event.id} ignorado: ${reason}`);
  return { wrote: false };
}

export async function handleStripeEvent(event: Stripe.Event): Promise<{ wrote: boolean }> {
  const object = (event.data as { object: unknown }).object;

  if (event.type === "account.updated") {
    const a = accountSchema.safeParse(object);
    if (!a.success) return skip("forma inesperada", event);
    const rows = await db
      .update(stripeAccount)
      .set({ chargesEnabled: a.data.charges_enabled, payoutsEnabled: a.data.payouts_enabled, detailsSubmitted: a.data.details_submitted, updatedAt: new Date() })
      .where(eq(stripeAccount.stripeAccountId, a.data.id))
      .returning({ id: stripeAccount.id });
    return rows.length ? { wrote: true } : skip("cuenta desconocida", event);
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = intentSchema.safeParse(object);
    if (!pi.success) return skip("sin metadatos de Summum", event);
    if (pi.data.application_fee_amount === null) return skip("sin application_fee_amount", event);
    const m = pi.data.metadata;
    // El aviso llega por Connect con event.account = la cuenta donde se cobró: tiene que ser la del
    // barco que dicen los metadatos y ese barco tiene que colgar de ese muelle.
    const [owner] = await db
      .select({ id: organization.id })
      .from(stripeAccount)
      .innerJoin(organization, eq(organization.id, stripeAccount.orgId))
      .where(and(eq(stripeAccount.orgId, m.barco_org_id), eq(stripeAccount.stripeAccountId, event.account ?? ""), eq(organization.parentOrgId, m.muelle_org_id)))
      .limit(1);
    if (!owner) return skip("la cuenta no corresponde al barco", event);
    const inserted = await db
      .insert(ledgerEntry)
      .values({
        muelleOrgId: m.muelle_org_id,
        barcoOrgId: m.barco_org_id,
        chargeKind: m.charge_kind,
        grossCents: pi.data.amount_received,
        summumFeeCents: pi.data.application_fee_amount,
        appliedPercentBps: m.percent_bps,
        appliedFixedCents: m.fixed_cents,
        currency: pi.data.currency,
        stripeObjectId: pi.data.id,
      })
      .onConflictDoNothing({ target: ledgerEntry.stripeObjectId })
      .returning({ id: ledgerEntry.id });
    return { wrote: inserted.length > 0 };
  }

  if (event.type === "invoice.paid") {
    // Las facturas de membresía son de la plataforma: una con event.account viene de una cuenta conectada.
    if (event.account) return skip("factura de cuenta conectada", event);
    const inv = invoiceSchema.safeParse(object);
    if (!inv.success) return skip("forma inesperada", event);
    const [boat] = await db
      .select({ id: organization.id, muelleId: organization.parentOrgId })
      .from(stripeAccount)
      .innerJoin(organization, eq(organization.id, stripeAccount.orgId))
      .where(eq(stripeAccount.stripeCustomerId, inv.data.customer))
      .limit(1);
    if (!boat?.muelleId) return skip("cliente desconocido", event);
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(ledgerEntry)
        .values({
          muelleOrgId: boat.muelleId!,
          barcoOrgId: boat.id,
          chargeKind: "membresia",
          grossCents: inv.data.amount_paid,
          summumFeeCents: inv.data.amount_paid,
          currency: inv.data.currency,
          stripeObjectId: inv.data.id,
        })
        .onConflictDoNothing({ target: ledgerEntry.stripeObjectId })
        .returning({ id: ledgerEntry.id });
      if (!inserted.length) return { wrote: false };
      await tx.insert(payment).values({
        orgId: boat.id,
        concept: "Membresía Summum",
        amount: (inv.data.amount_paid / 100).toFixed(2),
        currency: inv.data.currency.toUpperCase(),
        dueDate: new Date(),
        paidAt: new Date(),
        source: "stripe",
        externalRef: inv.data.id,
      });
      return { wrote: true };
    });
  }

  return skip("tipo no manejado", event);
}
