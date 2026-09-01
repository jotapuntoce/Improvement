// GET /api/health — sin sesión, sin CRON_SECRET: endpoint de monitoreo público (solo ok/down, sin
// datos de ningún org). Verifica conectividad real a DATABASE_URL con un SELECT trivial.
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { log, newRequestId } from "@/lib/logger";

export async function pingDatabase(): Promise<void> {
  await db.execute(sql`select 1`);
}

/**
 * WHEN se detiene la conectividad a la base de datos THE SYSTEM SHALL responder /api/health con
 * status distinto de 200 (criterio #1). `deps.ping` es inyectable solo para
 * tests/health.test.ts — Next nunca lo pasa en producción, así que ahí siempre corre pingDatabase().
 */
export async function GET(_request: Request, deps: { ping?: () => Promise<void> } = {}) {
  const ping = deps.ping ?? pingDatabase;
  const requestId = newRequestId();
  const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

  log("health_check_started", { request_id: requestId });

  try {
    await ping();
    log("health_check_ok", { request_id: requestId });
    return NextResponse.json({ ok: true, db: "up", buildSha });
  } catch (err) {
    log(
      "health_check_failed",
      { request_id: requestId, error: err instanceof Error ? err.message : String(err) },
      "error",
    );
    return NextResponse.json({ ok: false, db: "down", buildSha }, { status: 503 });
  }
}
