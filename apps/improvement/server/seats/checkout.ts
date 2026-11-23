// Checkout de butacas — flujo público, sin usuario: solo lo llama /api/butacas/[sessionId]/apartar.
// Cargo DIRECTO en la cuenta conectada del org ({ stripeAccount }), sin comisión de Jotapuntoce. Sin
// charges_enabled la función se vende solo en taquilla. La sesión de Checkout vence en el mismo instante
// que el apartado; si Stripe falla, el apartado se suelta.
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { seatBooking, stripeAccount, venueSeat, venueSession } from "@jotapuntoce/db/schema";
import { requireEnv } from "../../lib/env.ts";
import { getStripe, type StripeLike } from "../stripe/client.ts";
import { holdSeats, releaseHold, type HoldFailure } from "./hold.ts";

type CheckoutFailure =
  | HoldFailure
  | { ok: false; error: { code: "TAQUILLA_ONLY" | "PAYMENT_UNAVAILABLE"; message: string } };

const taquillaOnly = { ok: false as const, error: { code: "TAQUILLA_ONLY" as const, message: "Esta función se vende solo en taquilla." } };
const paymentUnavailable = {
  ok: false as const,
  error: { code: "PAYMENT_UNAVAILABLE" as const, message: "El pago no está disponible en este momento. Intenta de nuevo." },
};

export async function startSeatCheckout(
  input: { sessionId: string; seatIds: string[]; buyer: { name: string; email: string }; now: Date },
  deps: { stripe?: StripeLike } = {},
): Promise<{ ok: true; data: { url: string } } | CheckoutFailure> {
  const [session] = await db
    .select({ title: venueSession.title, accountId: stripeAccount.stripeAccountId, chargesEnabled: stripeAccount.chargesEnabled })
    .from(venueSession)
    .leftJoin(stripeAccount, eq(stripeAccount.orgId, venueSession.orgId))
    .where(eq(venueSession.id, input.sessionId));
  if (session && (!session.accountId || !session.chargesEnabled)) return taquillaOnly;
  const base = `${requireEnv("NEXT_PUBLIC_APP_URL")}/butacas/${input.sessionId}`;

  // holdSeats valida el resto (función a la venta, 1-10 lugares del mapa) y devuelve VALIDATION_ERROR.
  const hold = await holdSeats({ sessionId: input.sessionId, seatIds: input.seatIds, channel: "web", now: input.now });
  if (!hold.ok) return hold;
  const { holdToken, expiresAt } = hold.data;

  try {
    const lines = await db
      .select({ label: venueSeat.label, priceCents: seatBooking.priceCents })
      .from(seatBooking)
      .innerJoin(venueSeat, eq(venueSeat.id, seatBooking.seatId))
      .where(eq(seatBooking.holdToken, holdToken));
    const stripe = deps.stripe ?? getStripe();
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: lines.map((l) => ({
          quantity: 1,
          price_data: { currency: "mxn", unit_amount: l.priceCents, product_data: { name: `${session!.title} — ${l.label}` } },
        })),
        customer_email: input.buyer.email,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        // seat_count: el webhook vende todo el apartado o nada (un lugar re-apartado por otro no cuenta).
        metadata: { hold_token: holdToken, venue_session_id: input.sessionId, seat_count: String(lines.length), buyer_name: input.buyer.name },
        success_url: `${base}?pago=ok`,
        cancel_url: `${base}?pago=cancelado`,
      },
      { stripeAccount: session!.accountId! },
    );
    if (!checkout.url) throw new Error("Stripe no devolvió url de Checkout");
    await db
      .update(seatBooking)
      .set({ stripeCheckoutSessionId: checkout.id, buyerName: input.buyer.name, buyerEmail: input.buyer.email, updatedAt: input.now })
      .where(and(eq(seatBooking.holdToken, holdToken), eq(seatBooking.status, "held")));
    return { ok: true, data: { url: checkout.url } };
  } catch (e) {
    console.error("startSeatCheckout: Stripe falló, se suelta el apartado", e);
    await releaseHold(holdToken);
    return paymentUnavailable;
  }
}
