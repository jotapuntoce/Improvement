// GET /api/improvement/history?orgId=… — el historial completo: vueltas, hilo y fase actual.
//
// Una sola ruta para las tres cosas porque la pantalla las pide siempre juntas: enseñar el hilo
// sin la fase activa deja al dueño leyendo una propuesta sin saber que está esperando su
// respuesta, y enseñar las vueltas sin el hilo deja los "por qué" fuera.
//
// Los ciclos que devuelve son solo los del dueño de la sesión — el filtro vive dentro de
// listCycles/listConversation, no aquí (convención de la casa: el alcance se resuelve adentro).
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import { listConversation } from "@/server/improvement/chat";
import { activeCycle, listCycleEvents, listCycles } from "@/server/improvement/motor";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Inicia sesión." } },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const orgId = z.uuid().safeParse(url.searchParams.get("orgId"));
  if (!orgId.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Falta orgId." } },
      { status: 400 },
    );
  }

  const [cycles, messages, activo] = await Promise.all([
    listCycles(userId, orgId.data),
    listConversation(userId, orgId.data),
    activeCycle(userId, orgId.data),
  ]);

  // El log solo de la vuelta viva: el de las cerradas es historia que nadie mira desde esta
  // pantalla, y traerlo todo haría crecer la respuesta sin que nada la use.
  const events = activo ? await listCycleEvents(userId, orgId.data, activo.id) : [];

  return NextResponse.json({
    ok: true,
    data: {
      cycles,
      messages,
      events,
      activePhase: activo?.phase ?? null,
      activeCycleId: activo?.id ?? null,
    },
  });
}
