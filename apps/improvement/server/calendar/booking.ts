// Reserva pública: no corre en nombre de nadie y solo la llama app/agenda/[slug]/page.tsx. Lee columnas
// explícitas y nunca devuelve user_id, el correo del dueño ni ids internos. La doble reserva la decide la
// base (uq_booking_page_slot); aquí solo se traduce a SLOT_TAKEN.
import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { booking, bookingPage, calendarEvent } from "@jotapuntoce/db/schema";
import { availableSlots, weeklyHoursSchema } from "./availability.ts";

type Failure = { ok: false; error: { code: "NOT_FOUND" | "VALIDATION_ERROR" | "SLOT_TAKEN"; message: string } };
const notFound: Failure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };
const invalid = (message: string): Failure => ({ ok: false, error: { code: "VALIDATION_ERROR", message } });
const slotTaken: Failure = { ok: false, error: { code: "SLOT_TAKEN", message: "Ese horario ya no está disponible." } };
// El único unique que puede chocar aquí es uq_booking_page_slot (cancel_token es aleatorio de 192 bits).
const isSlotViolation = (e: unknown) =>
  (e as { cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string })?.code === "23505";
const DAY = 86_400_000;

async function activePage(slug: string) {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const [page] = await db
    .select({
      id: bookingPage.id,
      orgId: bookingPage.orgId,
      userId: bookingPage.userId,
      title: bookingPage.title,
      durationMinutes: bookingPage.durationMinutes,
      weeklyHours: bookingPage.weeklyHours,
    })
    .from(bookingPage)
    .where(and(eq(bookingPage.slug, slug), eq(bookingPage.active, true)));
  return page ?? null;
}

type Page = NonNullable<Awaited<ReturnType<typeof activePage>>>;

// Ocupados del día (con un día de margen a cada lado por el desfase horario): agenda del dueño + reservas.
async function slotsFor(page: Page, date: string, now: Date) {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(midnight)) return [];
  const from = new Date(midnight - DAY);
  const to = new Date(midnight + 2 * DAY);
  const [events, bookings] = await Promise.all([
    db
      .select({ startsAt: calendarEvent.startsAt, endsAt: calendarEvent.endsAt })
      .from(calendarEvent)
      .where(and(eq(calendarEvent.userId, page.userId), lt(calendarEvent.startsAt, to), gt(calendarEvent.endsAt, from))),
    db
      .select({ startsAt: booking.startsAt, endsAt: booking.endsAt })
      .from(booking)
      .where(and(eq(booking.bookingPageId, page.id), eq(booking.status, "confirmada"), lt(booking.startsAt, to), gt(booking.endsAt, from))),
  ]);
  const hours = weeklyHoursSchema.safeParse(page.weeklyHours);
  if (!hours.success) return [];
  return availableSlots({ date, weeklyHours: hours.data, durationMinutes: page.durationMinutes, busy: [...events, ...bookings], now });
}

export async function loadPublicBookingPage(slug: string, date: string, now: Date) {
  const page = await activePage(slug);
  if (!page) return null;
  return { title: page.title, durationMinutes: page.durationMinutes, slots: await slotsFor(page, date, now) };
}

const bookingSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  guestName: z.string().trim().min(1, "Escribe tu nombre.").max(80),
  guestEmail: z.email("Escribe un correo válido."),
});

export async function createBooking(slug: string, input: unknown, now: Date) {
  const page = await activePage(slug);
  if (!page) return notFound;
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const startsAt = new Date(parsed.data.startsAt);
  // El día local (UTC-6 fijo, ver availability.ts) del horario pedido.
  const date = new Date(startsAt.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
  const slots = await slotsFor(page, date, now);
  if (!slots.includes(startsAt.toISOString())) return invalid("Ese horario no está disponible.");
  const endsAt = new Date(startsAt.getTime() + page.durationMinutes * 60_000);
  const cancelToken = randomBytes(24).toString("base64url");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(booking).values({
        orgId: page.orgId,
        bookingPageId: page.id,
        startsAt,
        endsAt,
        guestName: parsed.data.guestName,
        guestEmail: parsed.data.guestEmail,
        cancelToken,
      });
      await tx.insert(calendarEvent).values({
        orgId: page.orgId,
        userId: page.userId,
        title: `Reserva: ${parsed.data.guestName}`.slice(0, 200),
        startsAt,
        endsAt,
        kind: "evento",
        source: "reserva",
      });
    });
  } catch (e) {
    if (isSlotViolation(e)) return slotTaken;
    throw e;
  }
  return { ok: true as const, data: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), cancelToken } };
}

export async function cancelBooking(cancelToken: string) {
  if (!cancelToken || cancelToken.length > 64) return notFound;
  return db.transaction(async (tx) => {
    const [b] = await tx
      .update(booking)
      .set({ status: "cancelada" })
      .where(and(eq(booking.cancelToken, cancelToken), eq(booking.status, "confirmada")))
      .returning({ bookingPageId: booking.bookingPageId, startsAt: booking.startsAt, endsAt: booking.endsAt });
    if (!b) return notFound;
    const [page] = await tx.select({ userId: bookingPage.userId }).from(bookingPage).where(eq(bookingPage.id, b.bookingPageId));
    if (page) {
      await tx
        .delete(calendarEvent)
        .where(
          and(
            eq(calendarEvent.userId, page.userId),
            eq(calendarEvent.source, "reserva"),
            eq(calendarEvent.startsAt, b.startsAt),
            eq(calendarEvent.endsAt, b.endsAt),
          ),
        );
    }
    return { ok: true as const, data: null };
  });
}
