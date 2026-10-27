// Motor de afiliadas (server/affiliates/affiliates.ts) contra el Supabase de desarrollo. Patrón
// dockWithOwners de tests/fee-changes.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  membership,
  organization,
  PERSONALITY_QUESTIONS,
  personalityProfile,
  profile,
} from "@jotapuntoce/db/schema";
import {
  answerQuestionnaire,
  createSpecialty,
  listAffiliates,
  registerAffiliate,
  saveAffiliateProfile,
  setAffiliateStatus,
} from "../server/affiliates/affiliates.ts";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const INVALIDO = { ok: false, error: "Revisa los datos del formulario." };

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function newProfile() {
  const id = crypto.randomUUID();
  const email = `${id}@example.com`;
  await db.insert(profile).values({ id, email });
  profileIds.push(id);
  return { id, email };
}

async function dockWithOwners(n: number) {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  if (!dock) throw new Error("sin fila");
  orgIds.push(dock.id);
  const owners: string[] = [];
  for (let i = 0; i < n; i++) {
    const { id } = await newProfile();
    await db.insert(membership).values({ userId: id, orgId: dock.id, role: "owner", acceptedAt: new Date() });
    owners.push(id);
  }
  return { dock, owners };
}

/** Un muelle con su dueño, la especialidad `contabilidad` y una afiliada activa registrada. */
async function network() {
  const { dock, owners } = await dockWithOwners(1);
  const owner = owners[0]!;
  await createSpecialty(owner, dock.id, { key: "contabilidad", label: "Contabilidad" });
  const person = await newProfile();
  const r = await registerAffiliate(owner, dock.id, { email: person.email, displayName: "Ana Pérez", specialtyKeys: ["contabilidad"] });
  if (!r.ok) throw new Error(r.error);
  return { dock, owner, person, affiliate: r.data };
}

const VALID = Object.fromEntries(PERSONALITY_QUESTIONS.map((q) => [q.key, q.options[0].value]));
const profileOf = async (id: string) => db.select().from(personalityProfile).where(eq(personalityProfile.profileId, id));

describe("registerAffiliate", () => {
  it("WHEN el dueño registra un perfil existente THE SYSTEM SHALL crearla activa con slug único; repetida es inválido", async () => {
    const { dock, owner, person, affiliate: row } = await network();
    expect(row.status).toBe("activa");
    expect(row.publicSlug).toMatch(/^ana-perez-[0-9a-f]{6}$/);
    const again = await registerAffiliate(owner, dock.id, { email: person.email, displayName: "Ana", specialtyKeys: ["contabilidad"] });
    expect(again).toEqual(INVALIDO);
  });

  it("WHEN alguien que no es dueño registra o lista THE SYSTEM SHALL lanzar 404", async () => {
    const { dock, person } = await network();
    await expect(
      registerAffiliate(person.id, dock.id, { email: person.email, displayName: "Ana", specialtyKeys: ["contabilidad"] }),
    ).rejects.toMatchObject(NOT_FOUND);
    await expect(listAffiliates(person.id, dock.id)).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("answerQuestionnaire", () => {
  it("WHEN la afiliada activa contesta las nueve THE SYSTEM SHALL guardar su perfil v1; con una faltante, inválido sin escribir", async () => {
    const { dock, person } = await network();
    const { ritmo: _ritmo, ...missing } = VALID;
    expect(await answerQuestionnaire(person.id, dock.id, missing)).toEqual(INVALIDO);
    expect(await profileOf(person.id)).toEqual([]);

    expect(await answerQuestionnaire(person.id, dock.id, VALID)).toEqual({ ok: true, data: true });
    expect(await profileOf(person.id)).toMatchObject([{ subjectKind: "afiliada", questionnaireVersion: 1 }]);
  });

  it("WHEN la afiliada está suspendida THE SYSTEM SHALL devolver ok false sin escribir", async () => {
    const { dock, owner, person, affiliate: row } = await network();
    await setAffiliateStatus(owner, row.id, "suspendida");
    expect((await answerQuestionnaire(person.id, dock.id, VALID)).ok).toBe(false);
    expect(await profileOf(person.id)).toEqual([]);
  });
});

describe("saveAffiliateProfile", () => {
  it("WHEN el barco no es de la afiliada THE SYSTEM SHALL devolver ok false sin cambiar barco_org_id", async () => {
    const { dock, person, affiliate: row } = await network();
    const [boat] = await db
      .insert(organization)
      .values({ name: "b", slug: `b-${crypto.randomUUID()}`, kind: "barco", parentOrgId: dock.id })
      .returning();
    orgIds.push(boat!.id);
    const r = await saveAffiliateProfile(person.id, dock.id, { publicBio: null, directoryOptIn: true, barcoOrgId: boat!.id });
    expect(r.ok).toBe(false);
    const [after] = await db.select().from(affiliate).where(eq(affiliate.id, row.id));
    expect(after?.barcoOrgId).toBeNull();
  });
});

describe("createSpecialty", () => {
  it("WHEN la llave es Ventas Top THE SYSTEM SHALL devolver inválido", async () => {
    const { dock, owners } = await dockWithOwners(1);
    expect(await createSpecialty(owners[0]!, dock.id, { key: "Ventas Top", label: "Ventas" })).toEqual(INVALIDO);
  });
});
