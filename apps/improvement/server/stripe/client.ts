// La única instancia de Stripe de Improvement (cobro directo de butacas en la cuenta conectada del org).
// Sin apiVersion explícita: usa la que fija el SDK 23.0.0, igual que apps/summum (que no se importa ni se toca).
import Stripe from "stripe";
import { requireEnv } from "../../lib/env.ts";

/** Lo que el código de butacas usa de Stripe; las pruebas inyectan uno falso. */
export type StripeLike = Pick<Stripe, "checkout" | "webhooks">;

let instance: Stripe | null = null;

export function getStripe(): Stripe {
  instance ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return instance;
}
