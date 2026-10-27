// Aula de la comunidad (server/community/classroom.ts) contra el Supabase de desarrollo: candado por nivel.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, lessonCompletion, membership, organization, post, profile } from "@jotapuntoce/db/schema";
import { completeLesson, createCourse, createLesson, listCourses } from "../server/community/classroom.ts";

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

/** Muelle con dueño, una afiliada activa sin puntos, un curso publicado de nivel 2 y uno de nivel 1, cada uno con una lección. */
async function aula() {
  const [dock] = await db.insert(organization).values({ name: "t-aula", slug: `t-aula-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  const muelle = dock!.id;
  orgIds.push(muelle);
  const owner = await person();
  await db.insert(membership).values({ userId: owner, orgId: muelle, role: "owner", acceptedAt: new Date() });
  const ana = await person();
  await db.insert(affiliate).values({ profileId: ana, muelleOrgId: muelle, displayName: "Ana", publicSlug: `ana-${ana}` });
  const c2 = await createCourse(owner, muelle, { title: "Avanzado", minLevel: 2, published: true });
  const c1 = await createCourse(owner, muelle, { title: "Básico", minLevel: 1, published: true });
  if (!c2.ok || !c1.ok) throw new Error("sin curso");
  const l2 = await createLesson(owner, c2.data.id, { title: "Lección avanzada", videoUrl: "https://video.example.com/1" });
  const l1 = await createLesson(owner, c1.data.id, { title: "Lección básica" });
  if (!l2.ok || !l1.ok) throw new Error("sin lección");
  return { muelle, ana, avanzado: c2.data.id, lessonAvanzada: l2.data.id, lessonBasica: l1.data.id };
}

describe("candado por nivel", () => {
  it("WHEN una afiliada de nivel 1 lista y completa un curso de nivel 2 THE SYSTEM SHALL verlo bloqueado sin lecciones y rechazar sin escribir", async () => {
    const f = await aula();
    const avanzado = (await listCourses(f.ana, f.muelle)).find((c) => c.id === f.avanzado)!;
    expect(avanzado.locked).toBe(true);
    expect(avanzado.lessons).toEqual([]);
    expect((await completeLesson(f.ana, f.lessonAvanzada)).ok).toBe(false);
    expect(await db.select().from(lessonCompletion).where(eq(lessonCompletion.profileId, f.ana))).toEqual([]);
  });

  it("WHEN la afiliada llega a 10 puntos THE SYSTEM SHALL abrir el curso con sus lecciones", async () => {
    const f = await aula();
    await db.insert(post).values(Array.from({ length: 5 }, (_, i) => ({ muelleOrgId: f.muelle, authorId: f.ana, body: `post ${i}` })));
    const avanzado = (await listCourses(f.ana, f.muelle)).find((c) => c.id === f.avanzado)!;
    expect(avanzado.locked).toBe(false);
    expect(avanzado.lessons.map((l) => l.title)).toEqual(["Lección avanzada"]);
  });

  it("WHEN completa dos veces la misma lección THE SYSTEM SHALL dejar una sola fila", async () => {
    const f = await aula();
    expect((await completeLesson(f.ana, f.lessonBasica)).ok).toBe(true);
    expect((await completeLesson(f.ana, f.lessonBasica)).ok).toBe(true);
    expect(await db.select().from(lessonCompletion).where(eq(lessonCompletion.profileId, f.ana))).toHaveLength(1);
  });

  it("WHEN un perfil fuera de la red lista cursos THE SYSTEM SHALL lanzar 404", async () => {
    const f = await aula();
    await expect(listCourses(await person(), f.muelle)).rejects.toMatchObject(NOT_FOUND);
  });
});
