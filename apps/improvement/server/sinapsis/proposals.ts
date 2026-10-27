// La sinapsis: cuando una necesidad seria de un barco cae en un área con especialidad de la red, Improvement
// propone a la afiliada del muelle que mejor la atiende (Sello primero, luego parecido con el dueño). Firman
// dos socios en Summum y al final decide el dueño aquí; si aprueba, la necesidad se deriva por el puerto de
// siempre (referNeedToSummum). generateProposals es de cron: no corre en nombre de nadie.
import { and, asc, desc, eq, gte, inArray, isNotNull, notExists } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  area,
  membership,
  muelleSettings,
  organization,
  orgNeed,
  personalityMatch,
  personalityProfile,
  sealEvaluation,
  specialistProposal,
  specialty,
} from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { referNeedToSummum } from "../needs/mutations.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const fail = (code: string, message: string): Result<never> => ({ ok: false, error: { code, message } });
const FORBIDDEN = () => fail("FORBIDDEN", "Solo el dueño decide esto.");
const OPEN = ["propuesta", "aprobada_socios", "activa"] as const;

async function parentMuelle(orgId: string) {
  const [row] = await db.select({ muelleId: organization.parentOrgId }).from(organization).where(eq(organization.id, orgId));
  return row?.muelleId ?? null;
}

export async function listNetworkSpecialties(userId: string, orgId: string) {
  if (!(await findOwnerMembership(userId, orgId))) return [];
  const muelleId = await parentMuelle(orgId);
  if (!muelleId) return [];
  return db
    .select({ key: specialty.key, label: specialty.label })
    .from(specialty)
    .where(eq(specialty.muelleOrgId, muelleId))
    .orderBy(asc(specialty.label));
}

export async function setAreaSpecialty(userId: string, orgId: string, areaId: string, key: string | null): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return FORBIDDEN();
  const notFound = fail("NOT_FOUND", "Esa área o esa especialidad no existe.");
  if (key !== null) {
    const muelleId = await parentMuelle(orgId);
    if (!muelleId) return notFound;
    const [known] = await db
      .select({ key: specialty.key })
      .from(specialty)
      .where(and(eq(specialty.muelleOrgId, muelleId), eq(specialty.key, key)));
    if (!known) return notFound;
  }
  const [row] = await db
    .update(area)
    .set({ specialtyKey: key })
    .where(and(eq(area.id, areaId), eq(area.orgId, orgId)))
    .returning({ id: area.id });
  return row ? { ok: true, data: true } : notFound;
}

type Answers = Record<string, string>;

