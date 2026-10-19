"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireEnv } from "@/lib/env.ts";
import { requireBarcoOwnership } from "@/server/auth/guard.ts";
import { createSaleLink, startOnboarding } from "@/server/stripe/connect.ts";
import { getStripe } from "@/server/stripe/client.ts";

const orgSchema = z.object({ orgId: z.string().uuid() });
const saleSchema = orgSchema.extend({
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
});

const deps = () => ({ stripe: getStripe(), baseUrl: requireEnv("NEXT_PUBLIC_SUMMUM_URL") });
const fail = (orgId: string, error: string): never => redirect(`/barco/${orgId}?error=${encodeURIComponent(error)}`);

export async function connect(formData: FormData) {
  const p = orgSchema.safeParse({ orgId: formData.get("orgId") });
  if (!p.success) return redirect("/");
  const { userId } = await requireBarcoOwnership(p.data.orgId);
  const r = await startOnboarding(userId, p.data.orgId, deps());
  if (!r.ok) return fail(p.data.orgId, r.error);
  redirect(r.data.url);
}

export async function sale(formData: FormData) {
  const org = orgSchema.safeParse({ orgId: formData.get("orgId") });
  if (!org.success) return redirect("/");
  const p = saleSchema.safeParse({
    orgId: org.data.orgId,
    amountCents: Math.round(Number(formData.get("amount")) * 100),
    description: formData.get("description"),
  });
  if (!p.success) return fail(org.data.orgId, "Monto positivo y una descripción.");
  const { userId } = await requireBarcoOwnership(p.data.orgId);
  const r = await createSaleLink(userId, p.data.orgId, { amountCents: p.data.amountCents, description: p.data.description }, deps());
  if (!r.ok) return fail(p.data.orgId, r.error);
  redirect(r.data.url);
}
