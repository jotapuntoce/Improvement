// Feed de la comunidad de la red: publicaciones y comentarios de dueños del muelle y afiliadas activas.
import { count, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { comment, post, profile } from "@jotapuntoce/db/schema";
import { assertNetworkMember, listMyDocks } from "../auth/guard.ts";
import type { Result } from "../result.ts";

const INVALIDO = "Revisa los datos del formulario.";
const uuid = z.string().uuid();

async function postById(postId: string) {
  if (!uuid.safeParse(postId).success) notFound();
  const [row] = await db.select().from(post).where(eq(post.id, postId)).limit(1);
  if (!row) notFound();
  return row;
}

export async function createPost(userId: string, muelleId: string, body: unknown): Promise<Result<{ id: string }>> {
  await assertNetworkMember(userId, muelleId);
  const parsed = z.string().trim().min(1).max(4000).safeParse(body);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [row] = await db.insert(post).values({ muelleOrgId: muelleId, authorId: userId, body: parsed.data }).returning({ id: post.id });
  return { ok: true, data: row! };
}

export async function addComment(userId: string, postId: string, body: unknown): Promise<Result<{ id: string }>> {
  const p = await postById(postId);
  await assertNetworkMember(userId, p.muelleOrgId);
  const parsed = z.string().trim().min(1).max(2000).safeParse(body);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [row] = await db.insert(comment).values({ postId, authorId: userId, body: parsed.data }).returning({ id: comment.id });
  return { ok: true, data: row! };
}

/** Las 50 publicaciones más recientes con el nombre del autor y cuántos comentarios tienen. */
export async function listFeed(userId: string, muelleId: string) {
  await assertNetworkMember(userId, muelleId);
  return db
    .select({ id: post.id, body: post.body, createdAt: post.createdAt, authorId: post.authorId, authorName: profile.fullName, comments: count(comment.id) })
    .from(post)
    .innerJoin(profile, eq(profile.id, post.authorId))
    .leftJoin(comment, eq(comment.postId, post.id))
    .where(eq(post.muelleOrgId, muelleId))
    .groupBy(post.id, profile.fullName)
    .orderBy(desc(post.createdAt))
    .limit(50);
}

export async function deletePost(userId: string, postId: string): Promise<Result<true>> {
  const p = await postById(postId);
  await assertNetworkMember(userId, p.muelleOrgId);
  const isOwner = p.authorId === userId || (await listMyDocks(userId)).some((d) => d.id === p.muelleOrgId);
  if (!isOwner) return { ok: false, error: INVALIDO };
  await db.delete(post).where(eq(post.id, postId));
  return { ok: true, data: true };
}
