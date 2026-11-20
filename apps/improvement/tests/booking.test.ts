// Reserva pública contra el Supabase de desarrollo: carrera de dos visitantes, evento en la agenda del dueño
// y horario fuera de disponibilidad.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { booking, bookingPage, calendarEvent, membership, organization, profile } from "@jotapuntoce/db/schema";
import { cancelBooking, createBooking, loadPublicBookingPage } from "@/server/calendar/booking.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

// Miércoles 2030-01-09, 09:00–11:00 local (UTC-6) → 15:00Z y 16:00Z con citas de 60 min.
const NOW = new Date("2030-01-08T12:00:00Z");
const SLOT = "2030-01-09T15:00:00.000Z";

async function page() {
  const [o] = await db.insert(organization).values({ name: "t-reserva", slug: `t-reserva-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
  profileIds.push(userId);
  await db.insert(membership).values({ userId, orgId: o.id, role: "owner", acceptedAt: new Date() });
  const slug = `t-${crypto.randomUUID().slice(0, 8)}`;
  const [p] = await db
    .insert(bookingPage)
    .values({ orgId: o.id, userId, slug, title: "Citas", durationMinutes: 60, weeklyHours: { "3": [["09:00", "11:00"]] } })
    .returning();
  return { orgId: o.id, userId, slug, pageId: p!.id };
}

const guest = (name: string) => ({ startsAt: SLOT, guestName: name, guestEmail: `${name.toLowerCase()}@example.com` });

describe("reserva pública", () => {
  it("WHEN dos visitantes reservan el mismo horario a la vez THE SYSTEM SHALL confirmar una y devolver SLOT_TAKEN a la otra", async () => {
    const { slug, pageId } = await page();
    const results = await Promise.all([createBooking(slug, guest("Ana"), NOW), createBooking(slug, guest("Beto"), NOW)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, error: { code: "SLOT_TAKEN" } });
    expect(await db.select().from(booking).where(eq(booking.bookingPageId, pageId))).toHaveLength(1);
  });

  it("WHEN un visitante reserva THE SYSTEM SHALL crear un evento reserva en la agenda del dueño y quitar el horario", async () => {
    const { slug, userId } = await page();
    const r = await createBooking(slug, guest("Ana"), NOW);
    expect(r).toMatchObject({ ok: true, data: { startsAt: SLOT } });
    const events = await db.select().from(calendarEvent).where(and(eq(calendarEvent.userId, userId), eq(calendarEvent.source, "reserva")));
    expect(events.map((e) => [e.kind, e.startsAt.toISOString()])).toEqual([["evento", SLOT]]);
    expect(await loadPublicBookingPage(slug, "2030-01-09", NOW)).toEqual({ title: "Citas", durationMinutes: 60, slots: ["2030-01-09T16:00:00.000Z"] });

    if (!r.ok) throw new Error("reserva fallida");
    expect(await cancelBooking(r.data.cancelToken)).toEqual({ ok: true, data: null });
    expect(await db.select().from(calendarEvent).where(eq(calendarEvent.userId, userId))).toEqual([]);
  });

  it("WHEN se pide un horario fuera de disponibilidad THE SYSTEM SHALL devolver VALIDATION_ERROR sin escribir", async () => {
    const { slug, pageId } = await page();
    const r = await createBooking(slug, { ...guest("Ana"), startsAt: "2030-01-09T20:00:00.000Z" }, NOW);
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await db.select().from(booking).where(eq(booking.bookingPageId, pageId))).toEqual([]);
  });
});
