// Check-in semanal y 1-a-1 (server/people/checkins.ts) contra el Supabase de desarrollo, más su RLS por
// persona con asUser() (rol authenticated): la persona y el dueño, nunca un compañero.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { checkin, membership, organization, profile } from "@jotapuntoce/db/schema";
import { checkinsFor, myOneOnOnes, recordOneOnOne, submitCheckin } from "../server/people/checkins.ts";
import { weekStart } from "../server/direccion/scorecard/week.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function equipo() {
  const [row] = await db.insert(organization).values({ name: "t-checkin", slug: `t-checkin-${crypto.randomUUID()}` }).returning();
  const orgId = row!.id;
  orgIds.push(orgId);
  const person = async (role: "owner" | "employee") => {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
    return id;
  };
  return { orgId, owner: await person("owner"), ana: await person("employee"), beto: await person("employee") };
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

const NOW = new Date("2026-10-28T18:00:00Z"); // miércoles en Ciudad de México

describe("submitCheckin", () => {
  it("WHEN manda dos check-ins en la misma semana THE SYSTEM SHALL dejar una fila con el mood del segundo y week_start de weekStart(now)", async () => {
    const f = await equipo();
    await submitCheckin(f.ana, f.orgId, { mood: 2 }, NOW);
    const r = await submitCheckin(f.ana, f.orgId, { mood: 4, note: "Mejor" }, new Date("2026-10-29T18:00:00Z"));
    expect(r).toEqual({ ok: true, data: { weekStart: weekStart(NOW) } });
    const rows = await db.select().from(checkin).where(and(eq(checkin.orgId, f.orgId), eq(checkin.profileId, f.ana)));
    expect(rows.map((c) => [c.mood, c.weekStart])).toEqual([[4, weekStart(NOW)]]);
  });

  it("WHEN un empleado pide los check-ins de un compañero THE SYSTEM SHALL dar FORBIDDEN; mood 6 da VALIDATION_ERROR sin escribir", async () => {
    const f = await equipo();
    expect(await checkinsFor(f.ana, f.orgId, f.beto)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await submitCheckin(f.ana, f.orgId, { mood: 6 }, NOW)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await db.select().from(checkin).where(eq(checkin.orgId, f.orgId))).toEqual([]);
  });
});

describe("1-a-1", () => {
  it("WHEN el dueño registra un 1-a-1 con Ana THE SYSTEM SHALL mostrárselo a Ana y no a Beto", async () => {
    const f = await equipo();
    const r = await recordOneOnOne(f.owner, f.orgId, { employeeId: f.ana, heldOn: "2026-10-27", sharedNotes: "Acuerdos" });
    expect(r.ok).toBe(true);
    expect((await myOneOnOnes(f.ana, f.orgId)).map((o) => o.sharedNotes)).toEqual(["Acuerdos"]);
    expect(await myOneOnOnes(f.beto, f.orgId)).toEqual([]);
  });
});

describe("RLS por persona", () => {
  it("WHEN un empleado consulta checkin y one_on_one THE SYSTEM SHALL ver solo lo suyo; el dueño ve todo el equipo", async () => {
    const f = await equipo();
    await submitCheckin(f.ana, f.orgId, { mood: 3 }, NOW);
    await submitCheckin(f.beto, f.orgId, { mood: 5 }, NOW);
    await recordOneOnOne(f.owner, f.orgId, { employeeId: f.ana, heldOn: "2026-10-27" });
    await recordOneOnOne(f.owner, f.orgId, { employeeId: f.beto, heldOn: "2026-10-27" });
    const checkins = `select profile_id from checkin where org_id = '${f.orgId}'`;
    const ones = `select employee_id from one_on_one where org_id = '${f.orgId}'`;
    expect(await asUser<{ profile_id: string }>(f.ana, checkins)).toEqual([{ profile_id: f.ana }]);
    expect(await asUser<{ employee_id: string }>(f.ana, ones)).toEqual([{ employee_id: f.ana }]);
    expect(await asUser(f.owner, checkins)).toHaveLength(2);
    expect(await asUser(f.owner, ones)).toHaveLength(2);
  });
});
