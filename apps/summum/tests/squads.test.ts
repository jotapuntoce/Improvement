// Escuadras y retos del Pacto (server/pacto/squads.ts) contra el Supabase de desarrollo, más su RLS con el
// patrón asUser() (rol authenticated). La escuadra solo ve nombre y estado de apoyo.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  challenge,
  membership,
  organization,
  PACTO_CONSENT_VERSION,
  pactoConsent,
  pactoEntry,
  pactoPillar,
  profile,
  squad,
  squadMember,
} from "@jotapuntoce/db/schema";
import { addSquadMember, createChallenge, squadBoard } from "../server/pacto/squads.ts";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const NOW = new Date("2026-10-26T18:00:00Z"); // 26 de octubre en Ciudad de México

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function person(fullName: string) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com`, fullName });
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

/**
 * Muelle con dueño, un pilar creado el 1 de octubre y una escuadra con Ana (al día) y Beto (en peligro: su
 * último registro fue el 24). Los dos son afiliadas activas con consentimiento desde el 1 de octubre.
 */
async function fixture() {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const muelle = dock!.id;
  orgIds.push(muelle);
  const owner = await person("Dueña");
  await db.insert(membership).values({ userId: owner, orgId: muelle, role: "owner", acceptedAt: new Date() });
  const [pillar] = await db.insert(pactoPillar).values({ muelleOrgId: muelle, name: "Movimiento", createdAt: new Date("2026-10-01T12:00:00Z") }).returning();
  const [sq] = await db.insert(squad).values({ muelleOrgId: muelle, name: "Escuadra 1", createdBy: owner }).returning();
  const member = async (name: string, lastDays: string[]) => {
    const id = await person(name);
    await db.insert(affiliate).values({ profileId: id, muelleOrgId: muelle, displayName: name, publicSlug: `${name}-${id}` });
    await db.insert(pactoConsent).values({ profileId: id, consentTextVersion: PACTO_CONSENT_VERSION, acceptedAt: new Date("2026-10-01T12:00:00Z") });
    for (const day of lastDays) await db.insert(pactoEntry).values({ profileId: id, pillarId: pillar!.id, entryDate: day, note: "privada" });
    await db.insert(squadMember).values({ squadId: sq!.id, profileId: id });
    return id;
  };
  const ana = await member("Ana", ["2026-10-25", "2026-10-26"]);
  const beto = await member("Beto", ["2026-10-24"]);
  return { muelle, owner, squadId: sq!.id, ana, beto, pillarId: pillar!.id };
}

describe("squadBoard", () => {
  it("WHEN corre para un miembro THE SYSTEM SHALL devolver solo name y supportStatus: Ana bien, Beto apoyo", async () => {
    const f = await fixture();
    const board = await squadBoard(f.ana, f.squadId, NOW);
    for (const row of board) expect(Object.keys(row).sort()).toEqual(["name", "supportStatus"]);
    expect(board).toEqual([
      { name: "Ana", supportStatus: "bien" },
      { name: "Beto", supportStatus: "apoyo" },
    ]);
  });

  it("WHEN alguien que no es miembro ni dueño la consulta THE SYSTEM SHALL lanzar 404", async () => {
    const f = await fixture();
    await expect(squadBoard(await person("Ajeno"), f.squadId, NOW)).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("addSquadMember y createChallenge", () => {
  it("WHEN el perfil no tiene consentimiento vigente THE SYSTEM SHALL devolver ok false sin insertar", async () => {
    const f = await fixture();
    const sinPacto = await person("Carla");
    await db.insert(affiliate).values({ profileId: sinPacto, muelleOrgId: f.muelle, displayName: "Carla", publicSlug: `carla-${sinPacto}` });
    expect((await addSquadMember(f.owner, f.squadId, `${sinPacto}@example.com`)).ok).toBe(false);
    expect(await db.select().from(squadMember).where(eq(squadMember.profileId, sinPacto))).toEqual([]);
  });

  it("WHEN el reto termina antes de empezar THE SYSTEM SHALL devolver ok false sin escribir", async () => {
    const f = await fixture();
    const r = await createChallenge(f.owner, f.muelle, { title: "Octubre activo", pillarId: f.pillarId, squadId: null, startsOn: "2026-10-31", endsOn: "2026-10-01" });
    expect(r.ok).toBe(false);
    expect(await db.select().from(challenge).where(eq(challenge.muelleOrgId, f.muelle))).toEqual([]);
  });
});

describe("RLS de escuadras", () => {
  it("WHEN un miembro consulta squad_member THE SYSTEM SHALL ver su escuadra y 0 registros de sus compañeros; un ajeno ve 0", async () => {
    const f = await fixture();
    const members = await asUser<{ profile_id: string }>(f.ana, `select profile_id from squad_member where squad_id = '${f.squadId}'`);
    expect(members.map((m) => m.profile_id).sort()).toEqual([f.ana, f.beto].sort());
    expect(await asUser(f.ana, `select id from pacto_entry where profile_id = '${f.beto}'`)).toEqual([]);
    expect(await asUser(await person("Ajeno"), `select id from squad_member where squad_id = '${f.squadId}'`)).toEqual([]);
  });
});
