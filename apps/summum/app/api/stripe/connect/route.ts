// Eventos de cuentas conectadas (account.updated, payment_intent.succeeded de cobros directos).
import { requireEnv } from "@/lib/env.ts";
import { handleStripeEvent, verifyEvent } from "@/server/stripe/webhook.ts";

export async function POST(req: Request) {
  const event = verifyEvent(await req.text(), req.headers.get("stripe-signature"), requireEnv("STRIPE_CONNECT_WEBHOOK_SECRET"));
  if (!event) return new Response("firma inválida", { status: 400 });
  await handleStripeEvent(event);
  return new Response("ok");
}
