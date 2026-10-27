// El único guard de apps/summum. Dos puertas: dueño del MUELLE (panel de Summum) y dueño de un
// BARCO colgado de un muelle (sus acciones de Stripe). Ser dueño del muelle no abre el barco. 404,
// nunca 403. Sesión: misma idea que apps/improvement (cookie con el access token de Supabase).
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, membership, organization } from "@jotapuntoce/db/schema";
import { env } from "@/lib/env.ts";

export const SESSION_COOKIE = "sum-access-token";

export async function getSessionUserId(): Promise<string | null> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownedOrg(userId: string, orgId: string) {
  if (!UUID.test(orgId)) return null; // un id mal formado haría fallar el query de uuid con 500
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

// Sin sesión: al login con returnTo (si la página pasa su ruta); con sesión ajena: 404.
function toLogin(path?: string): never {
  redirect(path ? `/login?returnTo=${encodeURIComponent(path)}` : "/login");
}

export async function requireDockOwnership(muelleId: string, path?: string) {
  const userId = await getSessionUserId();
  if (!userId) toLogin(path);
  return assertDockOwner(userId, muelleId);
}

export async function assertBarcoOwner(userId: string, barcoId: string) {
  const row = await ownedOrg(userId, barcoId);
  if (!row || row.kind !== "barco" || !row.parentOrgId) notFound();
  return { userId, barcoId, muelleId: row.parentOrgId };
}

export async function requireBarcoOwnership(barcoId: string, path?: string) {
  const userId = await getSessionUserId();
  if (!userId) toLogin(path);
  return assertBarcoOwner(userId, barcoId);
}

/**
 * El Pacto es de toda la red del muelle: sus dueños, sus afiliadas activas y cualquier miembro (de cualquier
 * rol) de un barco que cuelga de él. Para todos los demás, 404.
 */
export async function assertPactoAccess(userId: string, muelleId: string): Promise<void> {
  if (!UUID.test(muelleId)) notFound();
  const [dock, aff, crew] = await Promise.all([
    ownedOrg(userId, muelleId),
    db
      .select({ id: affiliate.id })
      .from(affiliate)
      .where(and(eq(affiliate.profileId, userId), eq(affiliate.muelleOrgId, muelleId), eq(affiliate.status, "activa")))
      .limit(1),
    db
      .select({ id: organization.id })
      .from(organization)
      .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId)))
      .where(eq(organization.parentOrgId, muelleId))
      .limit(1),
  ]);
  if (dock?.kind === "muelle" || aff.length > 0 || crew.length > 0) return;
  notFound();
}

/** La comunidad: dueño del muelle o afiliada `activa` del muelle. Empleados de barco no entran. */
export async function assertNetworkMember(userId: string, muelleId: string): Promise<void> {
  if (!UUID.test(muelleId)) notFound();
  const [dock, aff] = await Promise.all([
    ownedOrg(userId, muelleId),
    db
      .select({ id: affiliate.id })
      .from(affiliate)
      .where(and(eq(affiliate.profileId, userId), eq(affiliate.muelleOrgId, muelleId), eq(affiliate.status, "activa")))
      .limit(1),
  ]);
  if (dock?.kind === "muelle" || aff.length > 0) return;
  notFound();
}

export async function listMyDocks(userId: string) {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId), eq(membership.role, "owner")))
    .where(eq(organization.kind, "muelle"));
}

// Solo barcos ya colgados de un muelle: un barco huérfano no tiene panel (assertBarcoOwner da 404).
export async function listMyBarcos(userId: string) {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .innerJoin(membership, and(eq(membership.orgId, organization.id), eq(membership.userId, userId), eq(membership.role, "owner")))
    .where(and(eq(organization.kind, "barco"), isNotNull(organization.parentOrgId)));
}
