// GET /api/cron/sello — invocado por Vercel Cron (vercel.json) una vez al día. Sin sesión de usuario:
// la autenticación es el bearer CRON_SECRET, igual que app/api/cron/reminders/route.ts. Primero la vigencia
// del Sello y después las propuestas de especialista, que leen los puntajes recién calculados.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runSealCycle } from "@/server/seal/vigencia";
import { generateProposals } from "@/server/sinapsis/proposals";

export async function GET(request: Request) {
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } },
      { status: 401 },
    );
  }
  const now = new Date();
  const cycle = await runSealCycle({ now });
  const proposals = await generateProposals({ now });
  return NextResponse.json({ ok: true, data: { ...cycle, proposals } });
}
