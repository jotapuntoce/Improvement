// Eventos de Stripe Connect para butacas — sin usuario: solo lo llama app/api/stripe/butacas después de
// constructEvent. Un pago vende todo su apartado o nada; si el apartado venció antes del pago (event.created)
// o algún lugar ya lo tomó otro comprador, se revierte y queda `seat_paid_after_expiry` para reembolso
// manual (no hay reembolsos automáticos).
import { and, eq, gt } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@jotapuntoce/db";
import { seatBooking, stripeAccount, venueSession } from "@jotapuntoce/db/schema";
import { releaseHold } from "./hold.ts";

class Mismatch extends Error {}

export async function handleSeatEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.expired") {
    const token = event.data.object.metadata?.hold_token;
    if (token) await releaseHold(token);
    return;
  }
  if (event.type !== "checkout.session.completed") return;

  const checkout = event.data.object;
  const token = checkout.metadata?.hold_token;
  const sessionId = checkout.metadata?.venue_session_id;
  const expected = Number(checkout.metadata?.seat_count);
  if (!token || !sessionId) return;

  const [owner] = await db
    .select({ accountId: stripeAccount.stripeAccountId })
    .from(venueSession)
    .innerJoin(stripeAccount, eq(stripeAccount.orgId, venueSession.orgId))
    .where(eq(venueSession.id, sessionId));
  if (!owner || !event.account || owner.accountId !== event.account) {
    console.warn("seat_webhook_account_mismatch", { checkoutSessionId: checkout.id, account: event.account ?? null });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const sold = await tx
        .update(seatBooking)
        .set({
          status: "sold",
          buyerName: checkout.customer_details?.name ?? checkout.metadata?.buyer_name ?? null,
          buyerEmail: checkout.customer_details?.email ?? checkout.customer_email ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(seatBooking.holdToken, token),
            eq(seatBooking.sessionId, sessionId),
            eq(seatBooking.status, "held"),
            gt(seatBooking.holdExpiresAt, new Date(event.created * 1000)),
          ),
        )
        .returning({ seatId: seatBooking.seatId });
      if (sold.length === 0 || sold.length !== expected) throw new Mismatch();
    });
  } catch (e) {
    if (!(e instanceof Mismatch)) throw e;
    console.warn("seat_paid_after_expiry", { checkoutSessionId: checkout.id, holdToken: token });
  }
}
