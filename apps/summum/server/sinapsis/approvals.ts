// Firma de los dos socios sobre una propuesta de especialista que generó Improvement (server/sinapsis/
// proposals.ts allá). Summum solo LEE org_need y organization de sus barcos: la necesidad se deriva cuando
// el dueño del barco aprueba en Improvement, nunca desde aquí. Mismo patrón que server/seal/approvals.ts.
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { affiliate, organization, orgNeed, profile, specialistProposal } from "@jotapuntoce/db/schema";
import { assertDockOwner } from "../auth/guard.ts";
import type { Result } from "../result.ts";

const OTRA_FIRMA = "Necesita la firma del otro dueño.";
const YA_DECIDIDO = "Este cambio ya se decidió.";

async function proposalFor(userId: string, proposalId: string) {
  if (!z.string().uuid().safeParse(proposalId).success) notFound();
  const [row] = await db.select().from(specialistProposal).where(eq(specialistProposal.id, proposalId)).limit(1);
  if (!row) notFound();
  await assertDockOwner(userId, row.muelleOrgId);
  return row;
}

const inStatus = (id: string, statuses: ("propuesta" | "aprobada_socios")[]) =>
  and(eq(specialistProposal.id, id), inArray(specialistProposal.status, statuses));

export async function approveProposal(userId: string, proposalId: string): Promise<Result<{ status: "propuesta" | "aprobada_socios" }>> {
  const p = await proposalFor(userId, proposalId);
  if (p.status !== "propuesta") return { ok: false, error: YA_DECIDIDO };
  if (p.firstPartnerId === userId) return { ok: false, error: OTRA_FIRMA };

  const now = new Date();
  const update = p.firstPartnerId
    ? { secondPartnerId: userId, status: "aprobada_socios" as const, partnersApprovedAt: now }
    : { firstPartnerId: userId };
  const claimed = await db
    .update(specialistProposal)
    .set({ ...update, updatedAt: now })
    .where(inStatus(p.id, ["propuesta"]))
    .returning({ id: specialistProposal.id });
  if (claimed.length === 0) return { ok: false, error: YA_DECIDIDO };
  return { ok: true, data: { status: p.firstPartnerId ? "aprobada_socios" : "propuesta" } };
}

export async function rejectProposal(userId: string, proposalId: string): Promise<Result<true>> {
  const p = await proposalFor(userId, proposalId);
  if (p.status !== "propuesta" && p.status !== "aprobada_socios") return { ok: false, error: YA_DECIDIDO };
  const claimed = await db
    .update(specialistProposal)
    .set({ status: "rechazada", updatedAt: new Date() })
    .where(inStatus(p.id, ["propuesta", "aprobada_socios"]))
    .returning({ id: specialistProposal.id });
  if (claimed.length === 0) return { ok: false, error: YA_DECIDIDO };
  return { ok: true, data: true };
}

const firstPartner = alias(profile, "first_partner");

/** Las propuestas abiertas del muelle, las más recientes primero, con lo que los socios necesitan para firmar. */
export async function listProposals(userId: string, muelleId: string) {
  await assertDockOwner(userId, muelleId);
  return db
    .select({
      id: specialistProposal.id,
      status: specialistProposal.status,
      sealScore: specialistProposal.sealScore,
      matchScore: specialistProposal.matchScore,
      firstPartnerId: specialistProposal.firstPartnerId,
      firstPartnerEmail: firstPartner.email,
      needTitle: orgNeed.title,
      needSeverity: orgNeed.severity,
      barcoName: organization.name,
      affiliateName: affiliate.displayName,
    })
    .from(specialistProposal)
    .innerJoin(orgNeed, eq(orgNeed.id, specialistProposal.orgNeedId))
    .innerJoin(organization, eq(organization.id, specialistProposal.orgId))
    .innerJoin(affiliate, eq(affiliate.id, specialistProposal.affiliateId))
    .leftJoin(firstPartner, eq(firstPartner.id, specialistProposal.firstPartnerId))
    .where(
      and(eq(specialistProposal.muelleOrgId, muelleId), inArray(specialistProposal.status, ["propuesta", "aprobada_socios", "activa"])),
    )
    .orderBy(desc(specialistProposal.createdAt));
}
