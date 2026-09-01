// GET /api/cron/reminders — invocado por Vercel Cron (vercel.json) cada 15 minutos. Sin sesión de
// usuario: la autenticación es el bearer CRON_SECRET (regla de la tabla de protección de rutas,
// blueprint §12) — nunca requireOrgMembership, esto no corre en nombre de nadie.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { deliverDueReminders } from "@/server/reminders/deliver";

/**
 * WHEN GET /api/cron/reminders llega sin el header Authorization correcto THE SYSTEM SHALL
 * devolver 401 y no marcar ningún delivered_at (criterio #1) — si CRON_SECRET no está configurada,
 * la request se rechaza siempre, nunca se trata un header ausente como "coincide con nada".
 */
export async function GET(request: Request) {
  const cronSecret = env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } },
      { status: 401 },
    );
  }

  const { delivered } = await deliverDueReminders();
  return NextResponse.json({ ok: true, data: { delivered } });
}
