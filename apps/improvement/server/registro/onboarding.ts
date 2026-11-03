// El arranque guiado después del alta: la propuesta (plantilla del giro) y su cierre.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, orgProfile } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { applyTemplate, templateFor, type TemplateApp } from "../apps/templates.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const forbidden = { ok: false as const, error: { code: "FORBIDDEN", message: "Solo el dueño arma su Improvement." } };

export async function loadProposal(userId: string, orgId: string): Promise<Result<{ templateKey: string; apps: TemplateApp[] }>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const [org] = await db.select({ industry: organization.industry }).from(organization).where(eq(organization.id, orgId));
  const t = templateFor(org?.industry ?? null);
  return { ok: true, data: { templateKey: t.key, apps: t.apps } };
}

/** Crea las apps que el dueño aceptó y marca el arranque como terminado. */
export async function finishOnboarding(userId: string, orgId: string, picks: TemplateApp[]): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const r = await applyTemplate(userId, orgId, picks);
  if (!r.ok) return r;
  await db.update(orgProfile).set({ onboardedAt: new Date(), updatedAt: new Date() }).where(eq(orgProfile.orgId, orgId));
  return { ok: true, data: true };
}

/** El dueño que se registró y no ha cerrado su arranque. Los negocios previos al registro no tienen org_profile: nunca entran aquí. */
export async function needsOnboarding(userId: string, orgId: string): Promise<boolean> {
  if (!(await findOwnerMembership(userId, orgId))) return false;
  const [p] = await db.select({ done: orgProfile.onboardedAt }).from(orgProfile).where(eq(orgProfile.orgId, orgId));
  return p !== undefined && p.done === null;
}
