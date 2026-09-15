// El único guard de autorización de apps/improvement — todo Server Component/Server Action que
// toca datos de un org empieza llamando requireOrgMembership() (.claude/rules). RLS en Postgres es
// la segunda capa, nunca la única (misma regla).
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { env } from "../../lib/env.ts";
import { scopeFor, type Scope, type SectionSlug } from "../permissions/sections.ts";

/**
 * Consulta directa a `membership` — separada de la resolución de sesión para poder probarla sin
 * mockear cookies ni el contexto de request de Next (ver tests/auth/guard.test.ts).
 */
export async function findMembership(userId: string, orgId: string) {
  const rows = await db
    .select()
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Resuelve el usuario autenticado a partir de la cookie de sesión de Supabase Auth. Devuelve `null`
 * si no hay sesión — nunca lanza, para que requireOrgMembership decida el 404 en un solo lugar.
 */
export async function getSessionUserId(): Promise<string | null> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("imp-access-token")?.value;
  if (!accessToken) return null;

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * El access token crudo de la sesión, para las pocas operaciones que hablan con Supabase COMO EL
 * USUARIO y no con el cliente `db` (que usa el rol postgres y bypasea RLS) — hoy solo la subida de
 * la foto de perfil a Storage, donde la política del bucket exige que la carpeta sea auth.uid().
 * Vive aquí para que el nombre de la cookie siga escrito en un solo lugar.
 */
export async function getSessionAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("imp-access-token")?.value ?? null;
}

/**
 * Guard de tenencia puro — recibe un userId ya resuelto (por requireOrgMembership() a partir de la
 * cookie, o directo desde otro server/** que ya conoce la sesión). Separado de la resolución de
 * cookie para poder probar el aislamiento entre orgs sin mockear el contexto de request de Next:
 * notFound() es un throw síncrono, seguro de invocar y de capturar en un test (ver
 * tests/objectives.test.ts).
 */
export async function assertMembership(userId: string, orgId: string) {
  const row = await findMembership(userId, orgId);
  if (!row) notFound();
  return row;
}

/**
 * Guard de tenencia: WHEN no hay sesión, o la sesión no tiene membership en `orgId`, THE SYSTEM
 * SHALL responder 404 (nunca 403 — un 403 confirma que el org existe a alguien que no debería
 * saberlo). Retorna la fila de membership cuando sí pertenece.
 */
export async function requireOrgMembership(orgId: string) {
  const userId = await getSessionUserId();
  if (!userId) notFound();

  return assertMembership(userId, orgId);
}

async function fetchIsPlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isPlatformAdmin: profile.isPlatformAdmin })
    .from(profile)
    .where(eq(profile.id, userId))
    .limit(1);
  return row?.isPlatformAdmin ?? false;
}

/**
 * WHEN userId corresponde a un profile con is_platform_admin=true THE SYSTEM SHALL devolver true
 * (criterio #1); WHEN no existe ese profile, o existe con is_platform_admin=false, THE SYSTEM SHALL
 * devolver false, nunca lanzar (criterio #2) — usado para decidir qué renderizar en /empresas, no
 * para bloquear acceso (eso es requirePlatformAdminSession, abajo).
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  return fetchIsPlatformAdmin(userId);
}

/**
 * Guard de tenencia para rutas exclusivas de platform admin dentro de apps/improvement (ej.
 * /empresas/clientes/[clientUserId]) — mismo criterio 404-nunca-403 que requireOrgMembership: WHEN
 * no hay sesión, o la sesión no es platform admin, THE SYSTEM SHALL responder 404. Devuelve el
 * userId cuando sí lo es.
 */
export async function requirePlatformAdminSession(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) notFound();

  const admin = await fetchIsPlatformAdmin(userId);
  if (!admin) notFound();

  return userId;
}

/**
 * El usuario de la sesión con su correo — lo necesita la aceptación de invitación, que tiene que
 * comprobar que quien acaba de registrarse es el correo al que el dueño invitó, y no otro.
 */
export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const accessToken = await getSessionAccessToken();
  if (!accessToken) return null;

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

/** La fila si es dueño; null si es miembro pero no dueño. 404 si no es miembro (assertMembership). */
export async function findOwnerMembership(userId: string, orgId: string) {
  const row = await assertMembership(userId, orgId);
  return row.role === "owner" ? row : null;
}

/**
 * El alcance de una persona en una sección, junto con su membresía. Devuelve `ninguno` sin lanzar:
 * el menú necesita saberlo para NO dibujar la sección, y una ruta que lanzara aquí impediría eso.
 * Quien protege una ruta usa requireSection().
 */
export async function resolveSection(
  userId: string,
  orgId: string,
  section: SectionSlug,
): Promise<{ membership: Awaited<ReturnType<typeof assertMembership>>; scope: Scope }> {
  const row = await assertMembership(userId, orgId);
  if (row.role === "owner") return { membership: row, scope: "empresa" };
  if (!row.permissionTypeId) return { membership: row, scope: "ninguno" };

  const [type] = await db
    .select({ grants: permissionType.grants })
    .from(permissionType)
    .where(eq(permissionType.id, row.permissionTypeId))
    .limit(1);

  return { membership: row, scope: scopeFor(row.role, type?.grants ?? null, section) };
}

/**
 * WHEN el tipo de permiso de la persona no concede esta sección THE SYSTEM SHALL responder 404,
 * nunca 403 — mismo criterio que requireOrgMembership: un 403 le confirma que la sección existe.
 */
export async function requireSection(orgId: string, section: SectionSlug) {
  const row = await requireOrgMembership(orgId);
  const resolved = await resolveSection(row.userId, orgId, section);
  if (resolved.scope === "ninguno") notFound();
  return resolved;
}
