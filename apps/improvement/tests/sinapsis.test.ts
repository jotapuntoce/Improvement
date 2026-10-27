// La sinapsis (server/sinapsis/proposals.ts) y el cuestionario del dueño (server/owner/personality.ts) contra
// el Supabase de desarrollo. Cada generateProposals pasa el muelle de su fixture: el Supabase es compartido.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  area,
  membership,
  muelleSettings,
  organization,
  orgNeed,
  PERSONALITY_QUESTIONS,
  personalityProfile,
  profile,
  sealEvaluation,
  specialistProposal,
  specialty,
} from "@jotapuntoce/db/schema";
import { saveOwnerPersonality } from "../server/owner/personality.ts";
import { decideProposalAsOwner, generateProposals, setAreaSpecialty } from "../server/sinapsis/proposals.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function newProfile() {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  return id;
}

async function org(kind: "muelle" | "barco", parentOrgId?: string) {
  const [row] = await db
    .insert(organization)
    .values({ name: `t-${kind}`, slug: `t-sin-${crypto.randomUUID()}`, kind, parentOrgId })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

/** Todas con la primera opción; `iguales` < 9 cambia las demás a la segunda. */
const answers = (iguales = 9) =>
  Object.fromEntries(PERSONALITY_QUESTIONS.map((q, i) => [q.key, q.options[i < iguales ? 0 : 1]!.value]));

/** Muelle con la especialidad `comercial`, un barco con dueño y empleado, y su área `comercial`. */
async function network({ severity = 3, specialtyKey = "comercial" as string | null } = {}) {
  const muelle = await org("muelle");
  const barco = await org("barco", muelle);
  await db.insert(muelleSettings).values({ muelleOrgId: muelle, minSealScore: 10, proposalMinSeverity: 3 });
  await db.insert(specialty).values({ muelleOrgId: muelle, key: "comercial", label: "Comercial" });
  const owner = await newProfile();
  const employee = await newProfile();
  await db.insert(membership).values([
    { userId: owner, orgId: barco, role: "owner", acceptedAt: new Date() },
    { userId: employee, orgId: barco, role: "employee", acceptedAt: new Date() },
  ]);
  const [a] = await db.insert(area).values({ orgId: barco, name: "Ventas", color: "#7c5cff", specialtyKey }).returning();
  const [need] = await db.insert(orgNeed).values({ orgId: barco, areaId: a!.id, title: "Sin cierres", severity }).returning();
  return { muelle, barco, owner, employee, areaId: a!.id, needId: need!.id };
}

async function addAffiliate(muelle: string, name: string, seal: number | null, personality?: Record<string, string>) {
  const profileId = await newProfile();
  const [row] = await db
    .insert(affiliate)
    .values({ profileId, muelleOrgId: muelle, displayName: name, specialtyKeys: ["comercial"], publicSlug: `${name}-${profileId}` })
    .returning();
  if (seal !== null) {
    await db.insert(sealEvaluation).values({
      muelleOrgId: muelle,
      subjectKind: "afiliada",
      affiliateId: row!.id,
      score: seal,
      approvalStatus: "aprobada",
      approvedAt: new Date(),
      vigencia: "vigente",
    });
  }
  if (personality) {
    await db.insert(personalityProfile).values({ profileId, subjectKind: "afiliada", answers: personality, questionnaireVersion: 1 });
  }
  return row!.id;
}

const proposalsOf = (needId: string) => db.select().from(specialistProposal).where(eq(specialistProposal.orgNeedId, needId));

describe("generateProposals", () => {
  it("WHEN dos afiliadas comercial tienen Sello de 50 y 80 THE SYSTEM SHALL proponer solo a la de 80, una vez", async () => {
    const n = await network();
    await addAffiliate(n.muelle, "cincuenta", 50);
    const ochenta = await addAffiliate(n.muelle, "ochenta", 80);
    expect(await generateProposals({ muelleId: n.muelle })).toBe(1);
    expect(await generateProposals({ muelleId: n.muelle })).toBe(0);
    const rows = await proposalsOf(n.needId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ affiliateId: ochenta, sealScore: 80, status: "propuesta" });
  });

  it("WHEN empatan en Sello THE SYSTEM SHALL proponer a la que coincide 9 de 9 con el dueño, match 100", async () => {
    const n = await network();
    await db.insert(personalityProfile).values({ profileId: n.owner, subjectKind: "dueno", orgId: n.barco, answers: answers(), questionnaireVersion: 1 });
    await addAffiliate(n.muelle, "tres", 60, answers(3));
    const nueve = await addAffiliate(n.muelle, "nueve", 60, answers(9));
    await generateProposals({ muelleId: n.muelle });
    expect((await proposalsOf(n.needId))[0]).toMatchObject({ affiliateId: nueve, matchScore: 100 });
  });

  it("WHEN la severidad es 2 o el área no tiene especialidad THE SYSTEM SHALL no proponer", async () => {
    const leve = await network({ severity: 2 });
    await addAffiliate(leve.muelle, "a", 80);
    const sinLlave = await network({ specialtyKey: null });
    await addAffiliate(sinLlave.muelle, "b", 80);
    expect(await generateProposals({ muelleId: leve.muelle })).toBe(0);
    expect(await generateProposals({ muelleId: sinLlave.muelle })).toBe(0);
  });
});

