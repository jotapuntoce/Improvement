// Calendario de la red: los dueños del muelle crean eventos; la red ve los que vienen.
import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { communityEvent } from "@jotapuntoce/db/schema";
import { assertDockOwner, assertNetworkMember } from "../auth/guard.ts";
import type { Result } from "../result.ts";

const INVALIDO = "Revisa los datos del formulario.";

const eventSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable(),
    liveUrl: z.string().trim().url().startsWith("https://").nullable(),
    description: z.string().trim().max(2000).default(""),
  })
  .refine((e) => !e.endsAt || e.endsAt >= e.startsAt);

export async function createEvent(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertDockOwner(userId, muelleId);
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [row] = await db
    .insert(communityEvent)
    .values({ muelleOrgId: muelleId, ...parsed.data, createdBy: userId })
    .returning({ id: communityEvent.id });
  return { ok: true, data: row! };
}

export async function listUpcoming(userId: string, muelleId: string, now = new Date()) {
  await assertNetworkMember(userId, muelleId);
  return db
    .select()
    .from(communityEvent)
    .where(and(eq(communityEvent.muelleOrgId, muelleId), gte(communityEvent.startsAt, now)))
    .orderBy(asc(communityEvent.startsAt));
}
