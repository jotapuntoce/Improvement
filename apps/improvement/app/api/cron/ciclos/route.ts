// GET /api/cron/ciclos — el motor de las siete fases.
//
// Mismo contrato que /api/cron/reminders y /api/cron/revisiones: sin sesión de usuario, la
// autenticación es el bearer CRON_SECRET (blueprint §12). No corre en nombre de nadie, así que
// nunca llama a requireOrgMembership — cada ciclo lleva su propio orgId y ownerId, y todo lo que
// lee y escribe va filtrado por ellos.
//
// UNA VEZ AL DÍA, no cada seis horas como pedía el plan — y no es una preferencia: el plan de
// Vercel de este proyecto solo admite cron diario, y un `schedule` más frecuente hace fallar el
// deploy entero (es lo que ya pasó con el revisor, commit 4a5a0d2). Se programa a las 15:00 UTC,
// dos horas después del revisor, para que las dos corridas no compitan por el mismo minuto.
//
// Lo que se pierde con el ritmo diario: una vuelta completa tarda unos cinco días en vez de dos.
// Lo que lo compensa: el dueño puede empujar su vuelta cuando quiera con el botón de la pantalla
// de Improvement (nudgeCycle), que corre exactamente el mismo advanceCycle que este cron. El día
// que el proyecto pase a un plan con cron sub-diario, aquí y en vercel.json se cambia el horario
// y nada más.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processCycles } from "@/server/improvement/motor";

export async function GET(request: Request) {
  const cronSecret = env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } },
      { status: 401 },
    );
  }

  const data = await processCycles();
  return NextResponse.json({ ok: true, data });
}
