// Apartado atómico (oficinas-digitales paso 42): concurrencia real con Promise.all contra el Supabase de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, seatBooking, venueMap, venueSeat, venueSession } from "@jotapuntoce/db/schema";
import { holdSeats, releaseExpired } from "@/server/seats/hold.ts";

const orgIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

const NOW = new Date("2030-01-05T18:00:00Z");
const min = (m: number) => new Date(NOW.getTime() + m * 60_000);

async function funcion(status: "borrador" | "a_la_venta" = "a_la_venta") {
  const [o] = await db.insert(organization).values({ name: "t-hold", slug: `t-hold-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const [map] = await db.insert(venueMap).values({ orgId: o.id, name: "Sala", kind: "teatro", layout: {} }).returning();
  const seats = await db
    .insert(venueSeat)
    .values(Array.from({ length: 11 }, (_, i) => ({ orgId: o.id, mapId: map!.id, label: `A${i + 1}`, x: i, y: 0, kind: "butaca" as const })))
    .returning();
  const [s] = await db.insert(venueSession).values({ orgId: o.id, mapId: map!.id, title: "F", startsAt: min(600), status, priceCents: 10000 }).returning();
  return { orgId: o.id, sessionId: s!.id, seat: seats.map((x) => x.id) };
}

const bookings = (sessionId: string) => db.select().from(seatBooking).where(eq(seatBooking.sessionId, sessionId));

describe("holdSeats", () => {
  it("WHEN dos apartados del mismo lugar corren a la vez THE SYSTEM SHALL dejar uno ok y el otro SEATS_TAKEN", async () => {
    const f = await funcion();
    const req = () => holdSeats({ sessionId: f.sessionId, seatIds: [f.seat[0]!], channel: "web", now: NOW });
    const results = await Promise.all([req(), req()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, error: { code: "SEATS_TAKEN" } });
  });

  it("WHEN [A1,A2] y [A2,A3] corren a la vez THE SYSTEM SHALL apartar todos los de uno y ninguno del otro", async () => {
    const f = await funcion();
    const [a1, a2, a3] = f.seat;
    const results = await Promise.all([
      holdSeats({ sessionId: f.sessionId, seatIds: [a1!, a2!], channel: "web", now: NOW }),
      holdSeats({ sessionId: f.sessionId, seatIds: [a2!, a3!], channel: "web", now: NOW }),
    ]);
    const winner = results.findIndex((r) => r.ok);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const held = (await bookings(f.sessionId)).filter((b) => b.status === "held").map((b) => b.seatId);
    expect(held.sort()).toEqual((winner === 0 ? [a1!, a2!] : [a2!, a3!]).sort());
  });

  it("WHEN un lugar tiene un apartado vencido THE SYSTEM SHALL apartarlo de nuevo con un hold_token nuevo", async () => {
    const f = await funcion();
    const first = await holdSeats({ sessionId: f.sessionId, seatIds: [f.seat[0]!], channel: "web", now: NOW });
    const again = await holdSeats({ sessionId: f.sessionId, seatIds: [f.seat[0]!], channel: "web", now: min(32) });
    if (!first.ok || !again.ok) throw new Error("apartado fallido");
    expect(again.data.holdToken).not.toBe(first.data.holdToken);
    expect((await bookings(f.sessionId)).map((b) => b.holdToken)).toEqual([again.data.holdToken]);
  });

  it("WHEN se piden 11 lugares o la función está en borrador THE SYSTEM SHALL devolver VALIDATION_ERROR sin escribir", async () => {
    const f = await funcion();
    expect(await holdSeats({ sessionId: f.sessionId, seatIds: f.seat, channel: "web", now: NOW })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    const b = await funcion("borrador");
    expect(await holdSeats({ sessionId: b.sessionId, seatIds: [b.seat[0]!], channel: "web", now: NOW })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect([...(await bookings(f.sessionId)), ...(await bookings(b.sessionId))]).toEqual([]);
  });
});

describe("releaseExpired", () => {
  it("WHEN corre THE SYSTEM SHALL liberar solo los apartados vencidos hace más de 10 minutos", async () => {
    const f = await funcion();
    await holdSeats({ sessionId: f.sessionId, seatIds: [f.seat[0]!], channel: "web", now: min(-50) }); // vence en -19
    await holdSeats({ sessionId: f.sessionId, seatIds: [f.seat[1]!], channel: "web", now: min(-36) }); // vence en -5
    await releaseExpired(NOW);
    const status = Object.fromEntries((await bookings(f.sessionId)).map((b) => [b.seatId, b.status]));
    expect(status).toEqual({ [f.seat[0]!]: "released", [f.seat[1]!]: "held" });
  });
});
