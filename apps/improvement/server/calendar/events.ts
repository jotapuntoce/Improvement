// Agenda personal: membresía del org y siempre `user_id = userId`. Ni el dueño lee ni mueve la agenda de
// otro — la misma regla que la política RLS de agenda_rls.
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { bookingPage, CALENDAR_EVENT_KINDS, calendarEvent } from "@jotapuntoce/db/schema";
import { findMembership } from "../auth/guard.ts";
import { reschedule } from "./reschedule.ts";
import { weeklyHoursSchema } from "./availability.ts";

type Failure = { ok: false; error: { code: "NOT_FOUND" | "VALIDATION_ERROR" | "SLUG_TAKEN"; message: string } };
const notFound: Failure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };
const invalid = (message: string): Failure => ({ ok: false, error: { code: "VALIDATION_ERROR", message } });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos.";
const isUniqueViolation = (e: unknown) =>
  (e as { cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string })?.code === "23505";

export async function listMyEvents(userId: string, orgId: string, { from, to }: { from: Date; to: Date }) {
  if (!(await findMembership(userId, orgId))) return notFound;
  const data = await db
    .select()
    .from(calendarEvent)
    .where(and(eq(calendarEvent.orgId, orgId), eq(calendarEvent.userId, userId), gte(calendarEvent.startsAt, from), lt(calendarEvent.startsAt, to)))
    .orderBy(calendarEvent.startsAt);
  return { ok: true as const, data };
}

const eventSchema = z
  .object({
    kind: z.enum(CALENDAR_EVENT_KINDS),
    title: z.string().trim().min(1, "El evento lleva título.").max(200),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((e) => e.endsAt > e.startsAt, "El fin va después del inicio.");

export async function createEvent(userId: string, orgId: string, input: unknown) {
  if (!(await findMembership(userId, orgId))) return notFound;
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const [row] = await db.insert(calendarEvent).values({ ...parsed.data, orgId, userId }).returning();
  return { ok: true as const, data: row! };
}

export async function markDone(userId: string, orgId: string, eventId: string) {
  if (!(await findMembership(userId, orgId))) return notFound;
  if (!z.uuid().safeParse(eventId).success) return notFound;
  const [row] = await db
    .update(calendarEvent)
    .set({ status: "hecho", updatedAt: new Date() })
    .where(and(eq(calendarEvent.id, eventId), eq(calendarEvent.orgId, orgId), eq(calendarEvent.userId, userId)))
    .returning({ id: calendarEvent.id });
  return row ? { ok: true as const, data: row } : notFound;
}

/** Mueve las tareas vencidas del usuario al siguiente hueco libre; sus demás eventos cuentan como ocupados. */
export async function rescheduleMine(userId: string, orgId: string, now: Date) {
  if (!(await findMembership(userId, orgId))) return notFound;
  const events = await db
    .select()
    .from(calendarEvent)
    .where(and(eq(calendarEvent.orgId, orgId), eq(calendarEvent.userId, userId), gte(calendarEvent.endsAt, new Date(now.getTime() - 30 * 86_400_000))));
  const isDue = (e: (typeof events)[number]) => e.kind === "tarea" && e.status === "pendiente" && e.endsAt <= now;
  const { moves, unplaced } = reschedule({ tasks: events, busy: events.filter((e) => !isDue(e)), now });
  for (const m of moves) {
    await db
      .update(calendarEvent)
      .set({ startsAt: m.startsAt, endsAt: m.endsAt, updatedAt: new Date() })
      .where(and(eq(calendarEvent.id, m.id), eq(calendarEvent.userId, userId)));
  }
  return { ok: true as const, data: { moved: moves.length, unplaced } };
}

const bookingPageSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{3,40}$/, "El enlace usa minúsculas, números y guiones (3 a 40)."),
  title: z.string().trim().min(1, "La página lleva título.").max(120),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  weeklyHours: weeklyHoursSchema,
  active: z.boolean().default(true),
});

/** Una página de reservas por usuario y org: la crea o la actualiza. */
export async function upsertBookingPage(userId: string, orgId: string, input: unknown) {
  if (!(await findMembership(userId, orgId))) return notFound;
  const parsed = bookingPageSchema.safeParse(input);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  try {
    const [existing] = await db
      .select({ id: bookingPage.id })
      .from(bookingPage)
      .where(and(eq(bookingPage.orgId, orgId), eq(bookingPage.userId, userId)))
      .limit(1);
    const [row] = existing
      ? await db.update(bookingPage).set({ ...parsed.data, updatedAt: new Date() }).where(eq(bookingPage.id, existing.id)).returning()
      : await db.insert(bookingPage).values({ ...parsed.data, orgId, userId }).returning();
    return { ok: true as const, data: row! };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false as const, error: { code: "SLUG_TAKEN" as const, message: "Ese enlace ya está en uso." } };
    throw e;
  }
}
