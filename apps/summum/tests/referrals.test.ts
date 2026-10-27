// Referidos (server/referrals/referrals.ts) contra el Supabase de desarrollo, más su RLS con el patrón
// asUser() (rol authenticated): el referente ve sus comisiones y otro referente del muelle no.
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, ledgerEntry, membership, organization, profile, referralAttribution, referralCommission } from "@jotapuntoce/db/schema";
import { accrueCommissions, approveAttribution, ensureReferralLink, proposeAttribution, referralReport } from "../server/referrals/referrals.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  // El libro y las comisiones son `restrict`: se borran antes que los orgs.
  if (orgIds.length) {
    const attributions = await db.select({ id: referralAttribution.id }).from(referralAttribution).where(inArray(referralAttribution.muelleOrgId, orgIds));
    if (attributions.length) await db.delete(referralCommission).where(inArray(referralCommission.attributionId, attributions.map((a) => a.id)));
    await db.delete(ledgerEntry).where(inArray(ledgerEntry.barcoOrgId, orgIds));
  }
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function person() {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  return id;
}

async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

const STARTS = new Date("2026-01-01T00:00:00Z");
const NOW = new Date("2026-10-27T18:00:00Z");

/** Muelle con dos socios, dos afiliadas referentes (Ana y Beto) y un barco del muelle. */
async function red() {
  const [dock] = await db.insert(organization).values({ name: "t-ref", slug: `t-ref-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const muelle = dock!.id;
  orgIds.push(muelle);
  const [boat] = await db.insert(organization).values({ name: "Barco referido", slug: `t-ref-b-${crypto.randomUUID()}`, kind: "barco", parentOrgId: muelle }).returning();
  orgIds.push(boat!.id);
  const socio = async () => {
    const id = await person();
    await db.insert(membership).values({ userId: id, orgId: muelle, role: "owner", acceptedAt: new Date() });
    return id;
  };
  const afiliada = async () => {
    const id = await person();
    await db.insert(affiliate).values({ profileId: id, muelleOrgId: muelle, displayName: "A", publicSlug: `a-${id}` });
    return id;
  };
  return { muelle, barco: boat!.id, socio1: await socio(), socio2: await socio(), ana: await afiliada(), beto: await afiliada() };
}

async function atribucionAprobada(f: Awaited<ReturnType<typeof red>>) {
  const { code } = await ensureReferralLink(f.ana, f.muelle);
  const r = await proposeAttribution(f.socio1, f.muelle, { barcoOrgId: f.barco, code, shareBps: 2500, journeyMonths: 12, startsAt: STARTS.toISOString() });
  if (!r.ok) throw new Error(r.error);
  expect((await approveAttribution(f.socio2, r.data.id)).ok).toBe(true);
  return r.data.id;
}

function movimiento(f: Awaited<ReturnType<typeof red>>, createdAt: Date, summumFeeCents = 1000) {
  return { muelleOrgId: f.muelle, barcoOrgId: f.barco, chargeKind: "venta_propia" as const, grossCents: 10_000, summumFeeCents, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}`, createdAt };
}

describe("ensureReferralLink", () => {
  it("WHEN corre dos veces THE SYSTEM SHALL devolver el mismo code de 16 caracteres base64url", async () => {
    const f = await red();
    const a = await ensureReferralLink(f.ana, f.muelle);
    const b = await ensureReferralLink(f.ana, f.muelle);
    expect(a.code).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(b.code).toBe(a.code);
  });
});

describe("approveAttribution", () => {
  it("WHEN aprueba el mismo socio THE SYSTEM SHALL pedir la otra firma; el otro socio fija approved_by y approved_at", async () => {
    const f = await red();
    const { code } = await ensureReferralLink(f.ana, f.muelle);
    const r = await proposeAttribution(f.socio1, f.muelle, { barcoOrgId: f.barco, code, shareBps: 2500, journeyMonths: 12, startsAt: STARTS.toISOString() });
    if (!r.ok) throw new Error(r.error);
    expect(await approveAttribution(f.socio1, r.data.id)).toEqual({ ok: false, error: "Necesita la firma del otro dueño." });
    expect((await approveAttribution(f.socio2, r.data.id)).ok).toBe(true);
    const [row] = await db.select().from(referralAttribution).where(eq(referralAttribution.id, r.data.id));
    expect(row!.approvedBy).toBe(f.socio2);
    expect(row!.approvedAt).not.toBeNull();
    expect(await approveAttribution(f.socio2, r.data.id)).toEqual({ ok: false, error: "Este cambio ya se decidió." });
  });
});

describe("accrueCommissions", () => {
  it("WHEN hay un movimiento de 1000 de comisión dentro del recorrido a 2500 pb THE SYSTEM SHALL devengar 250 una sola vez; fuera del recorrido nada", async () => {
    const f = await red();
    const attributionId = await atribucionAprobada(f);
    await db.insert(ledgerEntry).values([
      movimiento(f, new Date("2026-03-01T12:00:00Z")),
      movimiento(f, new Date("2025-12-31T12:00:00Z")), // antes de starts_at
      movimiento(f, new Date("2027-01-02T12:00:00Z")), // después del fin del recorrido
    ]);
    expect(await accrueCommissions(f.muelle, new Date("2027-06-01T00:00:00Z"))).toBe(1);
    expect(await accrueCommissions(f.muelle, new Date("2027-06-01T00:00:00Z"))).toBe(0);
    const commissions = await db.select().from(referralCommission).where(eq(referralCommission.attributionId, attributionId));
    expect(commissions.map((c) => c.amountCents)).toEqual([250]);
    expect((await referralReport(f.ana, f.muelle)).totalCents).toBe(250);
  });
});

describe("RLS de referidos", () => {
  it("WHEN el referente consulta referral_commission THE SYSTEM SHALL ver la suya; otro referente del muelle ve 0", async () => {
    const f = await red();
    const attributionId = await atribucionAprobada(f);
    await db.insert(ledgerEntry).values(movimiento(f, new Date("2026-03-01T12:00:00Z")));
    await accrueCommissions(f.muelle, NOW);
    await ensureReferralLink(f.beto, f.muelle);
    const q = `select id from referral_commission where attribution_id = '${attributionId}'`;
    expect(await asUser(f.ana, q)).toHaveLength(1);
    expect(await asUser(f.beto, q)).toEqual([]);
    expect(await asUser(f.socio1, q)).toHaveLength(1);
  });
});
