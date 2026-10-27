// Cultura (server/people/culture.ts) contra el Supabase de desarrollo: insights solo agregados, con mínimo
// de 3 respuestas, y celebraciones de aniversario.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { checkin, membership, organization, profile } from "@jotapuntoce/db/schema";
import { celebrations, cultureInsights } from "../server/people/culture.ts";
import { recentWeeks, weekStart } from "../server/direccion/scorecard/week.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

const NOW = new Date("2026-10-28T18:00:00Z");
const [THIS_WEEK, LAST_WEEK] = recentWeeks(weekStart(NOW), 2) as [string, string];

async function org() {
  const [row] = await db.insert(organization).values({ name: "t-cultura", slug: `t-cultura-${crypto.randomUUID()}` }).returning();
  orgIds.push(row!.id);
  return row!.id;
}

async function person(orgId: string, role: "owner" | "employee", fullName: string, acceptedAt = new Date()) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com`, fullName });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt });
  return id;
}

describe("cultureInsights", () => {
  it("WHEN una semana tiene 2 check-ins THE SYSTEM SHALL dar null; con 3, 4 y 5 da promedio 4 y 3 respuestas, sin ids ni nombres", async () => {
    const orgId = await org();
    const owner = await person(orgId, "owner", "Dueña Cultura");
    const ids = await Promise.all(["Ana Cultura", "Beto Cultura", "Caro Cultura"].map((n) => person(orgId, "employee", n)));
    await db.insert(checkin).values([
      { orgId, profileId: ids[0]!, weekStart: THIS_WEEK, mood: 3 },
      { orgId, profileId: ids[1]!, weekStart: THIS_WEEK, mood: 4 },
      { orgId, profileId: ids[2]!, weekStart: THIS_WEEK, mood: 5 },
      { orgId, profileId: ids[0]!, weekStart: LAST_WEEK, mood: 1 },
      { orgId, profileId: ids[1]!, weekStart: LAST_WEEK, mood: 2 },
    ]);
    const r = await cultureInsights(owner, orgId, NOW);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.find((w) => w.weekStart === THIS_WEEK)).toEqual({ weekStart: THIS_WEEK, responses: 3, averageMood: 4 });
    expect(r.data.find((w) => w.weekStart === LAST_WEEK)).toEqual({ weekStart: LAST_WEEK, responses: 2, averageMood: null });
    const text = JSON.stringify(r.data);
    for (const id of [owner, ...ids]) expect(text).not.toContain(id);
    expect(text).not.toMatch(/Cultura|profile_id|profileId/);
    expect((await cultureInsights(ids[0]!, orgId, NOW)).ok).toBe(false);
  });
});

describe("celebrations", () => {
  it("WHEN alguien cumple 2 años en 3 días THE SYSTEM SHALL incluirlo; un empleado sin la sección recibe []", async () => {
    const orgId = await org();
    const owner = await person(orgId, "owner", "Dueña");
    const employee = await person(orgId, "employee", "Lupita", new Date("2024-10-31T18:00:00Z"));
    const list = await celebrations(owner, orgId, NOW);
    expect(list).toContainEqual({ kind: "aniversario", personName: "Lupita", years: 2, on: "2026-10-31" });
    expect(await celebrations(employee, orgId, NOW)).toEqual([]);
  });
});
