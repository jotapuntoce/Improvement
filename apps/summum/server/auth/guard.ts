// El único guard de apps/summum. Dos puertas: dueño del MUELLE (panel de Summum) y dueño de un
// BARCO colgado de un muelle (sus acciones de Stripe). Ser dueño del muelle no abre el barco. 404,
// nunca 403. Sesión: misma idea que apps/improvement (cookie con el access token de Supabase).
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization } from "@jotapuntoce/db/schema";
import { env } from "../../lib/env.ts";

export const SESSION_COOKIE = "sum-access-token";

export async function getSessionUserId(): Promise<string | null> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function ownedOrg(userId: string, orgId: string) {
  const [row] = await db
    .select({ id: organization.id, kind: organization.kind, parentOrgId: organization.parentOrgId })
    .from(organization)
    .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId), eq(membership.role, "owner")))
    .where(eq(organization.id, orgId))
    .limit(1);
  return row ?? null;
}

export async function assertDockOwner(userId: string, muelleId: string) {
  const row = await ownedOrg(userId, muelleId);
  if (!row || row.kind !== "muelle") notFound();
  return { userId, muelleId };
}

export async function requireDockOwnership(muelleId: string) {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return assertDockOwner(userId, muelleId);
}

export async function assertBarcoOwner(userId: string, barcoId: string) {
  const row = await ownedOrg(userId, barcoId);
  if (!row || row.kind !== "barco" || !row.parentOrgId) notFound();
  return { userId, barcoId, muelleId: row.parentOrgId };
}

export async function requireBarcoOwnership(barcoId: string) {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return assertBarcoOwner(userId, barcoId);
}

export async function listMyDocks(userId: string) {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId), eq(membership.role, "owner")))
    .where(eq(organization.kind, "muelle"));
}
