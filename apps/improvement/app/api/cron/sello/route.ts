// GET /api/cron/sello — invocado por Vercel Cron (vercel.json) una vez al día. Sin sesión de usuario:
// la autenticación es el bearer CRON_SECRET, igual que app/api/cron/reminders/route.ts.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runSealCycle } from "@/server/seal/vigencia";

export async function GET(request: Request) {
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true, data: await runSealCycle() });
}
