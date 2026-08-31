// El único guard de autorización de apps/improvement — todo Server Component/Server Action que
// toca datos de un org empieza llamando requireOrgMembership() (.claude/rules). RLS en Postgres es
// la segunda capa, nunca la única (misma regla).
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership } from "@jotapuntoce/db/schema";
import { env } from "../../lib/env.ts";

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
async function getSessionUserId(): Promise<string | null> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  if (!accessToken) return null;

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Guard de tenencia: WHEN no hay sesión, o la sesión no tiene membership en `orgId`, THE SYSTEM
 * SHALL responder 404 (nunca 403 — un 403 confirma que el org existe a alguien que no debería
 * saberlo). Retorna la fila de membership cuando sí pertenece.
 */
export async function requireOrgMembership(orgId: string) {
  const userId = await getSessionUserId();
  if (!userId) notFound();

  const row = await findMembership(userId, orgId);
  if (!row) notFound();

  return row;
}
