// Conexión con Google Calendar y las dos tareas de sistema del runtime (agenda, google). connect/disconnect
// actúan en nombre del usuario (membresía primero); syncAllGoogle y rescheduleAll no corren en nombre de nadie
// y solo las llama runTarea. El refresh token se descifra únicamente aquí.
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { calendarConnection, calendarEvent } from "@jotapuntoce/db/schema";
import { requireEnv } from "../../lib/env.ts";
import { findMembership } from "../auth/guard.ts";
import { decryptToken, encryptToken } from "./crypto.ts";
import { rescheduleMine } from "./events.ts";
import { exchangeCode, listEvents, refreshAccessToken, revokeToken, type GoogleEvent } from "./google.ts";

interface Deps {
  fetchImpl?: typeof fetch;
  /** Acota el trabajo a un org (lo usan las pruebas contra la base compartida). */
  orgId?: string;
}
type Connection = typeof calendarConnection.$inferSelect;
type Failure = { ok: false; error: { code: "NOT_FOUND" | "NO_REFRESH_TOKEN" | "GOOGLE_ERROR"; message: string } };
const notFound: Failure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };
const googleError = (message: string): Failure => ({ ok: false, error: { code: "GOOGLE_ERROR", message } });

const key = () => requireEnv("TOKEN_ENCRYPTION_KEY");
const client = () => ({ clientId: requireEnv("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET") });
export const googleRedirectUri = () => `${requireEnv("NEXT_PUBLIC_APP_URL")}/api/calendar/google/callback`;

export async function connectGoogle(userId: string, orgId: string, code: string, deps: Deps = {}) {
  if (!(await findMembership(userId, orgId))) return notFound;
  const tokens = await exchangeCode({ code, ...client(), redirectUri: googleRedirectUri() }, deps.fetchImpl);
  if (!tokens.ok) return googleError(tokens.error.message);
  if (!tokens.data.refresh_token) {
    return { ok: false as const, error: { code: "NO_REFRESH_TOKEN" as const, message: "Google no entregó acceso permanente; vuelve a conectar." } };
  }
  const enc = encryptToken(tokens.data.refresh_token, key());
  if (!enc.ok) return googleError(enc.error.message);
  const values = { orgId, refreshTokenEnc: enc.data, status: "activa" as const, syncToken: null, updatedAt: new Date() };
  await db
    .insert(calendarConnection)
    .values({ ...values, userId })
    .onConflictDoUpdate({ target: calendarConnection.userId, set: values });
  return { ok: true as const, data: null };
}

async function dropGoogleEvents(userId: string) {
  await db.delete(calendarEvent).where(and(eq(calendarEvent.userId, userId), eq(calendarEvent.source, "google")));
}

export async function disconnectGoogle(userId: string, orgId: string, deps: Deps = {}) {
  if (!(await findMembership(userId, orgId))) return notFound;
  const [conn] = await db
    .select()
    .from(calendarConnection)
    .where(and(eq(calendarConnection.userId, userId), eq(calendarConnection.orgId, orgId)));
  if (!conn) return notFound;
  const token = decryptToken(conn.refreshTokenEnc, key());
  if (token.ok) await revokeToken(token.data, deps.fetchImpl); // si Google falla, igual se borra aquí
  await db.delete(calendarConnection).where(eq(calendarConnection.id, conn.id));
  await dropGoogleEvents(userId);
  return { ok: true as const, data: null };
}

// Un evento de día completo trae `date`: se toma la medianoche local (UTC-6 fijo, ver reschedule.ts).
const when = (t?: { dateTime?: string; date?: string }) => (t?.dateTime ? new Date(t.dateTime) : t?.date ? new Date(`${t.date}T00:00:00-06:00`) : null);

async function applyEvents(conn: Connection, items: GoogleEvent[]) {
  for (const item of items) {
    if (item.status === "cancelled") {
      await db.delete(calendarEvent).where(and(eq(calendarEvent.userId, conn.userId), eq(calendarEvent.googleEventId, item.id)));
      continue;
    }
    const startsAt = when(item.start);
    const endsAt = when(item.end);
    if (!startsAt || !endsAt || endsAt <= startsAt) continue;
    const set = { title: (item.summary ?? "Ocupado").slice(0, 200), startsAt, endsAt, updatedAt: new Date() };
    await db
      .insert(calendarEvent)
      .values({ ...set, orgId: conn.orgId, userId: conn.userId, kind: "bloqueo", source: "google", googleEventId: item.id })
      .onConflictDoUpdate({
        target: [calendarEvent.userId, calendarEvent.googleEventId],
        targetWhere: sql`google_event_id is not null`,
        set,
      });
  }
}

/** Sincroniza una conexión. Devuelve true si quedó sincronizada. */
export async function syncGoogleFor(conn: Connection, now: Date, deps: Deps = {}): Promise<boolean> {
  const markError = () => db.update(calendarConnection).set({ status: "error", updatedAt: now }).where(eq(calendarConnection.id, conn.id));
  const refresh = decryptToken(conn.refreshTokenEnc, key());
  if (!refresh.ok) {
    await markError();
    return false;
  }
  const access = await refreshAccessToken({ refreshToken: refresh.data, ...client() }, deps.fetchImpl);
  if (!access.ok) {
    if (access.error.code === "INVALID_GRANT") await markError(); // el usuario revocó el acceso: pedir reconectar
    return false;
  }
  const params = { accessToken: access.data.access_token, calendarId: conn.calendarId };
  let list = await listEvents({ ...params, syncToken: conn.syncToken }, deps.fetchImpl);
  if (!list.ok && list.error.code === "SYNC_TOKEN_GONE") {
    await dropGoogleEvents(conn.userId);
    list = await listEvents(params, deps.fetchImpl); // sincronización completa, mismos parámetros sin syncToken
  }
  if (!list.ok) return false;
  await applyEvents(conn, list.data.items);
  await db
    .update(calendarConnection)
    .set({ syncToken: list.data.nextSyncToken, lastSyncedAt: now, updatedAt: now })
    .where(eq(calendarConnection.id, conn.id));
  return true;
}

export async function syncAllGoogle(now: Date, deps: Deps = {}): Promise<{ procesadas: number }> {
  const conns = await db
    .select()
    .from(calendarConnection)
    .where(and(eq(calendarConnection.status, "activa"), deps.orgId ? eq(calendarConnection.orgId, deps.orgId) : undefined))
    .orderBy(sql`${calendarConnection.lastSyncedAt} asc nulls first`)
    .limit(10);
  let procesadas = 0;
  for (const conn of conns) if (await syncGoogleFor(conn, now, deps)) procesadas++;
  return { procesadas };
}

export async function rescheduleAll(now: Date, deps: Deps = {}): Promise<{ procesadas: number }> {
  const users = await db
    .selectDistinct({ userId: calendarEvent.userId, orgId: calendarEvent.orgId })
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.kind, "tarea"),
        eq(calendarEvent.status, "pendiente"),
        lte(calendarEvent.endsAt, now),
        deps.orgId ? eq(calendarEvent.orgId, deps.orgId) : undefined,
      ),
    )
    .orderBy(asc(calendarEvent.userId))
    .limit(50);
  let procesadas = 0;
  for (const u of users) if ((await rescheduleMine(u.userId, u.orgId, now)).ok) procesadas++;
  return { procesadas };
}
