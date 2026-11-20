// GET /api/calendar/google/connect?org=<orgId> — manda al usuario a autorizar Google Calendar. El `state`
// (<uuid>.<orgId>) viaja también en una cookie httpOnly; el callback rechaza cualquier otro.
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEnv } from "@/lib/env.ts";
import { findMembership, getSessionUserId } from "@/server/auth/guard.ts";
import { googleRedirectUri } from "@/server/calendar/sync.ts";
import { googleAuthUrl } from "@/server/calendar/google.ts";

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("org") ?? "";
  const userId = await getSessionUserId();
  if (!userId || !z.uuid().safeParse(orgId).success || !(await findMembership(userId, orgId))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const state = `${randomUUID()}.${orgId}`;
  const res = NextResponse.redirect(googleAuthUrl({ clientId: requireEnv("GOOGLE_OAUTH_CLIENT_ID"), redirectUri: googleRedirectUri(), state }));
  res.cookies.set("od-google-state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
