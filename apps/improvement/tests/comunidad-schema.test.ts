// Esquema de la comunidad (post, comment, community_event, course, lesson, lesson_completion) contra el
// Supabase de desarrollo y su RLS: asUser simula el rol authenticated, como en tests/pacto-schema.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  comment,
  communityEvent,
  course,
  lesson,
  lessonCompletion,
  membership,
  organization,
  post,
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

/** Muelle con dueño, una afiliada activa, una suspendida, un empleado de un barco del muelle y una fila de cada tabla. */
async function comunidad() {
  const [dock] = await db.insert(organization).values({ name: "t-com", slug: `t-com-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const muelle = dock!.id;
  orgIds.push(muelle);
  const owner = await person();
  await db.insert(membership).values({ userId: owner, orgId: muelle, role: "owner", acceptedAt: new Date() });
  const ana = await person();
  await db.insert(affiliate).values({ profileId: ana, muelleOrgId: muelle, displayName: "Ana", publicSlug: `ana-${ana}` });
  const suspendida = await person();
  await db.insert(affiliate).values({ profileId: suspendida, muelleOrgId: muelle, displayName: "Sus", publicSlug: `sus-${suspendida}`, status: "suspendida" });
  const [boat] = await db.insert(organization).values({ name: "t-barco", slug: `t-barco-${crypto.randomUUID()}`, kind: "barco", parentOrgId: muelle }).returning();
  orgIds.unshift(boat!.id);
  const empleado = await person();
  await db.insert(membership).values({ userId: empleado, orgId: boat!.id, role: "employee", acceptedAt: new Date() });

  const [p] = await db.insert(post).values({ muelleOrgId: muelle, authorId: ana, body: "Hola red" }).returning();
  await db.insert(comment).values({ postId: p!.id, authorId: owner, body: "Bienvenida" });
  await db.insert(communityEvent).values({ muelleOrgId: muelle, title: "Junta", startsAt: new Date(), liveUrl: "https://meet.example.com/x" });
  const [c] = await db.insert(course).values({ muelleOrgId: muelle, title: "Ventas", minLevel: 2, published: true }).returning();
  const [l] = await db.insert(lesson).values({ courseId: c!.id, title: "Lección 1" }).returning();
  await db.insert(lessonCompletion).values({ lessonId: l!.id, profileId: ana });
  return { muelle, owner, ana, suspendida, empleado, postId: p!.id, courseId: c!.id, lessonId: l!.id };
}

const count = async (userId: string, table: string) =>
  Number((await asUser<{ n: string }>(userId, `select count(*) as n from ${table}`))[0]?.n ?? 0);

describe("esquema de la comunidad", () => {
  it("WHEN se inserta una fila de cada tabla THE SYSTEM SHALL leerlas de vuelta", async () => {
    const f = await comunidad();
    const n = async (t: string, col: string, v: string) =>
      Number((await db.execute(sql.raw(`select count(*) as n from ${t} where ${col} = '${v}'`)))[0]?.n ?? 0);
    expect(await n("post", "muelle_org_id", f.muelle)).toBe(1);
    expect(await n("comment", "post_id", f.postId)).toBe(1);
    expect(await n("community_event", "muelle_org_id", f.muelle)).toBe(1);
    expect(await n("course", "muelle_org_id", f.muelle)).toBe(1);
    expect(await n("lesson", "course_id", f.courseId)).toBe(1);
    expect(await n("lesson_completion", "lesson_id", f.lessonId)).toBe(1);
  });

  it("WHEN min_level 10, live_url http, comentario vacío o completion duplicada THE SYSTEM SHALL rechazar cada insert", async () => {
    const f = await comunidad();
    await expect(db.insert(course).values({ muelleOrgId: f.muelle, title: "X", minLevel: 10 })).rejects.toThrow();
    await expect(db.insert(communityEvent).values({ muelleOrgId: f.muelle, title: "X", startsAt: new Date(), liveUrl: "http://ejemplo.com" })).rejects.toThrow();
    await expect(db.insert(comment).values({ postId: f.postId, authorId: f.ana, body: "" })).rejects.toThrow();
    await expect(db.insert(lessonCompletion).values({ lessonId: f.lessonId, profileId: f.ana })).rejects.toThrow();
  });
});

describe("RLS de la comunidad", () => {
  it("WHEN una afiliada activa consulta THE SYSTEM SHALL ver las filas de su muelle; suspendida y empleado de barco ven 0", async () => {
    const f = await comunidad();
    for (const t of ["post", "course", "community_event"]) {
      expect(await count(f.ana, t)).toBeGreaterThanOrEqual(1);
      expect(await count(f.suspendida, t)).toBe(0);
      expect(await count(f.empleado, t)).toBe(0);
    }
    expect(await count(f.owner, "comment")).toBeGreaterThanOrEqual(1);
    expect(await count(f.owner, "lesson_completion")).toBe(1);
    expect(await count(f.empleado, "lesson")).toBe(0);
  });
});
