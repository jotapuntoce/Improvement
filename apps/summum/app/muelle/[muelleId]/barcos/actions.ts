"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireEnv } from "@/lib/env.ts";
import { requireDockOwnership } from "@/server/auth/guard.ts";
import { errorCode } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";
import { getStripe } from "@/server/stripe/client.ts";
import { activateMembership, createMembershipPlan } from "@/server/stripe/connect.ts";

const planSchema = z.object({
  muelleId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  price: z.string().trim().min(1).transform(Number).pipe(z.number().positive()),
});
const activateSchema = z.object({
  muelleId: z.string().uuid(),
  barcoId: z.string().uuid(),
  planId: z.string().uuid(),
});
const idSchema = z.string().uuid();

const deps = () => ({ stripe: getStripe(), baseUrl: requireEnv("NEXT_PUBLIC_SUMMUM_URL") });

function bad(muelleId: unknown, code: string): never {
  const id = idSchema.safeParse(muelleId);
  if (!id.success) notFound();
  return redirect(`/muelle/${id.data}/barcos?error=${code}`);
}

function done(muelleId: string, r: Result<unknown>): never {
  const base = `/muelle/${muelleId}/barcos`;
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

export async function createPlan(formData: FormData) {
  const p = planSchema.safeParse({ muelleId: formData.get("muelleId"), name: formData.get("name"), price: formData.get("price") ?? undefined });
  if (!p.success) return bad(formData.get("muelleId"), "nivel-invalido");
  const { userId } = await requireDockOwnership(p.data.muelleId);
  const r = await createMembershipPlan(userId, p.data.muelleId, { name: p.data.name, monthlyAmountCents: Math.round(p.data.price * 100) }, deps());
  done(p.data.muelleId, r);
}

export async function activate(formData: FormData) {
  const p = activateSchema.safeParse({ muelleId: formData.get("muelleId"), barcoId: formData.get("barcoId"), planId: formData.get("planId") });
  if (!p.success) return bad(formData.get("muelleId"), "invalido");
  const { userId } = await requireDockOwnership(p.data.muelleId);
  done(p.data.muelleId, await activateMembership(userId, p.data.muelleId, p.data.barcoId, p.data.planId, deps()));
}
