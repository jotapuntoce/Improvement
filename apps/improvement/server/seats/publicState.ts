// Estado público de una función — sin sesión: lo leen /butacas/[sessionId] y /api/butacas/[sessionId]/estado.
// Columnas explícitas: nunca nombre ni correo de compradores, hold_token ni org_id. Un lugar está `ocupado`
// si se vendió o tiene un apartado sin vencer.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { seatBooking, stripeAccount, venueSeat, venueSession } from "@jotapuntoce/db/schema";

export type PublicSeat = { id: string; label: string; x: number; y: number; kind: string; status: "libre" | "ocupado" };
export type PublicSeatState = { title: string; startsAt: string; priceCents: number; ventaEnLinea: boolean; seats: PublicSeat[] };

export async function loadPublicSeatState(sessionId: string, now: Date): Promise<PublicSeatState | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const [session] = await db
    .select({
      title: venueSession.title,
      startsAt: venueSession.startsAt,
      priceCents: venueSession.priceCents,
      status: venueSession.status,
      mapId: venueSession.mapId,
      accountId: stripeAccount.stripeAccountId,
      chargesEnabled: stripeAccount.chargesEnabled,
    })
    .from(venueSession)
    .leftJoin(stripeAccount, eq(stripeAccount.orgId, venueSession.orgId))
    .where(eq(venueSession.id, sessionId));
  if (!session || session.status !== "a_la_venta") return null;

  const rows = await db
    .select({
      id: venueSeat.id,
      label: venueSeat.label,
      x: venueSeat.x,
      y: venueSeat.y,
      kind: venueSeat.kind,
      booking: seatBooking.status,
      expiresAt: seatBooking.holdExpiresAt,
    })
    .from(venueSeat)
    .leftJoin(seatBooking, and(eq(seatBooking.seatId, venueSeat.id), eq(seatBooking.sessionId, sessionId)))
    .where(eq(venueSeat.mapId, session.mapId))
    .orderBy(asc(venueSeat.y), asc(venueSeat.x));

  return {
    title: session.title,
    startsAt: session.startsAt.toISOString(),
    priceCents: session.priceCents,
    ventaEnLinea: Boolean(session.accountId && session.chargesEnabled),
    seats: rows.map(({ booking, expiresAt, ...seat }) => ({
      ...seat,
      status: booking === "sold" || (booking === "held" && expiresAt !== null && expiresAt > now) ? "ocupado" : "libre",
    })),
  };
}
