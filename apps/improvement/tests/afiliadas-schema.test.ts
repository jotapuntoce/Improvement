// Esquema de la red de afiliadas (specialty, affiliate, personality_profile, area.specialty_key) contra el
// Supabase de desarrollo, su RLS (asUser simula el rol authenticated, como en tests/crm-schema.test.ts) y
// las dos funciones puras del cuestionario.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  area,
  membership,
  organization,
  PERSONALITY_QUESTIONS,
  PERSONALITY_VERSION,
  personalityAnswersValid,
  personalityMatch,
  personalityProfile,
  profile,
  specialty,
} from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-afiliadas", slug: `t-afiliadas-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId?: string) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  if (orgId) await db.insert(membership).values({ userId: id, orgId, role: "owner", acceptedAt: new Date() });
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

const VALID = Object.fromEntries(PERSONALITY_QUESTIONS.map((q) => [q.key, q.options[0].value])) as Record<string, string>;
const affiliateOf = (profileId: string, muelleOrgId: string) => ({
  profileId,
  muelleOrgId,
  displayName: "Afiliada",
  publicSlug: `afiliada-${crypto.randomUUID()}`,
});

describe("esquema de afiliadas", () => {
  it("WHEN se insertan specialty, affiliate, personality_profile y area.specialty_key THE SYSTEM SHALL leerlos de vuelta", async () => {
    const muelle = await org();
    const p = await person();
    const [s] = await db.insert(specialty).values({ muelleOrgId: muelle, key: "contabilidad", label: "Contabilidad" }).returning();
    const [a] = await db
      .insert(affiliate)
      .values({ ...affiliateOf(p, muelle), specialtyKeys: ["contabilidad"], directoryOptIn: true })
      .returning();
    const [pp] = await db
      .insert(personalityProfile)
      .values({ profileId: p, subjectKind: "afiliada", answers: VALID, questionnaireVersion: PERSONALITY_VERSION })
      .returning();
    const [ar] = await db.insert(area).values({ orgId: muelle, name: "Finanzas", color: "#7c5cff" }).returning();
    await db.update(area).set({ specialtyKey: "contabilidad" }).where(eq(area.id, ar!.id));

    expect(s?.key).toBe("contabilidad");
    expect(a).toMatchObject({ specialtyKeys: ["contabilidad"], status: "activa", directoryOptIn: true });
    expect(pp?.answers).toEqual(VALID);
    expect((await db.select().from(area).where(eq(area.id, ar!.id)))[0]?.specialtyKey).toBe("contabilidad");
  });

  it("WHEN se repite afiliada por muelle, slug, key de especialidad o subject_kind inválido THE SYSTEM SHALL rechazarlo", async () => {
    const muelle = await org();
    const p = await person();
    const other = await person();
    const first = affiliateOf(p, muelle);
    await db.insert(affiliate).values(first);
    await expect(db.insert(affiliate).values(affiliateOf(p, muelle))).rejects.toThrow();
    await expect(db.insert(affiliate).values({ ...affiliateOf(other, muelle), publicSlug: first.publicSlug })).rejects.toThrow();
    await db.insert(specialty).values({ muelleOrgId: muelle, key: "legal", label: "Legal" });
    await expect(db.insert(specialty).values({ muelleOrgId: muelle, key: "legal", label: "Otra" })).rejects.toThrow();
    await expect(
      db.execute(
        sql`insert into personality_profile (profile_id, subject_kind, answers, questionnaire_version) values (${p}, 'otro', '{}'::jsonb, 1)`,
      ),
    ).rejects.toThrow();
  });
});

describe("RLS — red de afiliadas", () => {
  it("WHEN consultan la afiliada y el dueño del muelle THE SYSTEM SHALL dar a cada quien lo suyo", async () => {
    const muelle = await org();
    const dockOwner = await person(muelle);
    const a1 = await person();
    const a2 = await person();
    await db.insert(affiliate).values([affiliateOf(a1, muelle), affiliateOf(a2, muelle)]);
    await db.insert(personalityProfile).values([
      { profileId: a1, subjectKind: "afiliada", answers: VALID, questionnaireVersion: 1 },
      { profileId: a2, subjectKind: "afiliada", answers: VALID, questionnaireVersion: 1 },
    ]);

    expect(await asUser(a1, "select profile_id from affiliate")).toEqual([{ profile_id: a1 }]);
    expect(await asUser(a1, "select profile_id from personality_profile")).toEqual([{ profile_id: a1 }]);
    expect(await asUser(dockOwner, `select id from affiliate where muelle_org_id = '${muelle}'`)).toHaveLength(2);
    expect(await asUser(dockOwner, "select id from personality_profile")).toEqual([]);
  });

  it("WHEN consulta specialty alguien ajeno o una afiliada activa THE SYSTEM SHALL devolver 0 filas o las del muelle", async () => {
    const muelle = await org();
    await db.insert(specialty).values({ muelleOrgId: muelle, key: "legal", label: "Legal" });
    const outsider = await person();
    const member = await person();
    await db.insert(affiliate).values(affiliateOf(member, muelle));

    expect(await asUser(outsider, "select id from specialty")).toEqual([]);
    expect(await asUser(member, "select key from specialty")).toEqual([{ key: "legal" }]);
  });
});

describe("cuestionario de personalidad", () => {
  it("WHEN se validan y comparan respuestas THE SYSTEM SHALL aceptar solo las nueve válidas y dar 67 con 6 de 9", () => {
    expect(personalityAnswersValid(VALID)).toBe(true);
    const { ritmo: _ritmo, ...missing } = VALID;
    expect(personalityAnswersValid(missing)).toBe(false);
    expect(personalityAnswersValid({ ...VALID, ritmo: "lento" })).toBe(false);

    const other = { ...VALID };
    for (const q of PERSONALITY_QUESTIONS.slice(6)) other[q.key] = q.options[1].value;
    expect(personalityMatch(VALID, other)).toBe(67);
  });
});
