// Check-in semanal y 1-a-1 (blueprint summum-improvement, E5-T2). Base NOM-035: el check-in es un dato
// personal; lo ven la persona y el dueño, nadie más. La semana es weekStart() del scorecard, nunca otra.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { checkin, membership, oneOnOne } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";
import { weekStart } from "../direccion/scorecard/week.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

const isUuid = (id: unknown): id is string => z.uuid().safeParse(id).success;

const checkinSchema = z.object({
  mood: z.coerce.number().int().min(1, "Elige del 1 al 5.").max(5, "Elige del 1 al 5."),
  note: z.string().trim().max(500).nullable().default(null),
});

const oneOnOneSchema = z.object({
  employeeId: z.uuid(),
  heldOn: z.iso.date(),
  sharedNotes: z.string().trim().max(4000).default(""),
});

async function isMember(orgId: string, profileId: string) {
  const rows = await db
    .select({ id: membership.userId })
    .from(membership)
    .where(and(eq(membership.orgId, orgId), eq(membership.userId, profileId)));
  return rows.length > 0;
}

/** Uno por semana: el segundo de la misma semana reemplaza al primero. */
export async function submitCheckin(userId: string, orgId: string, input: unknown, now = new Date()): Promise<Result<{ weekStart: string }>> {
  await assertMembership(userId, orgId);
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const week = weekStart(now);
  await db
    .insert(checkin)
    .values({ orgId, profileId: userId, weekStart: week, ...parsed.data })
    .onConflictDoUpdate({
      target: [checkin.orgId, checkin.profileId, checkin.weekStart],
      set: { ...parsed.data, updatedAt: new Date() },
    });
  return { ok: true, data: { weekStart: week } };
}

export async function myCheckins(userId: string, orgId: string) {
  await assertMembership(userId, orgId);
  return db
    .select()
    .from(checkin)
    .where(and(eq(checkin.orgId, orgId), eq(checkin.profileId, userId)))
    .orderBy(desc(checkin.weekStart));
}

export async function checkinsFor(userId: string, orgId: string, employeeId: unknown): Promise<Result<(typeof checkin.$inferSelect)[]>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño ve los check-ins del equipo.", "FORBIDDEN");
  if (!isUuid(employeeId) || !(await isMember(orgId, employeeId))) return fail("Esa persona no es parte de esta empresa.", "NOT_FOUND");
  const rows = await db
    .select()
    .from(checkin)
    .where(and(eq(checkin.orgId, orgId), eq(checkin.profileId, employeeId)))
    .orderBy(desc(checkin.weekStart));
  return { ok: true, data: rows };
}

export async function recordOneOnOne(userId: string, orgId: string, input: unknown): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño registra los 1-a-1.", "FORBIDDEN");
  const parsed = oneOnOneSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  if (!(await isMember(orgId, parsed.data.employeeId))) return fail("Esa persona no es parte de esta empresa.", "NOT_FOUND");
  const [row] = await db
    .insert(oneOnOne)
    .values({ orgId, ...parsed.data, heldBy: userId })
    .returning({ id: oneOnOne.id });
  return { ok: true, data: row! };
}

export async function myOneOnOnes(userId: string, orgId: string) {
  await assertMembership(userId, orgId);
  return db
    .select()
    .from(oneOnOne)
    .where(and(eq(oneOnOne.orgId, orgId), eq(oneOnOne.employeeId, userId)))
    .orderBy(desc(oneOnOne.heldOn));
}

export async function oneOnOnesFor(userId: string, orgId: string, employeeId: unknown): Promise<Result<(typeof oneOnOne.$inferSelect)[]>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño ve los 1-a-1 del equipo.", "FORBIDDEN");
  if (!isUuid(employeeId)) return fail("Esa persona no es parte de esta empresa.", "NOT_FOUND");
  const rows = await db
    .select()
    .from(oneOnOne)
    .where(and(eq(oneOnOne.orgId, orgId), eq(oneOnOne.employeeId, employeeId)))
    .orderBy(desc(oneOnOne.heldOn));
  return { ok: true, data: rows };
}