export async function generateProposals({ now: _now = new Date(), muelleId }: { now?: Date; muelleId?: string } = {}) {
  let created = 0;
  const muelles = await db
    .select({ muelleOrgId: muelleSettings.muelleOrgId, minSeverity: muelleSettings.proposalMinSeverity })
    .from(muelleSettings)
    .where(muelleId ? eq(muelleSettings.muelleOrgId, muelleId) : undefined);

  for (const { muelleOrgId, minSeverity } of muelles) {
    const needs = await db
      .select({ id: orgNeed.id, orgId: orgNeed.orgId, key: area.specialtyKey })
      .from(orgNeed)
      .innerJoin(area, eq(area.id, orgNeed.areaId))
      .innerJoin(organization, eq(organization.id, orgNeed.orgId))
      .where(
        and(
          eq(organization.parentOrgId, muelleOrgId),
          inArray(orgNeed.status, ["abierta", "en_progreso"]),
          gte(orgNeed.severity, minSeverity),
          isNotNull(area.specialtyKey),
          notExists(
            db
              .select({ id: specialistProposal.id })
              .from(specialistProposal)
              .where(and(eq(specialistProposal.orgNeedId, orgNeed.id), inArray(specialistProposal.status, OPEN))),
          ),
        ),
      );
    if (needs.length === 0) continue;

    const affiliates = await db
      .select()
      .from(affiliate)
      .where(and(eq(affiliate.muelleOrgId, muelleOrgId), eq(affiliate.status, "activa")))
      .orderBy(asc(affiliate.createdAt));
    if (affiliates.length === 0) continue;

    const [evals, profiles] = await Promise.all([
      db
        .select({ affiliateId: sealEvaluation.affiliateId, score: sealEvaluation.score })
        .from(sealEvaluation)
        .where(
          and(
            eq(sealEvaluation.muelleOrgId, muelleOrgId),
            eq(sealEvaluation.approvalStatus, "aprobada"),
            inArray(sealEvaluation.vigencia, ["vigente", "en_riesgo"]),
            isNotNull(sealEvaluation.affiliateId),
          ),
        )
        .orderBy(desc(sealEvaluation.approvedAt)),
      db
        .select({ profileId: personalityProfile.profileId, answers: personalityProfile.answers })
        .from(personalityProfile)
        .where(and(eq(personalityProfile.subjectKind, "afiliada"), inArray(personalityProfile.profileId, affiliates.map((a) => a.profileId)))),
    ]);
    const sealOf = new Map<string, number>();
    for (const e of evals) if (e.affiliateId && !sealOf.has(e.affiliateId)) sealOf.set(e.affiliateId, e.score);
    const answersOf = new Map(profiles.map((p) => [p.profileId, p.answers as Answers]));

    for (const need of needs) {
      const [owner, rejected] = await Promise.all([
        db
          .select({ answers: personalityProfile.answers })
          .from(membership)
          .leftJoin(
            personalityProfile,
            and(eq(personalityProfile.profileId, membership.userId), eq(personalityProfile.subjectKind, "dueno")),
          )
          .where(and(eq(membership.orgId, need.orgId), eq(membership.role, "owner")))
          .orderBy(asc(membership.acceptedAt))
          .limit(1)
          .then(([row]) => (row?.answers as Answers | null) ?? null),
        db
          .select({ affiliateId: specialistProposal.affiliateId })
          .from(specialistProposal)
          .where(and(eq(specialistProposal.orgNeedId, need.id), eq(specialistProposal.status, "rechazada")))
          .then((rows) => new Set(rows.map((r) => r.affiliateId))),
      ]);

      // Orden estable: Sello (sin Sello al final), parecido con el dueño y la más antigua (ya vienen por created_at).
      const ranked = affiliates
        .filter((a) => a.specialtyKeys.includes(need.key!) && !rejected.has(a.id) && a.barcoOrgId !== need.orgId)
        .map((a) => {
          const theirs = answersOf.get(a.profileId);
          return { a, seal: sealOf.get(a.id) ?? null, match: owner && theirs ? personalityMatch(owner, theirs) : 0 };
        })
        .sort((x, y) => (y.seal ?? -1) - (x.seal ?? -1) || y.match - x.match);
      const best = ranked[0];
      if (!best) continue;

      const inserted = await db
        .insert(specialistProposal)
        .values({ muelleOrgId, orgId: need.orgId, orgNeedId: need.id, affiliateId: best.a.id, sealScore: best.seal, matchScore: best.match })
        .onConflictDoNothing()
        .returning({ id: specialistProposal.id });
      created += inserted.length;
    }
  }
  return created;
}

export async function listOwnerProposals(userId: string, orgId: string) {
  if (!(await findOwnerMembership(userId, orgId))) return [];
  return db
    .select({
      id: specialistProposal.id,
      status: specialistProposal.status,
      sealScore: specialistProposal.sealScore,
      matchScore: specialistProposal.matchScore,
      needId: orgNeed.id,
      needTitle: orgNeed.title,
      displayName: affiliate.displayName,
    })
    .from(specialistProposal)
    .innerJoin(orgNeed, eq(orgNeed.id, specialistProposal.orgNeedId))
    .innerJoin(affiliate, eq(affiliate.id, specialistProposal.affiliateId))
    .where(and(eq(specialistProposal.orgId, orgId), inArray(specialistProposal.status, ["aprobada_socios", "activa"])))
    .orderBy(desc(specialistProposal.createdAt));
}

export async function decideProposalAsOwner(userId: string, orgId: string, proposalId: string, decision: unknown): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return FORBIDDEN();
  const parsed = z.enum(["aprobada", "rechazada"]).safeParse(decision);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Decide aprobar o rechazar.");

  const [proposal] = await db
    .select({ status: specialistProposal.status, needId: specialistProposal.orgNeedId, displayName: affiliate.displayName })
    .from(specialistProposal)
    .innerJoin(affiliate, eq(affiliate.id, specialistProposal.affiliateId))
    .where(and(eq(specialistProposal.id, proposalId), eq(specialistProposal.orgId, orgId)));
  if (!proposal) return fail("NOT_FOUND", "Esa propuesta no es de esta empresa.");
  const transition = fail("INVALID_TRANSITION", "Esta propuesta aún no la firman los socios o ya se decidió.");
  if (proposal.status !== "aprobada_socios") return transition;

  const now = new Date();
  const [row] = await db
    .update(specialistProposal)
    .set({ status: parsed.data === "aprobada" ? "activa" : "rechazada", ownerDecidedBy: userId, ownerDecidedAt: now, updatedAt: now })
    .where(and(eq(specialistProposal.id, proposalId), eq(specialistProposal.status, "aprobada_socios")))
    .returning({ id: specialistProposal.id });
  if (!row) return transition;
  if (parsed.data === "rechazada") return { ok: true, data: true };
  return referNeedToSummum(userId, orgId, proposal.needId, `Especialista Summum: ${proposal.displayName}`);
}
