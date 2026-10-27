// Esquema del Sello Cénit y de la sinapsis contra el Supabase de desarrollo: defaults, checks, uniques
// parciales y RLS (asUser simula el rol authenticated, como en tests/afiliadas-schema.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  barcoListing,
  membership,
  muelleSettings,
  orgNeed,
  organization,
  profile,
  sealEvaluation,
  sealRequirement,
  sealRequirementResult,
  specialistProposal,
} from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org(kind: "muelle" | "barco", parentOrgId?: string) {
  const [row] = await db
    .insert(organization)
    .values({ name: `t-${kind}`, slug: `t-sello-${crypto.randomUUID()}`, kind, parentOrgId })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId?: string, role: "owner" | "employee" = "owner") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  if (orgId) await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
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

/** Un muelle con dos socios, un barco con su dueño y un empleado, otro barco y una afiliada. */
async function network() {
  const muelle = await org("muelle");
  const [p1, p2] = [await person(muelle), await person(muelle)];
  const barco = await org("barco", muelle);
  const otroBarco = await org("barco", muelle);
  const barcoOwner = await person(barco);
  const employee = await person(barco, "employee");
  const afiliadaProfile = await person();
  const [a] = await db
    .insert(affiliate)
    .values({ profileId: afiliadaProfile, muelleOrgId: muelle, displayName: "Ana", publicSlug: `ana-${crypto.randomUUID()}` })
    .returning();
  return { muelle, p1: p1!, p2: p2!, barco, otroBarco, barcoOwner, employee, afiliadaProfile, affiliateId: a!.id };
}

const evalBarco = (muelle: string, barco: string) => ({ muelleOrgId: muelle, subjectKind: "barco" as const, barcoOrgId: barco, score: 70 });

describe("esquema del Sello", () => {
  it("WHEN se insertan las seis tablas THE SYSTEM SHALL leerlas de vuelta con los defaults de muelle_settings", async () => {
    const n = await network();
    const [settings] = await db.insert(muelleSettings).values({ muelleOrgId: n.muelle }).returning();
    expect(settings).toMatchObject({ minSealScore: null, graceDays: 30, proposalMinSeverity: 3 });

    const reqs = await db
      .insert(sealRequirement)
      .values([
        { muelleOrgId: n.muelle, code: "contrato", title: "Contrato firmado", points: 20, source: "manual" },
        { muelleOrgId: n.muelle, code: "clientes", title: "Clientes", points: 30, source: "kpi", config: { source: "clientes", config: {}, op: "gte", threshold: 5 } },
      ])
      .returning();
    expect(reqs.map((r) => r.source)).toEqual(["manual", "kpi"]);
    const [result] = await db
      .insert(sealRequirementResult)
      .values({ muelleOrgId: n.muelle, requirementId: reqs[0]!.id, subjectKind: "barco", barcoOrgId: n.barco, met: true, decidedBy: n.p1 })
      .returning();
    expect(result?.met).toBe(true);
    const [ev] = await db.insert(sealEvaluation).values(evalBarco(n.muelle, n.barco)).returning();
    expect(ev?.approvalStatus).toBe("pendiente");
    const [listing] = await db.insert(barcoListing).values({ barcoOrgId: n.barco, publicSlug: `b-${crypto.randomUUID()}` }).returning();
    expect(listing?.optIn).toBe(false);
    const [need] = await db.insert(orgNeed).values({ orgId: n.barco, title: "Contabilidad" }).returning();
    const [prop] = await db
      .insert(specialistProposal)
      .values({ muelleOrgId: n.muelle, orgId: n.barco, orgNeedId: need!.id, affiliateId: n.affiliateId, matchScore: 67 })
      .returning();
    expect(prop?.status).toBe("propuesta");
  });

  it("WHEN una evaluación repite firma, le falta el barco o ya hay una pendiente THE SYSTEM SHALL rechazarla", async () => {
    const n = await network();
    await expect(
      db.insert(sealEvaluation).values({ ...evalBarco(n.muelle, n.barco), firstApproverId: n.p1, secondApproverId: n.p1 }),
    ).rejects.toThrow();
    await expect(db.insert(sealEvaluation).values({ muelleOrgId: n.muelle, subjectKind: "barco", score: 1 })).rejects.toThrow();
    await db.insert(sealEvaluation).values(evalBarco(n.muelle, n.barco));
    await expect(db.insert(sealEvaluation).values(evalBarco(n.muelle, n.barco))).rejects.toThrow();
  });

  it("WHEN una propuesta repite socio o ya hay una abierta para la necesidad THE SYSTEM SHALL rechazarla", async () => {
    const n = await network();
    const [need] = await db.insert(orgNeed).values({ orgId: n.barco, title: "Legal" }).returning();
    const base = { muelleOrgId: n.muelle, orgId: n.barco, orgNeedId: need!.id, matchScore: 50 };
    await expect(
      db.insert(specialistProposal).values({ ...base, affiliateId: n.affiliateId, firstPartnerId: n.p1, secondPartnerId: n.p1 }),
    ).rejects.toThrow();
    await db.insert(specialistProposal).values({ ...base, affiliateId: n.affiliateId });
    const otra = await person();
    const [a2] = await db
      .insert(affiliate)
      .values({ profileId: otra, muelleOrgId: n.muelle, displayName: "Beto", publicSlug: `beto-${crypto.randomUUID()}` })
      .returning();
    await expect(db.insert(specialistProposal).values({ ...base, affiliateId: a2!.id })).rejects.toThrow();
  });
});

describe("RLS — Sello y sinapsis", () => {
  it("WHEN consultan el dueño del barco y su empleado THE SYSTEM SHALL dar al dueño solo lo de su barco y al empleado nada", async () => {
    const n = await network();
    await db.insert(sealEvaluation).values([evalBarco(n.muelle, n.barco), evalBarco(n.muelle, n.otroBarco)]);
    expect(await asUser(n.barcoOwner, "select barco_org_id from seal_evaluation")).toEqual([{ barco_org_id: n.barco }]);
    expect(await asUser(n.employee, "select id from seal_evaluation")).toEqual([]);
  });

  it("WHEN consultan un socio del muelle y una afiliada THE SYSTEM SHALL dar al socio su muelle y a la afiliada solo lo suyo", async () => {
    const n = await network();
    await db.insert(sealRequirement).values({ muelleOrgId: n.muelle, code: "c", title: "C", points: 10, source: "manual" });
    await db.insert(sealEvaluation).values([
      evalBarco(n.muelle, n.barco),
      { muelleOrgId: n.muelle, subjectKind: "afiliada", affiliateId: n.affiliateId, score: 50 },
    ]);
    const [need] = await db.insert(orgNeed).values({ orgId: n.barco, title: "Legal" }).returning();
    await db
      .insert(specialistProposal)
      .values({ muelleOrgId: n.muelle, orgId: n.barco, orgNeedId: need!.id, affiliateId: n.affiliateId, matchScore: 50 });

    const where = `where muelle_org_id = '${n.muelle}'`;
    expect(await asUser(n.p1, `select id from seal_evaluation ${where}`)).toHaveLength(2);
    expect(await asUser(n.p1, `select id from seal_requirement ${where}`)).toHaveLength(1);
    expect(await asUser(n.p1, `select id from specialist_proposal ${where}`)).toHaveLength(1);
    expect(await asUser(n.afiliadaProfile, "select affiliate_id from seal_evaluation")).toEqual([{ affiliate_id: n.affiliateId }]);
  });
});
