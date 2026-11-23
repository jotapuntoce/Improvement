// Cliente de Google con un fetch falso que registra URL, método y cuerpo. Nunca habla con Google.
import { describe, expect, it } from "vitest";
import { exchangeCode, googleAuthUrl, listEvents, refreshAccessToken } from "@/server/calendar/google.ts";

type Call = { url: string; method: string; body: string };
function fakeFetch(responses: { status?: number; json?: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: String(init?.body ?? "") });
    const r = responses[calls.length - 1] ?? { status: 500 };
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("google", () => {
  it("WHEN googleAuthUrl corre THE SYSTEM SHALL pedir acceso offline, consentimiento y los dos scopes", () => {
    const url = new URL(googleAuthUrl({ clientId: "cid", redirectUri: "http://localhost:3200/api/calendar/google/callback", state: "s" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy",
    ]);
  });

  it("WHEN exchangeCode corre THE SYSTEM SHALL hacer POST al endpoint de token con grant_type=authorization_code", async () => {
    const { impl, calls } = fakeFetch([{ json: { access_token: "a", refresh_token: "r" } }]);
    const r = await exchangeCode({ code: "c", clientId: "cid", clientSecret: "sec", redirectUri: "http://x/cb" }, impl);
    expect(r).toEqual({ ok: true, data: { access_token: "a", refresh_token: "r" } });
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(calls[0]?.method).toBe("POST");
    expect(new URLSearchParams(calls[0]?.body).get("grant_type")).toBe("authorization_code");
  });

  it("WHEN renovar responde 400 THE SYSTEM SHALL devolver INVALID_GRANT", async () => {
    const { impl } = fakeFetch([{ status: 400, json: { error: "invalid_grant" } }]);
    expect(await refreshAccessToken({ refreshToken: "r", clientId: "cid", clientSecret: "sec" }, impl)).toMatchObject({
      ok: false,
      error: { code: "INVALID_GRANT" },
    });
  });

  it("WHEN listEvents recibe dos páginas THE SYSTEM SHALL juntar los eventos y devolver el nextSyncToken de la última", async () => {
    const { impl, calls } = fakeFetch([
      { json: { items: [{ id: "e1" }], nextPageToken: "p2" } },
      { json: { items: [{ id: "e2" }], nextSyncToken: "sync-2" } },
    ]);
    const r = await listEvents({ accessToken: "a", calendarId: "primary", syncToken: "sync-1" }, impl);
    expect(r).toEqual({ ok: true, data: { items: [{ id: "e1" }, { id: "e2" }], nextSyncToken: "sync-2" } });
    const second = new URL(calls[1]!.url);
    expect(second.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(Object.fromEntries(second.searchParams)).toEqual({ singleEvents: "true", maxResults: "250", syncToken: "sync-1", pageToken: "p2" });
  });

  it("WHEN listEvents recibe un 410 THE SYSTEM SHALL devolver SYNC_TOKEN_GONE sin lanzar", async () => {
    const { impl } = fakeFetch([{ status: 410 }]);
    expect(await listEvents({ accessToken: "a", calendarId: "primary", syncToken: "viejo" }, impl)).toMatchObject({
      ok: false,
      error: { code: "SYNC_TOKEN_GONE" },
    });
  });
});