describe("decisión del dueño y cuestionario", () => {
  async function proposal(status: "propuesta" | "aprobada_socios") {
    const n = await network();
    const affiliateId = await addAffiliate(n.muelle, "ana", 80);
    const [row] = await db
      .insert(specialistProposal)
      .values({ muelleOrgId: n.muelle, orgId: n.barco, orgNeedId: n.needId, affiliateId, matchScore: 0, status })
      .returning();
    return { ...n, proposalId: row!.id };
  }

  it("WHEN el dueño aprueba una aprobada_socios THE SYSTEM SHALL activarla y derivar la necesidad; en propuesta, transición inválida", async () => {
    const p = await proposal("aprobada_socios");
    expect(await decideProposalAsOwner(p.owner, p.barco, p.proposalId, "aprobada")).toEqual({ ok: true, data: true });
    expect((await proposalsOf(p.needId))[0]?.status).toBe("activa");
    const [need] = await db.select().from(orgNeed).where(eq(orgNeed.id, p.needId));
    expect(need?.status).toBe("derivada");
    expect(need?.referredAt).not.toBeNull();

    const q = await proposal("propuesta");
    const r = await decideProposalAsOwner(q.owner, q.barco, q.proposalId, "aprobada");
    expect(r.ok === false && r.error.code).toBe("INVALID_TRANSITION");
  });

  it("WHEN un empleado decide o contesta THE SYSTEM SHALL devolver FORBIDDEN; respuestas inválidas del dueño, VALIDATION_ERROR", async () => {
    const p = await proposal("aprobada_socios");
    const a = await decideProposalAsOwner(p.employee, p.barco, p.proposalId, "aprobada");
    const b = await saveOwnerPersonality(p.employee, p.barco, answers());
    const c = await saveOwnerPersonality(p.owner, p.barco, { ...answers(), [PERSONALITY_QUESTIONS[0]!.key]: "no-existe" });
    expect([a, b, c].map((r) => !r.ok && r.error.code)).toEqual(["FORBIDDEN", "FORBIDDEN", "VALIDATION_ERROR"]);
    expect((await saveOwnerPersonality(p.owner, p.barco, answers())).ok).toBe(true);
  });

  it("WHEN setAreaSpecialty recibe una llave que no existe en el muelle THE SYSTEM SHALL devolver NOT_FOUND sin escribir", async () => {
    const n = await network({ specialtyKey: null });
    const r = await setAreaSpecialty(n.owner, n.barco, n.areaId, "no-existe");
    expect(!r.ok && r.error.code).toBe("NOT_FOUND");
    const [row] = await db.select().from(area).where(eq(area.id, n.areaId));
    expect(row?.specialtyKey).toBeNull();
    expect(await setAreaSpecialty(n.owner, n.barco, n.areaId, "comercial")).toEqual({ ok: true, data: true });
  });
});
