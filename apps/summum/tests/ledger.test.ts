import { afterEach, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, membership, organization, profile } from "@jotapuntoce/db/schema";
import { listDockLedger, summarize } from "../server/money/ledger.ts";
import { listDockBarcos } from "../server/barcos/list.ts";

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
