// Los parámetros del Sello de un muelle: ajustes (mínimo, días de gracia, severidad para proponer),
// requisitos y las marcas de los requisitos manuales. Todo con assertDockOwner del muelle de la fila;
// ningún requisito ni mínimo vive en código.
import { and, asc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  muelleSettings,
  organization,
  SEAL_SOURCES,
  sealRequirement,
  sealRequirementResult,
} from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";
import type { Result } from "../result.ts";

const INVALIDO = "Revisa los datos del formulario.";

export type SealSettingsRow = typeof muelleSettings.$inferSelect;
export type SealRequirementRow = typeof sealRequirement.$inferSelect;
export type SealSubject = { kind: "barco"; orgId: string } | { kind: "afiliada"; affiliateId: string };

const settingsSchema = z.object({
  minSealScore: z.number().int().min(0).nullable(),
  graceDays: z.number().int().min(1).max(365),
  proposalMinSeverity: z.number().int().min(1).max(3),
});

export async function upsertSettings(userId: string, muelleId: string, input: unknown): Promise<Result<SealSettingsRow>> {
  await assertDockOwner(userId, muelleId);
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [row] = await db
    .insert(muelleSettings)
    .values({ muelleOrgId: muelleId, ...parsed.data })
    .onConflictDoUpdate({ target: muelleSettings.muelleOrgId, set: { ...parsed.data, updatedAt: new Date() } })
    .returning();
  if (!row) return { ok: false, error: "No se pudo completar. Inténtalo de nuevo." };
  return { ok: true, data: row };
}

export async function getSettings(userId: string, muelleId: string): Promise<SealSettingsRow | null> {
  await assertDockOwner(userId, muelleId);
  const [row] = await db.select().from(muelleSettings).where(eq(muelleSettings.muelleOrgId, muelleId));
  return row ?? null;
}

const kpiConfig = z.object({
  source: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  op: z.enum(["gte", "lte"]),
  threshold: z.number().finite(),
});

const requirementSchema = z.object({
  code: z.string().regex(/^[a-z0-9-]{2,40}$/),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).default(""),
  points: z.number().int().min(1).max(100),
  source: z.enum(SEAL_SOURCES),
  config: z.unknown(),
});

export async function createRequirement(userId: string, muelleId: string, input: unknown): Promise<Result<SealRequirementRow>> {
  await assertDockOwner(userId, muelleId);
  const parsed = requirementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const config =
    parsed.data.source === "kpi"
      ? kpiConfig.safeParse(parsed.data.config)
      : z.object({}).strict().safeParse(parsed.data.config ?? {});
  if (!config.success) return { ok: false, error: INVALIDO };

  const [row] = await db
    .insert(sealRequirement)
    .values({ muelleOrgId: muelleId, ...parsed.data, config: config.data })
    .onConflictDoNothing()
    .returning();
  if (!row) return { ok: false, error: INVALIDO };
  return { ok: true, data: row };
}

async function requirementOrNotFound(requirementId: string) {
  if (!z.string().uuid().safeParse(requirementId).success) notFound();
  const [row] = await db.select().from(sealRequirement).where(eq(sealRequirement.id, requirementId)).limit(1);
  if (!row) notFound();
  return row;
}

export async function setRequirementActive(userId: string, requirementId: string, active: boolean): Promise<Result<true>> {
  const req = await requirementOrNotFound(requirementId);
  await assertDockOwner(userId, req.muelleOrgId);
  await db.update(sealRequirement).set({ active, updatedAt: new Date() }).where(eq(sealRequirement.id, req.id));
  return { ok: true, data: true };
}

export async function listRequirements(userId: string, muelleId: string): Promise<SealRequirementRow[]> {
  await assertDockOwner(userId, muelleId);
  return db.select().from(sealRequirement).where(eq(sealRequirement.muelleOrgId, muelleId)).orderBy(asc(sealRequirement.code));
}

/** El sujeto pertenece al muelle: barco colgado de él o afiliada de su red. */
async function subjectInMuelle(subject: SealSubject, muelleId: string): Promise<boolean> {
  if (subject.kind === "barco") {
    if (!z.string().uuid().safeParse(subject.orgId).success) return false;
    const [boat] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(and(eq(organization.id, subject.orgId), eq(organization.kind, "barco"), eq(organization.parentOrgId, muelleId)));
    return Boolean(boat);
  }
  if (!z.string().uuid().safeParse(subject.affiliateId).success) return false;
  const [row] = await db
    .select({ id: affiliate.id })
    .from(affiliate)
    .where(and(eq(affiliate.id, subject.affiliateId), eq(affiliate.muelleOrgId, muelleId)));
  return Boolean(row);
}

export async function markManualResult(
  userId: string,
  requirementId: string,
  subject: SealSubject,
  met: boolean,
  evidenceNote: string | null,
): Promise<Result<true>> {
  const req = await requirementOrNotFound(requirementId);
  await assertDockOwner(userId, req.muelleOrgId);
  if (req.source !== "manual") return { ok: false, error: INVALIDO };
  if (!(await subjectInMuelle(subject, req.muelleOrgId))) return { ok: false, error: INVALIDO };
  const note = z.string().trim().max(2000).nullable().safeParse(evidenceNote);
  if (!note.success) return { ok: false, error: INVALIDO };

  const barcoOrgId = subject.kind === "barco" ? subject.orgId : null;
  const affiliateId = subject.kind === "afiliada" ? subject.affiliateId : null;
  const set = { met, evidenceNote: note.data, decidedBy: userId, decidedAt: new Date() };
  await db
    .insert(sealRequirementResult)
    .values({ muelleOrgId: req.muelleOrgId, requirementId: req.id, subjectKind: subject.kind, barcoOrgId, affiliateId, ...set })
    .onConflictDoUpdate(
      subject.kind === "barco"
        ? {
            target: [sealRequirementResult.requirementId, sealRequirementResult.barcoOrgId],
            targetWhere: sql`barco_org_id is not null`,
            set,
          }
        : {
            target: [sealRequirementResult.requirementId, sealRequirementResult.affiliateId],
            targetWhere: sql`affiliate_id is not null`,
            set,
          },
    );
  return { ok: true, data: true };
}
