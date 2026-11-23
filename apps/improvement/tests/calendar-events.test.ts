// Agenda personal contra el Supabase de desarrollo + disponibilidad pura.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { calendarEvent, membership, organization, profile } from "@jotapuntoce/db/schema";
import { availableSlots } from "@/server/calendar/availability.ts";
import { createEvent, listMyEvents, markDone, rescheduleMine, upsertBookingPage } from "@/server/calendar/events.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-agenda-ev", slug: `t-agenda-ev-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const ids = { owner: crypto.randomUUID(), empleado: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  await db.insert(membership).values([
    { userId: ids.owner, orgId: o.id, role: "owner", acceptedAt: new Date() },
    { userId: ids.empleado, orgId: o.id, role: "employee", acceptedAt: new Date() },
  ]);
  return { orgId: o.id, ...ids };
}

describe("availableSlots", () => {
  it("WHEN el miércoles 09:00–11:00, 60 min y ocupado 16:00–17:00Z THE SYSTEM SHALL devolver solo 15:00Z", () => {
    const slots = availableSlots({
      date: "2026-11-18",
      weeklyHours: { "3": [["09:00", "11:00"]] },
      durationMinutes: 60,
      busy: [{ startsAt: new Date("2026-11-18T16:00:00Z"), endsAt: new Date("2026-11-18T17:00:00Z") }],
      now: new Date("2026-11-17T12:00:00Z"),
    });
    expect(slots).toEqual(["2026-11-18T15:00:00.000Z"]);
  });
});

describe("agenda personal", () => {
  it("WHEN el usuario reprograma su tarea vencida THE SYSTEM SHALL escribir el nuevo horario; el dueño no la ve ni la mueve", async () => {
    const { orgId, owner, empleado } = await org();
    const now = new Date("2026-11-18T16:10:00Z");
    const created = await createEvent(empleado, orgId, { kind: "tarea", title: "Llamar", startsAt: "2026-11-18T15:00:00Z", endsAt: "2026-11-18T15:45:00Z" });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.data.id;

    const ownerView = await listMyEvents(owner, orgId, { from: new Date("2026-11-18T00:00:00Z"), to: new Date("2026-11-20T00:00:00Z") });
    expect(ownerView.ok && ownerView.data).toEqual([]);
    expect(await rescheduleMine(owner, orgId, now)).toEqual({ ok: true, data: { moved: 0, unplaced: [] } });
    expect(await markDone(owner, orgId, id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    expect(await rescheduleMine(empleado, orgId, now)).toEqual({ ok: true, data: { moved: 1, unplaced: [] } });
    const [row] = await db.select().from(calendarEvent).where(eq(calendarEvent.id, id));
    expect(row?.startsAt.toISOString()).toBe("2026-11-18T16:15:00.000Z");
    expect(row?.status).toBe("pendiente");
  });

  it("WHEN dos usuarios guardan el mismo slug THE SYSTEM SHALL devolver SLUG_TAKEN al segundo", async () => {
    const { orgId, owner, empleado } = await org();
    const slug = `t-${crypto.randomUUID().slice(0, 8)}`;
    const input = { slug, title: "Citas", durationMinutes: 30, weeklyHours: { "1": [["09:00", "13:00"]] } };
    expect(await upsertBookingPage(owner, orgId, input)).toMatchObject({ ok: true });
    expect(await upsertBookingPage(empleado, orgId, input)).toMatchObject({ ok: false, error: { code: "SLUG_TAKEN" } });
  });

  it("WHEN createEvent recibe un fin anterior al inicio THE SYSTEM SHALL devolver VALIDATION_ERROR sin escribir", async () => {
    const { orgId, empleado } = await org();
    const r = await createEvent(empleado, orgId, { kind: "evento", title: "Mal", startsAt: "2026-11-18T16:00:00Z", endsAt: "2026-11-18T15:00:00Z" });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await db.select().from(calendarEvent).where(eq(calendarEvent.orgId, orgId))).toEqual([]);
  });
});
