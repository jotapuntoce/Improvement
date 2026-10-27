// La red de afiliadas especialistas de un muelle: especialidades, alta, estado, perfil público y el
// cuestionario de personalidad. Las da de alta y las suspende un dueño del muelle; su perfil y su
// cuestionario solo los toca la propia afiliada. 404 nunca 403 (assertDockOwner).
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import {
  AFFILIATE_STATUSES,
  affiliate,
  membership,
  organization,
  PERSONALITY_VERSION,
  personalityAnswersValid,
  personalityProfile,
  profile,
  specialty,
} from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";
import type { Result } from "../result.ts";

const INVALIDO = "Revisa los datos del formulario.";

export type AffiliateRow = typeof affiliate.$inferSelect;
export type SpecialtyRow = typeof specialty.$inferSelect;

const specialtySchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{2,40}$/),
  label: z.string().trim().min(2).max(80),
});

export async function createSpecialty(userId: string, muelleId: string, input: unknown): Promise<Result<SpecialtyRow>> {
  await assertDockOwner(userId, muelleId);
  const parsed = specialtySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [row] = await db
    .insert(specialty)
    .values({ muelleOrgId: muelleId, ...parsed.data })
    .onConflictDoNothing()
    .returning();
  if (!row) return { ok: false, error: INVALIDO };
  return { ok: true, data: row };
}

export async function listSpecialties(muelleId: string): Promise<SpecialtyRow[]> {
  return db.select().from(specialty).where(eq(specialty.muelleOrgId, muelleId)).orderBy(asc(specialty.label));
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(2).max(120),
  specialtyKeys: z.array(z.string()).min(1).max(5),
});

/** Slug ASCII del nombre + 6 caracteres al azar: legible en /directorio y sin choques. */
function publicSlug(displayName: string): string {
  const base = displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "afiliada"}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function registerAffiliate(userId: string, muelleId: string, input: unknown): Promise<Result<AffiliateRow>> {
  await assertDockOwner(userId, muelleId);
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const { email, displayName, specialtyKeys } = parsed.data;

  const [person] = await db.select({ id: profile.id }).from(profile).where(eq(profile.email, email)).limit(1);
  if (!person) return { ok: false, error: INVALIDO };
  const known = new Set((await listSpecialties(muelleId)).map((s) => s.key));
  if (!specialtyKeys.every((k) => known.has(k))) return { ok: false, error: INVALIDO };

  const [row] = await db
    .insert(affiliate)
    .values({ profileId: person.id, muelleOrgId: muelleId, displayName, specialtyKeys, publicSlug: publicSlug(displayName) })
    .onConflictDoNothing()
    .returning();
  if (!row) return { ok: false, error: INVALIDO };
  return { ok: true, data: row };
}

export async function setAffiliateStatus(userId: string, affiliateId: string, status: unknown): Promise<Result<true>> {
  const parsedId = z.string().uuid().safeParse(affiliateId);
  if (!parsedId.success) notFound();
  const [row] = await db.select({ muelleOrgId: affiliate.muelleOrgId }).from(affiliate).where(eq(affiliate.id, parsedId.data)).limit(1);
  if (!row) notFound();
  await assertDockOwner(userId, row.muelleOrgId);
  const parsed = z.enum(AFFILIATE_STATUSES).safeParse(status);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  await db.update(affiliate).set({ status: parsed.data, updatedAt: new Date() }).where(eq(affiliate.id, parsedId.data));
  return { ok: true, data: true };
}

export async function listAffiliates(userId: string, muelleId: string): Promise<AffiliateRow[]> {
  await assertDockOwner(userId, muelleId);
  return db.select().from(affiliate).where(eq(affiliate.muelleOrgId, muelleId)).orderBy(asc(affiliate.displayName));
}

/** La fila de `userId` en ese muelle, o null. */
export async function getMyAffiliate(userId: string, muelleId: string): Promise<AffiliateRow | null> {
  if (!z.string().uuid().safeParse(muelleId).success) return null;
  const [row] = await db
    .select()
    .from(affiliate)
    .where(and(eq(affiliate.profileId, userId), eq(affiliate.muelleOrgId, muelleId)))
    .limit(1);
  return row ?? null;
}

const profileSchema = z.object({
  publicBio: z.string().trim().max(1000).nullable(),
  directoryOptIn: z.boolean(),
  barcoOrgId: z.string().uuid().nullable(),
});

export async function saveAffiliateProfile(userId: string, muelleId: string, input: unknown): Promise<Result<true>> {
  const mine = await getMyAffiliate(userId, muelleId);
  if (!mine) notFound();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  if (parsed.data.barcoOrgId) {
    const [boat] = await db
      .select({ id: organization.id })
      .from(organization)
      .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId), eq(membership.role, "owner")))
      .where(and(eq(organization.id, parsed.data.barcoOrgId), eq(organization.kind, "barco")))
      .limit(1);
    if (!boat) return { ok: false, error: INVALIDO };
  }
  await db
    .update(affiliate)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(affiliate.id, mine.id));
  return { ok: true, data: true };
}

export async function answerQuestionnaire(userId: string, muelleId: string, answers: unknown): Promise<Result<true>> {
  const mine = await getMyAffiliate(userId, muelleId);
  if (!mine) notFound();
  if (mine.status !== "activa" || !personalityAnswersValid(answers)) return { ok: false, error: INVALIDO };
  await db
    .insert(personalityProfile)
    .values({ profileId: userId, subjectKind: "afiliada", answers, questionnaireVersion: PERSONALITY_VERSION })
    .onConflictDoUpdate({
      target: [personalityProfile.profileId, personalityProfile.subjectKind],
      set: { answers, questionnaireVersion: PERSONALITY_VERSION, updatedAt: new Date() },
    });
  return { ok: true, data: true };
}
