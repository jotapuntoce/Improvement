// Único guard de autorización de apps/admin — todo Server Component/Server Action de app/* (excepto
// /login) empieza llamando requirePlatformAdmin() (blueprint §"Route protection"). Mismo patrón que
// apps/improvement/server/auth/guard.ts (requireOrgMembership), adaptado a un solo rol de plataforma
// en vez de tenencia por org.
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { profile } from "@jotapuntoce/db/schema";
import { db, supabaseAdmin } from "./db.js";

/**
 * Consulta directa a `profile` — separada de la resolución de sesión para poder probarla sin
 * mockear cookies ni el contexto de request de Next (ver tests/auth/guard.test.js).
 */
export async function findProfile(userId) {
  const rows = await db.select().from(profile).where(eq(profile.id, userId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Resuelve el usuario autenticado a partir de la cookie de sesión (`sb-access-token`, puesta por
 * app/login/page.js). Reutiliza el cliente `supabaseAdmin` (service-role) ya expuesto por lib/db.js
 * en vez de agregar NEXT_PUBLIC_SUPABASE_ANON_KEY a admin — auth.getUser() valida el JWT contra
 * GoTrue con su propio secreto de firma, no con la apikey usada para construir el cliente, así que
 * el cliente service-role sirve igual para esto. Nunca lanza — para que requirePlatformAdmin decida
 * el 404 en un solo lugar.
 */
async function getSessionUserId() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  if (!accessToken) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Guard de rol puro — recibe un userId ya resuelto. Separado de la resolución de cookie para poder
 * probarlo sin mockear next/headers (cookies() lanza fuera de un request real de Next).
 *
 * WHEN el perfil no existe o `is_platform_admin` no es true THE SYSTEM SHALL responder 404 (nunca
 * 403 — un 403 confirma a alguien sin acceso que la ruta existe). Retorna la fila de profile cuando
 * sí es platform admin.
 */
export async function assertPlatformAdmin(userId) {
  const row = await findProfile(userId);
  if (!row?.isPlatformAdmin) notFound();
  return row;
}

/**
 * Guard de entrada: WHEN no hay sesión, o la sesión no pertenece a un profile con
 * is_platform_admin=true, THE SYSTEM SHALL responder 404. Se llama desde cada página/Server Action
 * de apps/admin/app/* excepto /login (nunca desde código que ya recibe un userId resuelto — para
 * eso está assertPlatformAdmin).
 */
export async function requirePlatformAdmin() {
  const userId = await getSessionUserId();
  if (!userId) notFound();

  return assertPlatformAdmin(userId);
}
