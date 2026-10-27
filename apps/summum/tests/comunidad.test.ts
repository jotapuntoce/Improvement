// Motor de la comunidad (server/community) contra el Supabase de desarrollo: niveles, feed y calendario.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, comment, communityEvent, course, lesson, lessonCompletion, membership, organization, post, profile } from "@jotapuntoce/db/schema";
import { levelFor, memberPoints } from "../server/community/levels.ts";
import { createPost, deletePost } from "../server/community/feed.ts";
import { createEvent, listUpcoming } from "../server/community/events.ts";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
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

async function red() {
  const [dock] = await db.insert(organization).values({ name: "t-com", slug: `t-com-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const muelle = dock!.id;
  orgIds.push(muelle);
  const owner = await person();
  await db.insert(membership).values({ userId: owner, orgId: muelle, role: "owner", acceptedAt: new Date() });
  const afiliada = async (status: "activa" | "suspendida") => {
    const id = await person();
    await db.insert(affiliate).values({ profileId: id, muelleOrgId: muelle, displayName: "A", publicSlug: `a-${id}`, status });
    return id;
  };
  return { muelle, owner, ana: await afiliada("activa"), beto: await afiliada("activa"), sus: await afiliada("suspendida") };
}

describe("levelFor", () => {
  it("WHEN recibe 0, 9, 10, 400 y 5000 THE SYSTEM SHALL devolver 1, 1, 2, 9 y 9", () => {
    expect([0, 9, 10, 400, 5000].map(levelFor)).toEqual([1, 1, 2, 9, 9]);
  });
});

describe("memberPoints", () => {
  it("WHEN una afiliada tiene 2 posts, 1 comentario y 1 lección THE SYSTEM SHALL darle 10 puntos y nivel 2", async () => {
    const f = await red();
    const [p] = await db.insert(post).values([{ muelleOrgId: f.muelle, authorId: f.ana, body: "a" }, { muelleOrgId: f.muelle, authorId: f.ana, body: "b" }]).returning();
    await db.insert(comment).values({ postId: p!.id, authorId: f.ana, body: "c" });
    const [c] = await db.insert(course).values({ muelleOrgId: f.muelle, title: "Curso" }).returning();
    const [l] = await db.insert(lesson).values({ courseId: c!.id, title: "L" }).returning();
    await db.insert(lessonCompletion).values({ lessonId: l!.id, profileId: f.ana });
    const points = (await memberPoints(f.muelle)).get(f.ana);
    expect(points).toBe(10);
    expect(levelFor(points!)).toBe(2);
  });
});

describe("feed", () => {
  it("WHEN una afiliada suspendida publica THE SYSTEM SHALL lanzar 404 sin escribir", async () => {
    const f = await red();
    await expect(createPost(f.sus, f.muelle, "hola")).rejects.toMatchObject(NOT_FOUND);
    expect(await db.select().from(post).where(eq(post.muelleOrgId, f.muelle))).toEqual([]);
  });

  it("WHEN una afiliada que no es autora ni dueña borra THE SYSTEM SHALL devolver el error y conservar el post", async () => {
    const f = await red();
    const r = await createPost(f.ana, f.muelle, "mío");
    if (!r.ok) throw new Error(r.error);
    expect(await deletePost(f.beto, r.data.id)).toEqual({ ok: false, error: "Revisa los datos del formulario." });
    expect(await db.select().from(post).where(eq(post.id, r.data.id))).toHaveLength(1);
    expect((await deletePost(f.owner, r.data.id)).ok).toBe(true);
  });
});

describe("eventos", () => {
  it("WHEN el liveUrl es http THE SYSTEM SHALL devolver ok false; listUpcoming excluye los pasados", async () => {
    const f = await red();
    const now = new Date("2026-10-27T18:00:00Z");
    const base = { endsAt: null, description: "" };
    expect((await createEvent(f.owner, f.muelle, { ...base, title: "Junta", startsAt: "2026-11-01T18:00:00Z", liveUrl: "http://ejemplo.com" })).ok).toBe(false);
    expect((await createEvent(f.owner, f.muelle, { ...base, title: "Futura", startsAt: "2026-11-01T18:00:00Z", liveUrl: "https://ejemplo.com" })).ok).toBe(true);
    await db.insert(communityEvent).values({ muelleOrgId: f.muelle, title: "Pasada", startsAt: new Date("2026-10-01T18:00:00Z") });
    expect((await listUpcoming(f.ana, f.muelle, now)).map((e) => e.title)).toEqual(["Futura"]);
  });
});
