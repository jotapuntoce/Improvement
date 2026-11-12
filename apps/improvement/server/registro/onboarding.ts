// El arranque guiado después del alta: la propuesta (plantilla del giro) y su cierre.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, organization, orgBrand, orgProfile, profile } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { applyTemplate, templateFor, type TemplateApp } from "../apps/templates.ts";
import { proposalFor, wireProcess } from "../owner/estructura.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const forbidden = { ok: false as const, error: { code: "FORBIDDEN", message: "Solo el dueño arma su Improvement." } };

export async function loadProposal(userId: string, orgId: string): Promise<Result<{ templateKey: string; apps: TemplateApp[] }>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const [org] = await db.select({ industry: organization.industry }).from(organization).where(eq(organization.id, orgId));
  const t = templateFor(org?.industry ?? null);
  return { ok: true, data: { templateKey: t.key, apps: await proposalFor(userId, orgId, t.apps) } };
}

export interface Armado {
  ownerName: string | null;
  name: string;
  industry: string | null;
  city: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  /** Las apps propias que ya armó (kind = 'custom'); las base las pinta la tarjeta. */
  apps: string[];
}

/** Lo que la tarjeta "Tu Improvement, armándose" muestra en los pasos 2 a 4. */
export async function loadArmado(userId: string, orgId: string): Promise<Result<Armado>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const [[org], [brand], [owner], apps] = await Promise.all([
    db
      .select({ name: organization.name, industry: organization.industry, city: orgProfile.city })
      .from(organization)
      .leftJoin(orgProfile, eq(orgProfile.orgId, organization.id))
      .where(eq(organization.id, orgId)),
    db.select().from(orgBrand).where(eq(orgBrand.orgId, orgId)),
    db.select({ fullName: profile.fullName }).from(profile).where(eq(profile.id, userId)),
    db
      .select({ name: appModel.name })
      .from(appModel)
      .where(and(eq(appModel.orgId, orgId), eq(appModel.kind, "custom"), eq(appModel.enabled, true)))
      .orderBy(asc(appModel.position), asc(appModel.createdAt)),
  ]);
  if (!org) return forbidden;
  return {
    ok: true,
    data: {
      ownerName: owner?.fullName ?? null,
      name: org.name,
      industry: org.industry,
      city: org.city ?? null,
      logoUrl: brand?.logoUrl ?? null,
      primaryColor: brand?.primaryColor ?? null,
      secondaryColor: brand?.secondaryColor ?? null,
      apps: apps.map((a) => a.name),
    },
  };
}

/** Crea las apps que el dueño aceptó y marca el arranque como terminado. */
export async function finishOnboarding(userId: string, orgId: string, picks: TemplateApp[]): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const r = await applyTemplate(userId, orgId, picks);
  if (!r.ok) return r;
  await wireProcess(userId, orgId, picks, r.data.created);
  await db.update(orgProfile).set({ onboardedAt: new Date(), updatedAt: new Date() }).where(eq(orgProfile.orgId, orgId));
  return { ok: true, data: true };
}

/** El dueño que se registró y no ha cerrado su arranque. Los negocios previos al registro no tienen org_profile: nunca entran aquí. */
export async function needsOnboarding(userId: string, orgId: string): Promise<boolean> {
  if (!(await findOwnerMembership(userId, orgId))) return false;
  const [p] = await db.select({ done: orgProfile.onboardedAt }).from(orgProfile).where(eq(orgProfile.orgId, orgId));
  return p !== undefined && p.done === null;
}
