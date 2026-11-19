// Cliente de Google Calendar con `fetch` directo (sin googleapis). Cada función recibe `fetchImpl` para las
// pruebas y devuelve un resultado tipado; nunca lanza. Endpoints: blueprint §5. Ningún secreto sale de aquí.

type Fetch = typeof fetch;
type GoogleErrorCode = "SYNC_TOKEN_GONE" | "INVALID_GRANT" | "HTTP_ERROR" | "NETWORK_ERROR";
export type GoogleResult<T> = { ok: true; data: T } | { ok: false; error: { code: GoogleErrorCode; message: string; status?: number } };

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events";

async function call<T>(fetchImpl: Fetch, url: string, init: RequestInit, onError?: (status: number) => GoogleErrorCode | null): Promise<GoogleResult<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch {
    return { ok: false, error: { code: "NETWORK_ERROR", message: "Google no respondió." } };
  }
  if (!res.ok) {
    const code = onError?.(res.status) ?? "HTTP_ERROR";
    return { ok: false, error: { code, message: `Google respondió ${res.status}.`, status: res.status } };
  }
  const text = await res.text().catch(() => "");
  try {
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  } catch {
    return { ok: false, error: { code: "HTTP_ERROR", message: "Respuesta de Google ilegible.", status: res.status } };
  }
}

const form = (body: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(body).toString(),
});
const bearer = (accessToken: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...init.headers },
});
const cal = (calendarId: string) => `${API}/calendars/${encodeURIComponent(calendarId)}/events`;

export function googleAuthUrl({ clientId, redirectUri, state }: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPE,
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string };

export function exchangeCode(
  { code, clientId, clientSecret, redirectUri }: { code: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchImpl: Fetch = fetch,
) {
  return call<Tokens>(fetchImpl, TOKEN_URL, form({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }));
}

/** Un 400 (`invalid_grant`: el usuario revocó el acceso) → `INVALID_GRANT`. */
export function refreshAccessToken(
  { refreshToken, clientId, clientSecret }: { refreshToken: string; clientId: string; clientSecret: string },
  fetchImpl: Fetch = fetch,
) {
  return call<Tokens>(
    fetchImpl,
    TOKEN_URL,
    form({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
    (s) => (s === 400 ? "INVALID_GRANT" : null),
  );
}

export function revokeToken(token: string, fetchImpl: Fetch = fetch) {
  return call<Record<string, never>>(fetchImpl, REVOKE_URL, form({ token }));
}

export function freeBusy(
  { accessToken, timeMin, timeMax, calendarId }: { accessToken: string; timeMin: string; timeMax: string; calendarId: string },
  fetchImpl: Fetch = fetch,
) {
  return call<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(
    fetchImpl,
    `${API}/freeBusy`,
    bearer(accessToken, { method: "POST", body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }) }),
  );
}

export function insertEvent(
  { accessToken, calendarId, summary, start, end }: { accessToken: string; calendarId: string; summary: string; start: string; end: string },
  fetchImpl: Fetch = fetch,
) {
  return call<GoogleEvent>(
    fetchImpl,
    cal(calendarId),
    bearer(accessToken, { method: "POST", body: JSON.stringify({ summary, start: { dateTime: start }, end: { dateTime: end } }) }),
  );
}

/** Recorre todas las páginas; un 410 (syncToken vencido) → `SYNC_TOKEN_GONE`. */
export async function listEvents(
  { accessToken, calendarId, syncToken }: { accessToken: string; calendarId: string; syncToken?: string | null },
  fetchImpl: Fetch = fetch,
): Promise<GoogleResult<{ items: GoogleEvent[]; nextSyncToken: string | null }>> {
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (;;) {
    const q = new URLSearchParams({ singleEvents: "true", maxResults: "250" });
    if (syncToken) q.set("syncToken", syncToken);
    if (pageToken) q.set("pageToken", pageToken);
    const page = await call<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
      fetchImpl,
      `${cal(calendarId)}?${q.toString()}`,
      bearer(accessToken, { method: "GET" }),
      (s) => (s === 410 ? "SYNC_TOKEN_GONE" : null),
    );
    if (!page.ok) return page;
    items.push(...(page.data.items ?? []));
    if (!page.data.nextPageToken) return { ok: true, data: { items, nextSyncToken: page.data.nextSyncToken ?? null } };
    pageToken = page.data.nextPageToken;
  }
}
