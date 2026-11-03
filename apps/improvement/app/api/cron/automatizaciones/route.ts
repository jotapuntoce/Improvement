// GET /api/cron/automatizaciones — Vercel Cron (vercel.json) una vez al día, 7:00 CDMX. Corre los
// disparadores de fecha y de "sin actividad". Sin sesión: la autenticación es el bearer CRON_SECRET,
// igual que /api/cron/reminders; nunca corre en nombre de nadie.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runTimeTriggers } from "@/server/automations/engine.ts";

export async function GET(request: Request) {
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } }, { status: 401 });
  }
  return NextResponse.json({ ok: true, data: await runTimeTriggers() });
}
