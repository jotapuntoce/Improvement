"use server";

import { redirect } from "next/navigation";
import { env, requireEnv } from "@/lib/env.ts";
import { crearCobroDiagnostico } from "@/server/diagnostico/checkout.ts";
import { errorCode } from "@/server/error-codes.ts";
import { getStripe } from "@/server/stripe/client.ts";

export async function solicitarDiagnostico(form: FormData) {
  if (!env.STRIPE_SECRET_KEY) redirect("/diagnostico?error=cobro-inactivo#solicitar");
  const r = await crearCobroDiagnostico(Object.fromEntries(form), {
    stripe: getStripe(),
    baseUrl: requireEnv("NEXT_PUBLIC_SUMMUM_URL"),
  });
  redirect(r.ok ? r.data.url : `/diagnostico?error=${errorCode(r.error)}#solicitar`);
}
