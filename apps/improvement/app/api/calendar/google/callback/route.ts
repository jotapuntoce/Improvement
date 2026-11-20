// GET /api/calendar/google/callback?code&state — Google regresa aquí. Si el `state` no coincide con la cookie
// od-google-state no se toca la base; si coincide, se guarda la conexión cifrada. La cookie se borra siempre.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { connectGoogle } from "@/server/calendar/sync.ts";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  const orgId = state.split(".")[1] ?? "";
  // El orgId solo arma la ruta de regreso; si no es un uuid, se vuelve a la raíz (sin redirección abierta).
  const back = (result: "ok" | "error") =>
    new URL(z.uuid().safeParse(orgId).success ? `/${orgId}/agenda?google=${result}` : "/", request.url);

  const expected = request.cookies.get("od-google-state")?.value;
  let result: "ok" | "error" = "error";
  if (expected && state === expected && code) {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.redirect(new URL("/login", request.url));
    result = (await connectGoogle(userId, orgId, code)).ok ? "ok" : "error";
  }
  const res = NextResponse.redirect(back(result));
  res.cookies.delete("od-google-state");
  return res;
}
