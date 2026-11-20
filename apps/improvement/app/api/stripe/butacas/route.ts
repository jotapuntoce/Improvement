// POST /api/stripe/butacas — endpoint de Connect propio de butacas, con su propio secreto
// (STRIPE_SEATS_WEBHOOK_SECRET). Cuerpo crudo para la firma; los webhooks de Summum no se tocan.
import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { handleSeatEvent } from "@/server/seats/webhook";
import { getStripe } from "@/server/stripe/client";

export async function POST(request: Request) {
  const raw = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, request.headers.get("stripe-signature") ?? "", requireEnv("STRIPE_SEATS_WEBHOOK_SECRET"));
  } catch {
    return NextResponse.json({ ok: false, error: { code: "BAD_SIGNATURE", message: "Firma inválida." } }, { status: 400 });
  }
  await handleSeatEvent(event);
  return NextResponse.json({ received: true });
}
