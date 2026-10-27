// Puntos y niveles 1-9 de la comunidad. Constantes del producto, iguales para toda red.
import { and, count, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { comment, course, lesson, lessonCompletion, post } from "@jotapuntoce/db/schema";

export const LEVEL_THRESHOLDS = [0, 10, 30, 60, 100, 150, 220, 300, 400] as const;
export const COMMUNITY_POINTS = { post: 2, comment: 1, lesson: 5 } as const;

/** El mayor nivel (1-9) cuyo umbral es ≤ puntos. */
export function levelFor(points: number): number {
  let level = 1;
  LEVEL_THRESHOLDS.forEach((t, i) => {
    if (points >= t) level = i + 1;
  });
  return level;
}

/** Uso interno de server/community: el llamador ya pasó su guard. Puntos por profile_id dentro del muelle. */
export async function memberPoints(muelleId: string): Promise<Map<string, number>> {
  const [posts, comments, lessons] = await Promise.all([
    db.select({ id: post.authorId, n: count() }).from(post).where(eq(post.muelleOrgId, muelleId)).groupBy(post.authorId),
    db
      .select({ id: comment.authorId, n: count() })
      .from(comment)
      .innerJoin(post, eq(post.id, comment.postId))
      .where(eq(post.muelleOrgId, muelleId))
      .groupBy(comment.authorId),
    db
      .select({ id: lessonCompletion.profileId, n: count() })
      .from(lessonCompletion)
      .innerJoin(lesson, eq(lesson.id, lessonCompletion.lessonId))
      .innerJoin(course, and(eq(course.id, lesson.courseId), eq(course.muelleOrgId, muelleId)))
      .groupBy(lessonCompletion.profileId),
  ]);
  const points = new Map<string, number>();
  const add = (rows: { id: string; n: number }[], weight: number) => {
    for (const r of rows) points.set(r.id, (points.get(r.id) ?? 0) + r.n * weight);
  };
  add(posts, COMMUNITY_POINTS.post);
  add(comments, COMMUNITY_POINTS.comment);
  add(lessons, COMMUNITY_POINTS.lesson);
  return points;
}
