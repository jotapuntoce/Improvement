"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireDockOwnership } from "@/server/auth/guard.ts";
import { decideFeeChange, proposeFeeChange } from "@/server/fees/changes.ts";
import type { Result } from "@/server/result.ts";

const proposeSchema = z.object({
  muelleId: z.string().uuid(),
  barcoOrgId: z.string().uuid().nullable(),
  chargeKind: z.enum(["venta_propia", "proyecto_summum"]),
  percent: z.coerce.number().min(0).max(100),
  fixed: z.coerce.number().min(0),
});
const decideSchema = z.object({
  muelleId: z.string().uuid(),
  changeId: z.string().uuid(),
  decision: z.enum(["aprobado", "rechazado"]),
});

function done(muelleId: string, r: Result<unknown>): never {
  const base = `/muelle/${muelleId}/comisiones`;
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${encodeURIComponent(r.error)}`);
}

export async function propose(formData: FormData) {
  const p = proposeSchema.safeParse({
    muelleId: formData.get("muelleId"),
    barcoOrgId: formData.get("barcoOrgId")?.toString() || null,
    chargeKind: formData.get("chargeKind"),
    percent: formData.get("percent"),
    fixed: formData.get("fixed") || 0,
  });
  if (!p.success) return redirect("/");
  const { userId } = await requireDockOwnership(p.data.muelleId);
  const r = await proposeFeeChange(userId, p.data.muelleId, {
    barcoOrgId: p.data.barcoOrgId,
    chargeKind: p.data.chargeKind,
    percentBps: Math.round(p.data.percent * 100),
    fixedCents: Math.round(p.data.fixed * 100),
  });
  done(p.data.muelleId, r);
}

export async function decide(formData: FormData) {
  const p = decideSchema.safeParse({
    muelleId: formData.get("muelleId"),
    changeId: formData.get("changeId"),
    decision: formData.get("decision"),
  });
  if (!p.success) return redirect("/");
  const { userId } = await requireDockOwnership(p.data.muelleId);
  done(p.data.muelleId, await decideFeeChange(userId, p.data.changeId, p.data.decision));
}
