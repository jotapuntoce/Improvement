// Aula de la red: cursos y lecciones con candado por nivel. El nivel se calcula aquí (levels.ts); RLS solo
// limita a la red.
import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { course, lesson, lessonCompletion } from "@jotapuntoce/db/schema";
import { assertDockOwner, assertNetworkMember } from "../auth/guard.ts";
import type { Result } from "../result.ts";
import { levelFor, memberPoints } from "./levels.ts";

const INVALIDO = "Revisa los datos del formulario.";
const uuid = z.string().uuid();
const httpsUrl = z.string().trim().url().startsWith("https://");

const courseSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).default(""),
  minLevel: z.coerce.number().int().min(1).max(9),
  position: z.coerce.number().int().min(0).max(1000).default(0),
  published: z.boolean().default(false),
});

const lessonSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().max(20000).default(""),
  videoUrl: httpsUrl.nullable().default(null),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function createCourse(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertDockOwner(userId, muelleId);
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [row] = await db.insert(course).values({ muelleOrgId: muelleId, ...parsed.data }).returning({ id: course.id });
  return { ok: true, data: row! };
}

export async function createLesson(userId: string, courseId: string, input: unknown): Promise<Result<{ id: string }>> {
  if (!uuid.safeParse(courseId).success) notFound();
  const [c] = await db.select({ muelleOrgId: course.muelleOrgId }).from(course).where(eq(course.id, courseId)).limit(1);
  if (!c) notFound();
  await assertDockOwner(userId, c.muelleOrgId);
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [row] = await db.insert(lesson).values({ courseId, ...parsed.data }).returning({ id: lesson.id });
  return { ok: true, data: row! };
}

async function levelOf(userId: string, muelleId: string) {
  return levelFor((await memberPoints(muelleId)).get(userId) ?? 0);
}

/** Cursos publicados con `locked`; las lecciones solo viajan si el curso no está bloqueado. */
export async function listCourses(userId: string, muelleId: string) {
  await assertNetworkMember(userId, muelleId);
  const [level, courses] = await Promise.all([
    levelOf(userId, muelleId),
    db
      .select()
      .from(course)
      .where(and(eq(course.muelleOrgId, muelleId), eq(course.published, true)))
      .orderBy(asc(course.position), asc(course.title)),
  ]);
  const openIds = courses.filter((c) => c.minLevel <= level).map((c) => c.id);
  const lessons = openIds.length
    ? await db.select().from(lesson).where(inArray(lesson.courseId, openIds)).orderBy(asc(lesson.position), asc(lesson.title))
    : [];
  return courses.map((c) => {
    const locked = level < c.minLevel;
    return { ...c, locked, lessons: locked ? [] : lessons.filter((l) => l.courseId === c.id) };
  });
}

export async function completeLesson(userId: string, lessonId: string): Promise<Result<true>> {
  if (!uuid.safeParse(lessonId).success) notFound();
  const [row] = await db
    .select({ muelleOrgId: course.muelleOrgId, minLevel: course.minLevel, published: course.published })
    .from(lesson)
    .innerJoin(course, eq(course.id, lesson.courseId))
    .where(eq(lesson.id, lessonId))
    .limit(1);
  if (!row) notFound();
  await assertNetworkMember(userId, row.muelleOrgId);
  if (!row.published || (await levelOf(userId, row.muelleOrgId)) < row.minLevel) return { ok: false, error: INVALIDO };
  await db.insert(lessonCompletion).values({ lessonId, profileId: userId }).onConflictDoNothing();
  return { ok: true, data: true };
}
