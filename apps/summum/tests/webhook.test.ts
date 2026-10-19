// apps/summum/tests/webhook.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, organization, payment, stripeAccount } from "@jotapuntoce/db/schema";
import { handleStripeEvent, verifyEvent } from "../server/stripe/webhook.ts";

const orgIds: string[] = [];
afterEach(async () => {
  if (orgIds.length) await db.delete(ledgerEntry).where(sql`${ledgerEntry.barcoOrgId} in (${sql.join(orgIds.map((i) => sql`${i}::uuid`), sql`, `)})`);
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

async function boatWithAccount(flags: Partial<{ chargesEnabled: boolean }> = {}) {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const [boat] = await db.insert(organization).values({ name: "b", slug: `b-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
  orgIds.push(dock!.id, boat!.id);
  const acct = `acct_${crypto.randomUUID()}`;
  const cus = `cus_${crypto.randomUUID()}`;
  await db.insert(stripeAccount).values({ orgId: boat!.id, stripeAccountId: acct, stripeCustomerId: cus, ...flags });
  return { dock: dock!, boat: boat!, acct, cus };
}

const ev = (type: string, object: object, account?: string) =>
  ({ id: `evt_${crypto.randomUUID()}`, type, account, data: { object } }) as unknown as Stripe.Event;

describe("verifyEvent", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", object: "event", type: "account.updated", data: { object: {} } });
  it("WHEN la firma es válida THE SYSTEM SHALL devolver el evento", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    expect(verifyEvent(body, header, secret)?.id).toBe("evt_1");
  });
  it("WHEN la firma no cuadra o falta THE SYSTEM SHALL devolver null", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_otro" });
    expect(verifyEvent(body, header, secret)).toBeNull();
    expect(verifyEvent(body, null, secret)).toBeNull();
  });
});

describe("account.updated", () => {
  it("WHEN Stripe habilita la cuenta THE SYSTEM SHALL copiar las tres banderas", async () => {
    const { boat, acct } = await boatWithAccount();
    await handleStripeEvent(ev("account.updated", { id: acct, charges_enabled: true, payouts_enabled: true, details_submitted: true }, acct));
    const [row] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, boat.id));
    expect([row?.chargesEnabled, row?.payoutsEnabled, row?.detailsSubmitted]).toEqual([true, true, true]);
  });
});

describe("payment_intent.succeeded", () => {
  const pi = (id: string, boatId: string, dockId: string) => ({
    id, amount_received: 10_000, application_fee_amount: 1000, currency: "mxn",
    metadata: { barco_org_id: boatId, muelle_org_id: dockId, charge_kind: "venta_propia", percent_bps: "1000", fixed_cents: "0" },
  });
  it("WHEN llega un cobro del barco THE SYSTEM SHALL escribir una fila con su comisión", async () => {
    const { dock, boat, acct } = await boatWithAccount();
    const id = `pi_${crypto.randomUUID()}`;
    expect(await handleStripeEvent(ev("payment_intent.succeeded", pi(id, boat.id, dock.id), acct))).toEqual({ wrote: true });
    const [row] = await db.select().from(ledgerEntry).where(eq(ledgerEntry.stripeObjectId, id));
    expect(row).toMatchObject({ barcoOrgId: boat.id, muelleOrgId: dock.id, grossCents: 10_000, summumFeeCents: 1000, appliedPercentBps: 1000 });
  });
  it("WHEN el mismo evento llega dos veces THE SYSTEM SHALL dejar una sola fila", async () => {
    const { dock, boat, acct } = await boatWithAccount();
    const id = `pi_${crypto.randomUUID()}`;
    await handleStripeEvent(ev("payment_intent.succeeded", pi(id, boat.id, dock.id), acct));
    expect(await handleStripeEvent(ev("payment_intent.succeeded", pi(id, boat.id, dock.id), acct))).toEqual({ wrote: false });
    expect(await db.select().from(ledgerEntry).where(eq(ledgerEntry.stripeObjectId, id))).toHaveLength(1);
  });
  it("WHEN la cuenta del evento no es la del barco de los metadatos THE SYSTEM SHALL no escribir nada", async () => {
    const { dock, boat } = await boatWithAccount();
    const id = `pi_${crypto.randomUUID()}`;
    expect(await handleStripeEvent(ev("payment_intent.succeeded", pi(id, boat.id, dock.id), "acct_desconocida"))).toEqual({ wrote: false });
    expect(await db.select().from(ledgerEntry).where(eq(ledgerEntry.stripeObjectId, id))).toHaveLength(0);
  });
});

describe("invoice.paid", () => {
  it("WHEN se paga la membresía THE SYSTEM SHALL escribir el libro y el pago, una sola vez", async () => {
    const { dock, cus } = await boatWithAccount();
    const id = `in_${crypto.randomUUID()}`;
    const invoice = { id, customer: cus, amount_paid: 50_000, currency: "mxn" };
    await handleStripeEvent(ev("invoice.paid", invoice));
    await handleStripeEvent(ev("invoice.paid", invoice));
    const rows = await db.select().from(ledgerEntry).where(eq(ledgerEntry.stripeObjectId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chargeKind: "membresia", grossCents: 50_000, summumFeeCents: 50_000, muelleOrgId: dock.id });
    const pays = await db.select().from(payment).where(eq(payment.externalRef, id));
    expect(pays).toHaveLength(1);
    expect(pays[0]?.paidAt).not.toBeNull();
    expect(pays[0]?.source).toBe("stripe");
    await db.delete(payment).where(eq(payment.externalRef, id));
  });
  it("WHEN el cliente no es de ningún barco THE SYSTEM SHALL no escribir nada", async () => {
    expect(await handleStripeEvent(ev("invoice.paid", { id: `in_${crypto.randomUUID()}`, customer: "cus_x", amount_paid: 1, currency: "mxn" }))).toEqual({ wrote: false });
  });
});
