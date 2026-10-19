import { afterEach, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, membership, membershipPlan, organization, profile } from "@jotapuntoce/db/schema";
import { listBarcoLedgerForOwner, listDockLedger, summarize } from "../server/money/ledger.ts";
import { alCorriente, listDockBarcos } from "../server/barcos/list.ts";

describe("summarize", () => {
  it("WHEN no hay movimientos THE SYSTEM SHALL dar margen 0, no NaN", () => {
    expect(summarize([])).toEqual({ grossCents: 0, feeCents: 0, marginBps: 0 });
  });
  it("WHEN hay movimientos THE SYSTEM SHALL dar comisión ÷ bruto en puntos base", () => {
    expect(summarize([{ grossCents: 10_000, summumFeeCents: 1000 }, { grossCents: 30_000, summumFeeCents: 2000 }]))
      .toEqual({ grossCents: 40_000, feeCents: 3000, marginBps: 750 });
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  if (orgIds.length) await db.delete(ledgerEntry).where(inArray(ledgerEntry.barcoOrgId, orgIds));
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

describe("listDockLedger / listDockBarcos", () => {
  it("WHEN el dueño del muelle filtra por barco THE SYSTEM SHALL devolver solo ese barco, sin barcos de otro muelle", async () => {
    const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    const [other] = await db.insert(organization).values({ name: "m2", slug: `m2-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    const [b1] = await db.insert(organization).values({ name: "b1", slug: `b1-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
    const [b2] = await db.insert(organization).values({ name: "b2", slug: `b2-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
    const [b3] = await db.insert(organization).values({ name: "b3", slug: `b3-${crypto.randomUUID()}`, parentOrgId: other!.id }).returning();
    orgIds.push(dock!.id, other!.id, b1!.id, b2!.id, b3!.id);
    const u = crypto.randomUUID();
    await db.insert(profile).values({ id: u, email: `${u}@example.com` });
    profileIds.push(u);
    await db.insert(membership).values({ userId: u, orgId: dock!.id, role: "owner", acceptedAt: new Date() });
    const row = (barco: string, muelle: string) => ({ muelleOrgId: muelle, barcoOrgId: barco, chargeKind: "venta_propia" as const, grossCents: 100, summumFeeCents: 10, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` });
    await db.insert(ledgerEntry).values([row(b1!.id, dock!.id), row(b2!.id, dock!.id), row(b3!.id, other!.id)]);

    expect((await listDockLedger(u, dock!.id)).map((r) => r.barcoOrgId).sort()).toEqual([b1!.id, b2!.id].sort());
    expect((await listDockLedger(u, dock!.id, { barcoOrgId: b1!.id })).map((r) => r.barcoOrgId)).toEqual([b1!.id]);
    expect((await listDockBarcos(u, dock!.id)).map((b) => b.name).sort()).toEqual(["b1", "b2"]);
  });
});

describe("listBarcoLedgerForOwner", () => {
  it("WHEN el dueño del barco lee THE SYSTEM SHALL ver solo su barco; el dueño del muelle recibe 404", async () => {
    const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    const [b1] = await db.insert(organization).values({ name: "b1", slug: `b1-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
    const [b2] = await db.insert(organization).values({ name: "b2", slug: `b2-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
    orgIds.push(dock!.id, b1!.id, b2!.id);
    const owner = crypto.randomUUID();
    const dockOwner = crypto.randomUUID();
    for (const id of [owner, dockOwner]) await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(owner, dockOwner);
    await db.insert(membership).values([
      { userId: owner, orgId: b1!.id, role: "owner", acceptedAt: new Date() },
      { userId: dockOwner, orgId: dock!.id, role: "owner", acceptedAt: new Date() },
    ]);
    const row = (barco: string) => ({ muelleOrgId: dock!.id, barcoOrgId: barco, chargeKind: "venta_propia" as const, grossCents: 100, summumFeeCents: 10, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` });
    await db.insert(ledgerEntry).values([row(b1!.id), row(b2!.id)]);

    expect((await listBarcoLedgerForOwner(owner, b1!.id)).map((r) => r.barcoOrgId)).toEqual([b1!.id]);
    await expect(listBarcoLedgerForOwner(dockOwner, b1!.id)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});

describe("alCorriente", () => {
  const paid = new Date("2026-09-10T12:00:00Z");
  it("WHEN no hay pago de membresía THE SYSTEM SHALL marcarlo pendiente", () => {
    expect(alCorriente(null, paid)).toBe(false);
  });
  it("WHEN el último pago cubre el mes más los días de gracia THE SYSTEM SHALL darlo al corriente", () => {
    expect(alCorriente(paid, new Date("2026-10-17T12:00:00Z"))).toBe(true);
  });
  it("WHEN ya pasó el mes más la gracia sin pago nuevo THE SYSTEM SHALL marcarlo pendiente", () => {
    expect(alCorriente(paid, new Date("2026-10-17T12:00:01Z"))).toBe(false);
  });
});

describe("listDockBarcos · al corriente", () => {
  it("WHEN el barco con nivel pagó su membresía este periodo THE SYSTEM SHALL darlo al corriente; sin pago o sin nivel, no", async () => {
    const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    orgIds.push(dock!.id);
    const [plan] = await db.insert(membershipPlan).values({ muelleOrgId: dock!.id, name: "Base", monthlyAmountCents: 50_000, stripePriceId: "price_test" }).returning();
    const boat = async (name: string, membershipPlanId: string | null) => {
      const [b] = await db.insert(organization).values({ name, slug: `${name}-${crypto.randomUUID()}`, parentOrgId: dock!.id, membershipPlanId }).returning();
      orgIds.push(b!.id);
      return b!.id;
    };
    const pagado = await boat("pagado", plan!.id);
    const vencido = await boat("vencido", plan!.id);
    await boat("nuevo", plan!.id);
    await boat("sin-nivel", null);
    const u = crypto.randomUUID();
    await db.insert(profile).values({ id: u, email: `${u}@example.com` });
    profileIds.push(u);
    await db.insert(membership).values({ userId: u, orgId: dock!.id, role: "owner", acceptedAt: new Date() });
    const fee = (barco: string, createdAt: Date) => ({ muelleOrgId: dock!.id, barcoOrgId: barco, chargeKind: "membresia" as const, grossCents: 50_000, summumFeeCents: 50_000, currency: "mxn", stripeObjectId: `in_${crypto.randomUUID()}`, createdAt });
    const old = new Date(Date.now() - 90 * 86_400_000);
    await db.insert(ledgerEntry).values([fee(pagado, old), fee(pagado, new Date()), fee(vencido, old)]);

    const status = Object.fromEntries((await listDockBarcos(u, dock!.id)).map((b) => [b.name, b.alCorriente]));
    expect(status).toEqual({ pagado: true, vencido: false, nuevo: false, "sin-nivel": false });
  });
});
