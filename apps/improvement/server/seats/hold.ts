// Apartado de lugares — flujo público, sin usuario: lo llaman la ruta /api/butacas/[sessionId]/apartar, la
// taquilla (después de su guard) y el barrido de la tarea `butacas`. `holdSeats` es el ÚNICO que escribe
// `held`, y un apartado es todo o nada: un solo insert … on conflict do update para todos los lugares; si
// vuelven menos filas que lugares pedidos, se revierte entero. Los lugares van ordenados para que dos
// apartados que se cruzan tomen los candados en el mismo orden (sin deadlock).
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { SEAT_BOOKING_CHANNELS, seatBooking, venueSeat, venueSession } from "@jotapuntoce/db/schema";
import { seatsInvalid, type SeatsFailure } from "./layouts.ts";
import { firstIssue } from "../validation.ts";

export const HOLD_MINUTES = 31;
/** Gracia antes de liberar un apartado vencido: un webhook de pago tardío todavía lo encuentra. */
export const RELEASE_GRACE_MINUTES = 10;

export type HoldFailure = SeatsFailure | { ok: false; error: { code: "SEATS_TAKEN"; message: string } };
const seatsTaken = { ok: false as const, error: { code: "SEATS_TAKEN" as const, message: "Alguno de esos lugares ya no está disponible." } };

const holdSchema = z.object({
  sessionId: z.uuid(),
  seatIds: z.array(z.uuid()).min(1, "Elige al menos un lugar.").max(10, "Se apartan hasta 10 lugares a la vez."),
  channel: z.enum(SEAT_BOOKING_CHANNELS),
  now: z.date(),
});

class Taken extends Error {}

export async function holdSeats(input: {
  sessionId: string;
  seatIds: string[];
  channel: (typeof SEAT_BOOKING_CHANNELS)[number];
  now: Date;
}): Promise<{ ok: true; data: { holdToken: string; expiresAt: Date } } | HoldFailure> {
  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) return seatsInvalid(firstIssue(parsed.error));
  const { sessionId, channel, now } = parsed.data;
  const seatIds = [...new Set(parsed.data.seatIds)].sort();

  const [session] = await db
    .select({ orgId: venueSession.orgId, mapId: venueSession.mapId, status: venueSession.status, priceCents: venueSession.priceCents })
    .from(venueSession)
    .where(eq(venueSession.id, sessionId));
  if (!session || session.status !== "a_la_venta") return seatsInvalid("Esa función no está a la venta.");
  const seats = await db
    .select({ id: venueSeat.id })
    .from(venueSeat)
    .where(and(eq(venueSeat.mapId, session.mapId), inArray(venueSeat.id, seatIds)));
  if (seats.length !== seatIds.length) return seatsInvalid("Un lugar no es de esta función.");

  const holdToken = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .insert(seatBooking)
        .values(
          seatIds.map((seatId) => ({
            orgId: session.orgId,
            sessionId,
            seatId,
            status: "held" as const,
            holdToken,
            holdExpiresAt: expiresAt,
            priceCents: session.priceCents,
            channel,
          })),
        )
        .onConflictDoUpdate({
          target: [seatBooking.sessionId, seatBooking.seatId],
          set: {
            status: "held",
            holdToken: sql`excluded.hold_token`,
            holdExpiresAt: sql`excluded.hold_expires_at`,
            priceCents: sql`excluded.price_cents`,
            channel: sql`excluded.channel`,
            buyerName: null,
            buyerEmail: null,
            stripeCheckoutSessionId: null,
            updatedAt: now,
          },
          setWhere: or(eq(seatBooking.status, "released"), and(eq(seatBooking.status, "held"), lt(seatBooking.holdExpiresAt, now))),
        })
        .returning({ seatId: seatBooking.seatId });
      if (rows.length < seatIds.length) throw new Taken();
    });
  } catch (e) {
    if (e instanceof Taken) return seatsTaken;
    throw e;
  }
  return { ok: true, data: { holdToken, expiresAt } };
}

/** Suelta el apartado de ese token si sigue `held`; devuelve cuántos lugares liberó. */
export async function releaseHold(holdToken: string): Promise<number> {
  if (!z.uuid().safeParse(holdToken).success) return 0;
  const rows = await db
    .update(seatBooking)
    .set({ status: "released", updatedAt: new Date() })
    .where(and(eq(seatBooking.holdToken, holdToken), eq(seatBooking.status, "held")))
    .returning({ id: seatBooking.id });
  return rows.length;
}

/** Barrido: libera los `held` vencidos hace más de RELEASE_GRACE_MINUTES; devuelve cuántos. */
export async function releaseExpired(now: Date): Promise<number> {
  const rows = await db
    .update(seatBooking)
    .set({ status: "released", updatedAt: now })
    .where(and(eq(seatBooking.status, "held"), lt(seatBooking.holdExpiresAt, new Date(now.getTime() - RELEASE_GRACE_MINUTES * 60_000))))
    .returning({ id: seatBooking.id });
  return rows.length;
}
