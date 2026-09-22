// GET /api/improvement/analytics?orgId=… — qué tan bien está dirigiendo Improvement.
//
// Solo el dueño. loadAnalytics devuelve el tablero en ceros a quien no lo es (el alcance se
// resuelve adentro), así que esta ruta no repite el filtro: repetirlo sería una segunda regla que
// puede desincronizarse de la primera.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import { loadAnalytics } from "@/server/improvement/analytics";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Inicia sesión." } },
      { status: 401 },
    );
  }

  const orgId = z.uuid().safeParse(new URL(request.url).searchParams.get("orgId"));
  if (!orgId.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Falta orgId." } },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, data: await loadAnalytics(userId, orgId.data) });
}
