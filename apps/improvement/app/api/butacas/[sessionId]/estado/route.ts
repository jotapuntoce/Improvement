// GET /api/butacas/<sessionId>/estado — público, sin sesión: el estado de los lugares para el SeatPicker.
// Sin datos de compradores (server/seats/publicState.ts) y sin caché.
import { NextResponse } from "next/server";
import { loadPublicSeatState } from "@/server/seats/publicState.ts";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const state = await loadPublicSeatState(sessionId, new Date());
  const headers = { "Cache-Control": "no-store" };
  if (!state) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } }, { status: 404, headers });
  return NextResponse.json({ ok: true, data: state }, { headers });
}
