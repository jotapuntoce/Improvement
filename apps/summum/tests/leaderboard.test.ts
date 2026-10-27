// Ranking entre afiliadas y referente público (server/community/leaderboard.ts) contra el Supabase de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, membership, organization, post, profile, referralLink } from "@jotapuntoce/db/schema";
import { leaderboard, referrerByCode } from "../server/community/leaderboard.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function person(fullName: string | null = null) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com`, fullName });
  profileIds.push(id);
  return id;
}

async function posts(muelle: string, authorId: string, n: number) {
  await db.insert(post).values(Array.from({ length: n }, (_, i) => ({ muelleOrgId: muelle, authorId, body: `p${i}` })));
}

describe("leaderboard", () => {
  it("WHEN hay activas de 10 y 30 puntos, una suspendida y un dueño con posts THE SYSTEM SHALL devolver solo las activas, la de 30 primero", async () => {
    const [dock] = await db.insert(organization).values({ name: "t-rank", slug: `t-rank-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    const muelle = dock!.id;
    orgIds.push(muelle);
    const owner = await person();
    await db.insert(membership).values({ userId: owner, orgId: muelle, role: "owner", acceptedAt: new Date() });
    const ana = await person();
    const beto = await person();
    const sus = await person();
    await db.insert(affiliate).values([
      { profileId: ana, muelleOrgId: muelle, displayName: "Ana", publicSlug: `ana-${ana}` },
      { profileId: beto, muelleOrgId: muelle, displayName: "Beto", publicSlug: `beto-${beto}` },
      { profileId: sus, muelleOrgId: muelle, displayName: "Sus", publicSlug: `sus-${sus}`, status: "suspendida" },
    ]);
    await posts(muelle, ana, 5); // 10 puntos
    await posts(muelle, beto, 15); // 30 puntos
    await posts(muelle, sus, 20);
    await posts(muelle, owner, 20);
    const rows = await leaderboard(ana, muelle);
    expect(rows.map((r) => [r.displayName, r.points, r.level])).toEqual([
      ["Beto", 30, 3],
      ["Ana", 10, 2],
    ]);
  });
});

describe("referrerByCode", () => {
  it("WHEN el código no tiene formato o no existe THE SYSTEM SHALL devolver null; si existe, solo el primer nombre", async () => {
    expect(await referrerByCode("corto")).toBeNull();
    expect(await referrerByCode("AAAAAAAAAAAAAAAA")).toBeNull();
    const [dock] = await db.insert(organization).values({ name: "t-ref", slug: `t-ref-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    orgIds.push(dock!.id);
    const ana = await person("Ana María López");
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await db.insert(referralLink).values({ profileId: ana, muelleOrgId: dock!.id, code });
    expect(await referrerByCode(code)).toEqual({ firstName: "Ana" });
  });
});
