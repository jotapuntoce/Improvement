// GET /api/cron/salud — Vercel Cron (vercel.json) una vez al día, 7:30 CDMX. Recalcula la salud de
// los clientes por su actividad (server/insights/health.ts). Sin sesión: la autenticación es el
// bearer CRON_SECRET, igual que /api/cron/automatizaciones; nunca corre en nombre de nadie.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { recomputeClientHealth } from "@/server/insights/health.ts";

export async function GET(request: Request) {
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } }, { status: 401 });
  }
  return NextResponse.json({ ok: true, data: await recomputeClientHealth() });
}
