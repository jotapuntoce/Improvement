// Referidos: enlace por persona y muelle, atribución de un barco con firma de dos socios y comisión
// devengada sobre ledger_entry.summum_fee_cents durante el recorrido. Aquí no se paga nada: solo se reporta.
import { randomBytes } from "node:crypto";
import { and, eq, gte, isNotNull, isNull, lt, sql, sum } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, organization, referralAttribution, referralCommission, referralLink } from "@jotapuntoce/db/schema";
import { assertDockOwner, assertPactoAccess, listMyDocks } from "../auth/guard.ts";
import type { Result } from "../result.ts";

const INVALIDO = "Revisa los datos del formulario.";
const uuid = z.string().uuid();

/** El enlace de la persona en este muelle; la segunda llamada devuelve el mismo. */
export async function ensureReferralLink(userId: string, muelleId: string) {
  await assertPactoAccess(userId, muelleId);
  const mine = and(eq(referralLink.profileId, userId), eq(referralLink.muelleOrgId, muelleId));
  await db
    .insert(referralLink)
    .values({ profileId: userId, muelleOrgId: muelleId, code: randomBytes(12).toString("base64url") })
    .onConflictDoNothing({ target: [referralLink.profileId, referralLink.muelleOrgId] });
  const [row] = await db.select({ id: referralLink.id, code: referralLink.code }).from(referralLink).where(mine).limit(1);
  return row!;
}

const attributionSchema = z.object({
  barcoOrgId: uuid,
  code: z.string().trim().min(1).max(64),
  shareBps: z.coerce.number().int().min(0).max(10000),
  journeyMonths: z.coerce.number().int().min(1).max(60),
  startsAt: z.coerce.date(),
});

export async function proposeAttribution(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertDockOwner(userId, muelleId);
  const parsed = attributionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const { barcoOrgId, code, ...terms } = parsed.data;
  const [[barco], [link], [taken]] = await Promise.all([
    db.select({ id: organization.id }).from(organization).where(and(eq(organization.id, barcoOrgId), eq(organization.kind, "barco"), eq(organization.parentOrgId, muelleId))).limit(1),
    db.select({ id: referralLink.id }).from(referralLink).where(and(eq(referralLink.code, code), eq(referralLink.muelleOrgId, muelleId))).limit(1),
    db.select({ id: referralAttribution.id }).from(referralAttribution).where(eq(referralAttribution.barcoOrgId, barcoOrgId)).limit(1),
  ]);
  if (!barco || !link || taken) return { ok: false, error: INVALIDO };
  const [row] = await db
    .insert(referralAttribution)
    .values({ muelleOrgId: muelleId, barcoOrgId, referralLinkId: link.id, ...terms, proposedBy: userId })
    .returning({ id: referralAttribution.id });
  return { ok: true, data: row! };
}

export async function approveAttribution(userId: string, attributionId: string): Promise<Result<true>> {
  if (!uuid.safeParse(attributionId).success) notFound();
  const [a] = await db.select().from(referralAttribution).where(eq(referralAttribution.id, attributionId)).limit(1);
  if (!a) notFound();
  await assertDockOwner(userId, a.muelleOrgId);
  if (a.proposedBy === userId) return { ok: false, error: "Necesita la firma del otro dueño." };
  const claimed = await db
    .update(referralAttribution)
    .set({ approvedBy: userId, approvedAt: new Date() })
    .where(and(eq(referralAttribution.id, attributionId), isNull(referralAttribution.approvedBy)))
    .returning({ id: referralAttribution.id });
  if (claimed.length === 0) return { ok: false, error: "Este cambio ya se decidió." };
  return { ok: true, data: true };
}

/**
 * Corre sin sesión (como el cron): por cada atribución aprobada, los movimientos del barco dentro de
 * [starts_at, starts_at + journey_months) sin comisión. Idempotente por el unique de ledger_entry_id.
 */
export async function accrueCommissions(muelleId: string, now = new Date()): Promise<number> {
  const rows = await db
    .select({ attributionId: referralAttribution.id, ledgerEntryId: ledgerEntry.id, fee: ledgerEntry.summumFeeCents, shareBps: referralAttribution.shareBps })
    .from(referralAttribution)
    .innerJoin(ledgerEntry, eq(ledgerEntry.barcoOrgId, referralAttribution.barcoOrgId))
    .leftJoin(referralCommission, eq(referralCommission.ledgerEntryId, ledgerEntry.id))
    .where(
      and(
        eq(referralAttribution.muelleOrgId, muelleId),
        isNotNull(referralAttribution.approvedBy),
        isNull(referralCommission.id),
        gte(ledgerEntry.createdAt, referralAttribution.startsAt),
        lt(ledgerEntry.createdAt, sql`${referralAttribution.startsAt} + make_interval(months => ${referralAttribution.journeyMonths})`),
        lt(ledgerEntry.createdAt, now),
      ),
    );
  if (rows.length === 0) return 0;
  const created = await db
    .insert(referralCommission)
    .values(rows.map((r) => ({ attributionId: r.attributionId, ledgerEntryId: r.ledgerEntryId, amountCents: Math.floor((r.fee * r.shareBps) / 10000) })))
    .onConflictDoNothing({ target: referralCommission.ledgerEntryId })
    .returning({ id: referralCommission.id });
  return created.length;
}

/** Como referente: su enlace, sus atribuciones y su total. Como dueño del muelle: todas. */
export async function referralReport(userId: string, muelleId: string) {
  await assertPactoAccess(userId, muelleId);
  const isDockOwner = (await listMyDocks(userId)).some((d) => d.id === muelleId);
  const scope = isDockOwner
    ? eq(referralAttribution.muelleOrgId, muelleId)
    : and(eq(referralAttribution.muelleOrgId, muelleId), eq(referralLink.profileId, userId));
  const [[link], attributions] = await Promise.all([
    db.select({ code: referralLink.code }).from(referralLink).where(and(eq(referralLink.profileId, userId), eq(referralLink.muelleOrgId, muelleId))).limit(1),
    db
      .select({
        id: referralAttribution.id,
        barcoName: organization.name,
        referrerId: referralLink.profileId,
        shareBps: referralAttribution.shareBps,
        journeyMonths: referralAttribution.journeyMonths,
        startsAt: referralAttribution.startsAt,
        approved: isNotNull(referralAttribution.approvedBy).mapWith(Boolean),
        accruedCents: sum(referralCommission.amountCents).mapWith(Number),
      })
      .from(referralAttribution)
      .innerJoin(referralLink, eq(referralLink.id, referralAttribution.referralLinkId))
      .innerJoin(organization, eq(organization.id, referralAttribution.barcoOrgId))
      .leftJoin(referralCommission, eq(referralCommission.attributionId, referralAttribution.id))
      .where(scope)
      .groupBy(referralAttribution.id, organization.name, referralLink.profileId),
  ]);
  const rows = attributions.map((a) => ({ ...a, accruedCents: a.accruedCents ?? 0 }));
  return { isDockOwner, code: link?.code ?? null, attributions: rows, totalCents: rows.reduce((t, a) => t + a.accruedCents, 0) };
}
