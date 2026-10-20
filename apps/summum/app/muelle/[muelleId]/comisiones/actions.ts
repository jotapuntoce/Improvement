"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireDockOwnership } from "@/server/auth/guard.ts";
import { decideFeeChange, proposeFeeChange } from "@/server/fees/changes.ts";
import { errorCode } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

const proposeSchema = z.object({
  muelleId: z.string().uuid(),
  barcoOrgId: z.string().uuid().nullable(),
  chargeKind: z.enum(["venta_propia", "proyecto_summum"]),
  percent: z.string().trim().min(1).transform(Number).pipe(z.number().min(0).max(100)),
  fixed: z.string().trim().min(1).transform(Number).pipe(z.number().min(0)),
});
const idSchema = z.string().uuid();
const decideSchema = z.object({
  muelleId: z.string().uuid(),
  changeId: z.string().uuid(),
  decision: z.enum(["aprobado", "rechazado"]),
});

function bad(muelleId: unknown): never {
  const id = idSchema.safeParse(muelleId);
  if (!id.success) notFound();
  return redirect(`/muelle/${id.data}/comisiones?error=invalido`);
}

function done(muelleId: string, r: Result<unknown>): never {
  const base = `/muelle/${muelleId}/comisiones`;
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

export async function propose(formData: FormData) {
  const p = proposeSchema.safeParse({
    muelleId: formData.get("muelleId"),
    barcoOrgId: formData.get("barcoOrgId")?.toString() || null,
    chargeKind: formData.get("chargeKind"),
    percent: formData.get("percent") ?? undefined,
    fixed: formData.get("fixed") ?? undefined,
  });
  if (!p.success) return bad(formData.get("muelleId"));
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
  if (!p.success) return bad(formData.get("muelleId"));
  const { userId } = await requireDockOwnership(p.data.muelleId);
  done(p.data.muelleId, await decideFeeChange(userId, p.data.changeId, p.data.decision));
}
