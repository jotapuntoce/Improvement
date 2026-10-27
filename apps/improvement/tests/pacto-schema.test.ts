// Esquema del Pacto (pacto_consent, pacto_pillar, pacto_entry, pacto_pause) contra el Supabase de desarrollo
// y su RLS estricta: asUser simula el rol authenticated, como en tests/afiliadas-schema.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  membership,
  organization,
  PACTO_CONSENT_VERSION,
  pactoConsent,
  pactoEntry,
  pactoPause,
  pactoPillar,
  profile,
} from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
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

/** Muelle con su dueño, una afiliada activa con consentimiento, un pilar, un registro y una pausa. */
async function pacto() {
  const [dock] = await db.insert(organization).values({ name: "t-pacto", slug: `t-pacto-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  orgIds.push(dock!.id);
  const owner = await person();
  await db.insert(membership).values({ userId: owner, orgId: dock!.id, role: "owner", acceptedAt: new Date() });
  const ana = await person();
  await db.insert(affiliate).values({ profileId: ana, muelleOrgId: dock!.id, displayName: "Ana", publicSlug: `ana-${ana}` });
  await db.insert(pactoConsent).values({ profileId: ana, consentTextVersion: PACTO_CONSENT_VERSION, acceptedAt: new Date() });
  const [pillar] = await db.insert(pactoPillar).values({ muelleOrgId: dock!.id, name: "Movimiento" }).returning();
  await db.insert(pactoEntry).values({ profileId: ana, pillarId: pillar!.id, entryDate: "2026-10-26", note: "Caminé" });
  await db.insert(pactoPause).values({ profileId: ana, startsOn: "2026-10-27", endsOn: "2026-10-28" });
  return { muelle: dock!.id, owner, ana, pillarId: pillar!.id };
}

const count = async (userId: string, table: string) =>
  Number((await asUser<{ n: string }>(userId, `select count(*) as n from ${table}`))[0]?.n ?? 0);

describe("esquema del Pacto", () => {
  it("WHEN se insertan consentimiento, pilar, registro y pausa THE SYSTEM SHALL leerlos de vuelta", async () => {
    const p = await pacto();
    const [entry] = await db.select().from(pactoEntry).where(sql`${pactoEntry.profileId} = ${p.ana}`);
    expect(entry).toMatchObject({ pillarId: p.pillarId, entryDate: "2026-10-26", note: "Caminé" });
    expect(await db.select().from(pactoPause).where(sql`${pactoPause.profileId} = ${p.ana}`)).toHaveLength(1);
    expect(await db.select().from(pactoConsent).where(sql`${pactoConsent.profileId} = ${p.ana}`)).toHaveLength(1);
  });

  it("WHEN se repite el registro del día, la pausa va al revés o hay un segundo consentimiento THE SYSTEM SHALL rechazarlo", async () => {
    const p = await pacto();
    await expect(db.insert(pactoEntry).values({ profileId: p.ana, pillarId: p.pillarId, entryDate: "2026-10-26" })).rejects.toThrow();
    await expect(db.insert(pactoPause).values({ profileId: p.ana, startsOn: "2026-10-28", endsOn: "2026-10-27" })).rejects.toThrow();
    await expect(db.insert(pactoConsent).values({ profileId: p.ana, consentTextVersion: 1, acceptedAt: new Date() })).rejects.toThrow();
  });
});

describe("RLS del Pacto", () => {
  it("WHEN la persona consulta sus tablas THE SYSTEM SHALL ver solo lo suyo; el dueño del muelle no ve nada ajeno", async () => {
    const p = await pacto();
    for (const table of ["pacto_entry", "pacto_consent", "pacto_pause"]) {
      expect(await count(p.ana, table)).toBe(1);
      expect(await count(p.owner, table)).toBe(0);
    }
  });

  it("WHEN una afiliada activa consulta los pilares THE SYSTEM SHALL ver los de su muelle; un perfil ajeno, 0", async () => {
    const p = await pacto();
    const mine = await asUser<{ id: string }>(p.ana, `select id from pacto_pillar where muelle_org_id = '${p.muelle}'`);
    expect(mine.map((r) => r.id)).toEqual([p.pillarId]);
    expect(await asUser(await person(), `select id from pacto_pillar where muelle_org_id = '${p.muelle}'`)).toEqual([]);
  });
});
