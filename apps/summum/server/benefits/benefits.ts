// Beneficios de la red: premios que publican las afiliadas y los negocios del muelle en el catálogo de
// PowerUps (powerup_partner con network_org_id). El modo del catálogo (global / solo red) es el corte y el
// interruptor de reversa de §9.1 del blueprint; solo lo mueve un dueño del muelle.
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { affiliate, CATALOG_MODES, membership, muelleSettings, organization, powerupPartner } from "@jotapuntoce/db/schema";
import { assertDockOwner, listMyDocks } from "../auth/guard.ts";
import { getMyAffiliate } from "../affiliates/affiliates.ts";
import type { Result } from "../result.ts";

const INVALIDO = "Revisa los datos del formulario.";

async function isDockOwner(userId: string, muelleId: string) {
  return (await listMyDocks(userId)).some((d) => d.id === muelleId);
}

async function activeAffiliate(userId: string, muelleId: string) {
  const mine = await getMyAffiliate(userId, muelleId);
  return mine?.status === "activa" ? mine : null;
}

/** Los barcos del muelle de los que `userId` es dueño. */
async function myBarcosIn(userId: string, muelleId: string) {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId), eq(membership.role, "owner")))
    .where(and(eq(organization.kind, "barco"), eq(organization.parentOrgId, muelleId)));
}

const benefitSchema = z.object({
  as: z.enum(["afiliada", "negocio"]),
  barcoOrgId: z.string().uuid().nullish(),
  category: z.string().trim().min(2).max(60),
  discountDescription: z.string().trim().min(3).max(300),
  redemptionInstructions: z.string().trim().min(3).max(500),
  pointsCost: z.number().int().min(1).max(100000),
});

export async function publishBenefit(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>> {
  const parsed = benefitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const { as, barcoOrgId, ...fields } = parsed.data;

  let author: { businessName: string; affiliateId?: string; barcoOrgId?: string };
  if (as === "afiliada") {
    const mine = await activeAffiliate(userId, muelleId);
    if (!mine) return { ok: false, error: INVALIDO };
    author = { businessName: mine.displayName, affiliateId: mine.id };
  } else {
    const barco = (await myBarcosIn(userId, muelleId)).find((b) => b.id === barcoOrgId);
    if (!barco) return { ok: false, error: INVALIDO };
    author = { businessName: barco.name, barcoOrgId: barco.id };
  }

  const [row] = await db
    .insert(powerupPartner)
    .values({ ...fields, ...author, networkOrgId: muelleId, publishedBy: userId, isActive: true })
    .returning({ id: powerupPartner.id });
  return { ok: true, data: { id: row!.id } };
}

export async function setBenefitActive(userId: string, benefitId: string, active: boolean): Promise<Result<true>> {
  if (!z.string().uuid().safeParse(benefitId).success) notFound();
  const [benefit] = await db.select().from(powerupPartner).where(eq(powerupPartner.id, benefitId)).limit(1);
  if (!benefit?.networkOrgId) notFound(); // los premios globales se administran desde apps/admin
  if (benefit.publishedBy !== userId && !(await isDockOwner(userId, benefit.networkOrgId))) notFound();
  await db.update(powerupPartner).set({ isActive: active }).where(eq(powerupPartner.id, benefitId));
  return { ok: true, data: true };
}

/** Lo que ve en la pantalla quien es dueño del muelle o afiliada activa; cualquier otro, 404. */
export async function listNetworkBenefits(userId: string, muelleId: string) {
  if (!z.string().uuid().safeParse(muelleId).success) notFound();
  const [owner, mine] = await Promise.all([isDockOwner(userId, muelleId), activeAffiliate(userId, muelleId)]);
  if (!owner && !mine) notFound();
  const [benefits, barcos, [settings]] = await Promise.all([
    db
      .select({
        id: powerupPartner.id,
        businessName: powerupPartner.businessName,
        category: powerupPartner.category,
        discountDescription: powerupPartner.discountDescription,
        pointsCost: powerupPartner.pointsCost,
        isActive: powerupPartner.isActive,
        publishedBy: powerupPartner.publishedBy,
        affiliateName: affiliate.displayName,
      })
      .from(powerupPartner)
      .leftJoin(affiliate, eq(affiliate.id, powerupPartner.affiliateId))
      .where(eq(powerupPartner.networkOrgId, muelleId))
      .orderBy(desc(powerupPartner.createdAt)),
    myBarcosIn(userId, muelleId),
    db.select({ catalogMode: muelleSettings.catalogMode }).from(muelleSettings).where(eq(muelleSettings.muelleOrgId, muelleId)),
  ]);
  return {
    benefits: benefits.map((b) => ({ ...b, canToggle: owner || b.publishedBy === userId })),
    isDockOwner: owner,
    canPublishAsAffiliate: Boolean(mine),
    barcos,
    catalogMode: settings?.catalogMode ?? "global",
  };
}

export async function setCatalogMode(userId: string, muelleId: string, mode: unknown): Promise<Result<true>> {
  await assertDockOwner(userId, muelleId);
  const parsed = z.enum(CATALOG_MODES).safeParse(mode);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  await db
    .insert(muelleSettings)
    .values({ muelleOrgId: muelleId, catalogMode: parsed.data })
    .onConflictDoUpdate({ target: muelleSettings.muelleOrgId, set: { catalogMode: parsed.data, updatedAt: new Date() } });
  return { ok: true, data: true };
}
