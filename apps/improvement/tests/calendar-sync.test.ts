// Conexión con Google y sincronización contra el Supabase de desarrollo, con fetch falso (nunca Google) y
// llave de prueba. Patrón de env de §9: stubEnv → resetModules → import dinámico del módulo bajo prueba.
import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@jotapuntoce/db";
import { calendarConnection, calendarEvent, membership, organization, profile } from "@jotapuntoce/db/schema";
import { decryptToken, encryptToken } from "@/server/calendar/crypto.ts";

const KEY = randomBytes(32).toString("base64");
let sync: typeof import("@/server/calendar/sync.ts");
let runtime: typeof import("@/server/agents/runtime.ts");
let callback: typeof import("@/app/api/calendar/google/callback/route.ts");

beforeAll(async () => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "cid-prueba");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secreto-prueba");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3200");
  vi.resetModules();
  sync = await import("@/server/calendar/sync.ts");
  runtime = await import("@/server/agents/runtime.ts");
  callback = await import("@/app/api/calendar/google/callback/route.ts");
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-gsync", slug: `t-gsync-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
  profileIds.push(userId);
  await db.insert(membership).values({ userId, orgId: o.id, role: "employee", acceptedAt: new Date() });
  return { orgId: o.id, userId };
}

type Reply = { status?: number; json?: unknown };
function fakeFetch(route: (url: URL, body: URLSearchParams) => Reply) {
  const calls: URL[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    const r = route(url, new URLSearchParams(String(init?.body ?? "")));
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

async function connection(orgId: string, userId: string, syncToken: string | null = null) {
  const enc = encryptToken("1//refresh-de-prueba", KEY);
  if (!enc.ok) throw new Error(enc.error.code);
  const [c] = await db.insert(calendarConnection).values({ orgId, userId, refreshTokenEnc: enc.data, syncToken }).returning();
  return c!;
}

const now = new Date("2026-11-18T16:10:00Z");

describe("sync de Google", () => {
  it("WHEN connectGoogle recibe un código válido THE SYSTEM SHALL guardar una conexión activa con el token cifrado", async () => {
    const { orgId, userId } = await org();
    const { impl } = fakeFetch(() => ({ json: { access_token: "acc", refresh_token: "1//refresh-de-prueba" } }));
    expect(await sync.connectGoogle(userId, orgId, "codigo", { fetchImpl: impl })).toEqual({ ok: true, data: null });
    const [row] = await db.select().from(calendarConnection).where(eq(calendarConnection.userId, userId));
    expect(row?.status).toBe("activa");
    expect(row?.refreshTokenEnc.startsWith("v1.")).toBe(true);
    expect(decryptToken(row!.refreshTokenEnc, KEY)).toEqual({ ok: true, data: "1//refresh-de-prueba" });
  });

  it("WHEN listar responde 410 THE SYSTEM SHALL borrar los eventos google y hacer una sincronización completa sin syncToken", async () => {
    const { orgId, userId } = await org();
    const conn = await connection(orgId, userId, "viejo");
    await db.insert(calendarEvent).values({
      orgId,
      userId,
      title: "Viejo",
      startsAt: now,
      endsAt: new Date(now.getTime() + 3_600_000),
      kind: "bloqueo",
      source: "google",
      googleEventId: "viejo-1",
    });
    const { impl, calls } = fakeFetch((url) => {
      if (url.hostname === "oauth2.googleapis.com") return { json: { access_token: "acc" } };
      if (url.searchParams.has("syncToken")) return { status: 410 };
      return {
        json: {
          items: [{ id: "g1", summary: "Cita", start: { dateTime: "2026-11-19T15:00:00Z" }, end: { dateTime: "2026-11-19T16:00:00Z" } }],
          nextSyncToken: "nuevo",
        },
      };
    });
    expect(await sync.syncGoogleFor(conn, now, { fetchImpl: impl })).toBe(true);

    const events = await db.select().from(calendarEvent).where(eq(calendarEvent.userId, userId));
    expect(events.map((e) => [e.googleEventId, e.kind, e.source])).toEqual([["g1", "bloqueo", "google"]]);
    const listCalls = calls.filter((u) => u.hostname === "www.googleapis.com");
    expect(listCalls.map((u) => u.searchParams.get("syncToken"))).toEqual(["viejo", null]);
    expect(Object.fromEntries(listCalls[1]!.searchParams)).toEqual({ singleEvents: "true", maxResults: "250" });
    const [after] = await db.select().from(calendarConnection).where(eq(calendarConnection.id, conn.id));
    expect(after?.syncToken).toBe("nuevo");
    expect(after?.lastSyncedAt?.toISOString()).toBe(now.toISOString());
  });

  it("WHEN renovar el token responde 400 THE SYSTEM SHALL dejar la conexión en error", async () => {
    const { orgId, userId } = await org();
    const conn = await connection(orgId, userId);
    const { impl } = fakeFetch(() => ({ status: 400, json: { error: "invalid_grant" } }));
    expect(await sync.syncGoogleFor(conn, now, { fetchImpl: impl })).toBe(false);
    const [after] = await db.select().from(calendarConnection).where(eq(calendarConnection.id, conn.id));
    expect(after?.status).toBe("error");
  });

  it("WHEN el callback trae un state distinto de la cookie THE SYSTEM SHALL redirigir con google=error sin escribir", async () => {
    const { orgId } = await org();
    const req = new NextRequest(`http://localhost:3200/api/calendar/google/callback?code=c&state=otro.${orgId}`, {
      headers: { cookie: `od-google-state=${crypto.randomUUID()}.${orgId}` },
    });
    const res = await callback.GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://localhost:3200/${orgId}/agenda?google=error`);
    expect(await db.select().from(calendarConnection).where(and(eq(calendarConnection.orgId, orgId)))).toEqual([]);
  });

  it("WHEN runTarea('google') corre sin conexiones activas THE SYSTEM SHALL devolver procesadas 0", async () => {
    const { orgId } = await org();
    expect(await runtime.runTarea("google", now, { orgId })).toEqual({ procesadas: 0 });
  });
});
