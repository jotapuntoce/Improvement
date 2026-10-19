// La única instancia de Stripe. Sin apiVersion explícita: usa la que fija el SDK 23.0.0.
import Stripe from "stripe";
import { requireEnv } from "@/lib/env.ts";

let instance: Stripe | null = null;

export function getStripe(): Stripe {
  instance ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return instance;
}
