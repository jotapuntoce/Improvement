// apps/summum/tests/connect.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { feeRate, membership, membershipPlan, organization, profile, stripeAccount } from "@jotapuntoce/db/schema";
import { activateMembership, createSaleLink, startOnboarding, type StripeDeps } from "../server/stripe/connect.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

function fakeStripe() {
  return {
    accounts: { create: vi.fn(async () => ({ id: `acct_${crypto.randomUUID()}` })) },
    accountLinks: { create: vi.fn(async () => ({ url: "https://connect.stripe.test/onboard" })) },
    checkout: { sessions: { create: vi.fn(async () => ({ url: "https://checkout.stripe.test/s" })) } },
    customers: { create: vi.fn(async () => ({ id: `cus_${crypto.randomUUID()}` })) },
    subscriptions: { create: vi.fn(async () => ({ id: `sub_${crypto.randomUUID()}` })) },
  };
}
const deps = (s: ReturnType<typeof fakeStripe>): StripeDeps => ({ stripe: s as unknown as StripeDeps["stripe"], baseUrl: "http://localhost:3300" });

async function setup() {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const [boat] = await db.insert(organization).values({ name: "b", slug: `b-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
  orgIds.push(dock!.id, boat!.id);
  const mk = async (orgId: string) => {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId, role: "owner", acceptedAt: new Date() });
    return id;
  };
  return { dock: dock!, boat: boat!, dockOwner: await mk(dock!.id), boatOwner: await mk(boat!.id) };
}

describe("startOnboarding", () => {
  it("WHEN el barco no tiene cuenta THE SYSTEM SHALL crearla con controller y devolver el enlace", async () => {
    const { boat, boatOwner } = await setup();
    const s = fakeStripe();
    const r = await startOnboarding(boatOwner, boat.id, deps(s));
    expect(r).toEqual({ ok: true, data: { url: "https://connect.stripe.test/onboard" } });
    expect(s.accounts.create).toHaveBeenCalledWith(expect.objectContaining({
      country: "MX",
      controller: { stripe_dashboard: { type: "express" }, fees: { payer: "application" }, losses: { payments: "application" } },
    }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
    const [row] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, boat.id));
    expect(row?.stripeAccountId).toMatch(/^acct_/);
  });
  it("WHEN ya tiene cuenta THE SYSTEM SHALL reusarla", async () => {
    const { boat, boatOwner } = await setup();
    const s = fakeStripe();
    await startOnboarding(boatOwner, boat.id, deps(s));
    await startOnboarding(boatOwner, boat.id, deps(s));
    expect(s.accounts.create).toHaveBeenCalledTimes(1);
  });
});

describe("createSaleLink", () => {
  it("WHEN la cuenta aún no puede cobrar THE SYSTEM SHALL rechazarlo", async () => {
    const { boat, boatOwner } = await setup();
    await db.insert(stripeAccount).values({ orgId: boat.id, stripeAccountId: `acct_${crypto.randomUUID()}` });
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: 10_000, description: "Servicio" }, deps(fakeStripe()));
    expect(r.ok).toBe(false);
  });
  it("WHEN no hay tasa para venta_propia THE SYSTEM SHALL rechazarlo, nunca cobrar con 0 %", async () => {
    const { boat, boatOwner } = await setup();
    await db.insert(stripeAccount).values({ orgId: boat.id, stripeAccountId: `acct_${crypto.randomUUID()}`, chargesEnabled: true });
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: 10_000, description: "Servicio" }, deps(fakeStripe()));
    expect(r).toEqual({ ok: false, error: "Summum aún no tiene comisión para este tipo de cobro." });
  });
  it("WHEN todo está listo THE SYSTEM SHALL cobrar en la cuenta del barco con application_fee y metadatos", async () => {
    const { dock, boat, boatOwner } = await setup();
    const acct = `acct_${crypto.randomUUID()}`;
    await db.insert(stripeAccount).values({ orgId: boat.id, stripeAccountId: acct, chargesEnabled: true });
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 1000, fixedCents: 0 });
    const s = fakeStripe();
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: 10_000, description: "Servicio" }, deps(s));
    expect(r).toEqual({ ok: true, data: { url: "https://checkout.stripe.test/s" } });
    const [params, opts] = s.checkout.sessions.create.mock.calls[0] as unknown as [Record<string, any>, Record<string, any>];
    expect(opts).toEqual({ stripeAccount: acct });
    expect(params.payment_intent_data.application_fee_amount).toBe(1000);
    expect(params.payment_intent_data.metadata).toEqual({
      barco_org_id: boat.id, muelle_org_id: dock.id, charge_kind: "venta_propia", percent_bps: "1000", fixed_cents: "0",
    });
  });
  it("WHEN el monto no es entero positivo THE SYSTEM SHALL rechazarlo", async () => {
    const { boat, boatOwner } = await setup();
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: -5, description: "x" }, deps(fakeStripe()));
    expect(r.ok).toBe(false);
  });
});

describe("activateMembership", () => {
  it("WHEN el dueño del muelle activa un nivel THE SYSTEM SHALL suscribir al barco y guardar su nivel", async () => {
    const { dock, boat, dockOwner } = await setup();
    const [plan] = await db.insert(membershipPlan).values({ muelleOrgId: dock.id, name: "Base", monthlyAmountCents: 50_000, stripePriceId: "price_test" }).returning();
    const s = fakeStripe();
    const r = await activateMembership(dockOwner, dock.id, boat.id, plan!.id, deps(s));
    expect(r.ok).toBe(true);
    expect(s.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ price: "price_test" }], collection_method: "send_invoice", days_until_due: 7,
    }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
    const [org] = await db.select().from(organization).where(eq(organization.id, boat.id));
    expect(org?.membershipPlanId).toBe(plan!.id);
  });
  it("WHEN el barco es de otro muelle THE SYSTEM SHALL rechazarlo", async () => {
    const a = await setup();
    const b = await setup();
    const [plan] = await db.insert(membershipPlan).values({ muelleOrgId: a.dock.id, name: "Base", monthlyAmountCents: 50_000, stripePriceId: "price_test" }).returning();
    const r = await activateMembership(a.dockOwner, a.dock.id, b.boat.id, plan!.id, deps(fakeStripe()));
    expect(r.ok).toBe(false);
  });
});

describe("fix round 1", () => {
  it("startOnboarding manda idempotencyKey y un segundo intento conserva el id original", async () => {
    const { boat, boatOwner } = await setup();
    const s = fakeStripe();
    await startOnboarding(boatOwner, boat.id, deps(s));
    const [, opts] = s.accounts.create.mock.calls[0] as unknown as [unknown, unknown];
    expect(opts).toEqual({ idempotencyKey: `acct-${boat.id}` });
    const [first] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, boat.id));
    await startOnboarding(boatOwner, boat.id, deps(s));
    expect(s.accounts.create).toHaveBeenCalledTimes(1);
    const [second] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, boat.id));
    expect(second?.stripeAccountId).toBe(first?.stripeAccountId);
  });
  it("startOnboarding no sobrescribe un id ya guardado por otra carrera", async () => {
    const { boat, boatOwner } = await setup();
    const s = fakeStripe();
    s.accounts.create.mockImplementationOnce(async () => {
      await db.insert(stripeAccount).values({ orgId: boat.id, stripeAccountId: "acct_original" });
      return { id: "acct_nuevo" };
    });
    await startOnboarding(boatOwner, boat.id, deps(s));
    const [row] = await db.select().from(stripeAccount).where(eq(stripeAccount.orgId, boat.id));
    expect(row?.stripeAccountId).toBe("acct_original");
    expect(s.accountLinks.create).toHaveBeenCalledWith(expect.objectContaining({ account: "acct_original" }));
  });
  it("startOnboarding rechaza a quien no es dueño del barco", async () => {
    const a = await setup();
    const b = await setup();
    await expect(startOnboarding(b.boatOwner, a.boat.id, deps(fakeStripe()))).rejects.toThrow();
  });
  it("activateMembership manda idempotencyKey y rechaza un barco que ya tiene membresía sin llamar a Stripe", async () => {
    const { dock, boat, dockOwner } = await setup();
    const [plan] = await db.insert(membershipPlan).values({ muelleOrgId: dock.id, name: "Base", monthlyAmountCents: 50_000, stripePriceId: "price_test" }).returning();
    const s = fakeStripe();
    await activateMembership(dockOwner, dock.id, boat.id, plan!.id, deps(s));
    expect((s.customers.create.mock.calls[0] as unknown as unknown[])[1]).toEqual({ idempotencyKey: `cus-${boat.id}` });
    expect((s.subscriptions.create.mock.calls[0] as unknown as unknown[])[1]).toEqual({ idempotencyKey: `sub-${boat.id}-${plan!.id}` });
    const s2 = fakeStripe();
    const r = await activateMembership(dockOwner, dock.id, boat.id, plan!.id, deps(s2));
    expect(r).toEqual({ ok: false, error: "Este barco ya tiene membresía." });
    expect(s2.customers.create).not.toHaveBeenCalled();
    expect(s2.subscriptions.create).not.toHaveBeenCalled();
  });
  it("createSaleLink rechaza si la comisión iguala o supera la venta", async () => {
    const { dock, boat, boatOwner } = await setup();
    await db.insert(stripeAccount).values({ orgId: boat.id, stripeAccountId: `acct_${crypto.randomUUID()}`, chargesEnabled: true });
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 10_000, fixedCents: 0 });
    const s = fakeStripe();
    const r = await createSaleLink(boatOwner, boat.id, { amountCents: 10_000, description: "x" }, deps(s));
    expect(r).toEqual({ ok: false, error: "La comisión no puede ser igual o mayor que la venta." });
    expect(s.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
