// GET /api/cron/revisiones — el agente revisor. Mismo contrato que /api/cron/reminders: sin sesión
// de usuario, la autenticación es el bearer CRON_SECRET (blueprint §12). No corre en nombre de
// nadie, así que nunca llama a requireOrgMembership.
//
// Es un cron y no un botón a propósito: la revisión de una entrega es posterior y asíncrona. Quien
// da por terminado un objetivo no espera a que un modelo conteste, y su puntaje no depende de eso.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { reviewPendingObjectives } from "@/server/ai/gateway";

export async function GET(request: Request) {
  const cronSecret = env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } },
      { status: 401 },
    );
  }

  const data = await reviewPendingObjectives();
  return NextResponse.json({ ok: true, data });
}
