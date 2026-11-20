// Taquilla: vender en el mostrador y ver el mapa de una función con el estado de cada lugar. Exige la
// sección `butacas` = empresa (el dueño siempre); si no, NOT_FOUND. La venta pasa por holdSeats (el único
// que escribe `held`) y, con el mismo token, queda `sold` en la misma llamada.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { seatBooking, venueMap, venueSeat, venueSession } from "@jotapuntoce/db/schema";
import { holdSeats } from "./hold.ts";
import { seatsInvalid } from "./layouts.ts";
import { seatsAccess, seatsNotFound } from "./venues.ts";

export type SeatState = "libre" | "apartado" | "vendido";

export async function sellAtBox(userId: string, orgId: string, input: { sessionId: string; seatIds: string[]; buyerName?: string }) {
  if (!(await seatsAccess(userId, orgId)) || !z.uuid().safeParse(input.sessionId).success) return seatsNotFound;
  const [session] = await db
    .select({ id: venueSession.id })
    .from(venueSession)
    .where(and(eq(venueSession.id, input.sessionId), eq(venueSession.orgId, orgId)));
  if (!session) return seatsNotFound;
  const buyerName = input.buyerName?.trim().slice(0, 80) || null;

  const now = new Date();
  const hold = await holdSeats({ sessionId: input.sessionId, seatIds: input.seatIds, channel: "taquilla", now });
  if (!hold.ok) return hold;
  const sold = await db
    .update(seatBooking)
    .set({ status: "sold", buyerName, updatedAt: now })
    .where(and(eq(seatBooking.holdToken, hold.data.holdToken), eq(seatBooking.status, "held")))
    .returning({ seatId: seatBooking.seatId });
  return { ok: true as const, data: { sold: sold.length } };
}

export async function listVenueMaps(userId: string, orgId: string) {
  if (!(await seatsAccess(userId, orgId))) return seatsNotFound;
  const rows = await db
    .select({ id: venueMap.id, name: venueMap.name, kind: venueMap.kind })
    .from(venueMap)
    .where(eq(venueMap.orgId, orgId))
    .orderBy(asc(venueMap.name));
  return { ok: true as const, data: rows };
}

export async function loadSeatMap(userId: string, orgId: string, sessionId: string) {
  if (!(await seatsAccess(userId, orgId)) || !z.uuid().safeParse(sessionId).success) return seatsNotFound;
  const [session] = await db
    .select({ id: venueSession.id, title: venueSession.title, startsAt: venueSession.startsAt, status: venueSession.status, mapId: venueSession.mapId })
    .from(venueSession)
    .where(and(eq(venueSession.id, sessionId), eq(venueSession.orgId, orgId)));
  if (!session) return seatsNotFound;

  const now = Date.now();
  const rows = await db
    .select({
      id: venueSeat.id,
      label: venueSeat.label,
      x: venueSeat.x,
      y: venueSeat.y,
      kind: venueSeat.kind,
      capacity: venueSeat.capacity,
      booking: seatBooking.status,
      expiresAt: seatBooking.holdExpiresAt,
    })
    .from(venueSeat)
    .leftJoin(seatBooking, and(eq(seatBooking.seatId, venueSeat.id), eq(seatBooking.sessionId, sessionId)))
    .where(eq(venueSeat.mapId, session.mapId))
    .orderBy(asc(venueSeat.y), asc(venueSeat.x));
  const state = (r: (typeof rows)[number]): SeatState =>
    r.booking === "sold" ? "vendido" : r.booking === "held" && r.expiresAt && r.expiresAt.getTime() > now ? "apartado" : "libre";
  if (!rows.length) return seatsInvalid("El mapa no tiene lugares.");
  return {
    ok: true as const,
    data: { session, seats: rows.map((r) => ({ id: r.id, label: r.label, x: r.x, y: r.y, kind: r.kind, capacity: r.capacity, status: state(r) })) },
  };
}
