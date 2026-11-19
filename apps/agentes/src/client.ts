// Cliente HTTP del worker: POST /api/agentes/<tarea> con el bearer. Nunca lanza.
import type { TareaWorker } from "./schedule.ts";

export type Config = { ok: true; baseUrl: string; secret: string } | { ok: false; missing: string[] };

export function readConfig(env: Record<string, string | undefined>): Config {
  const baseUrl = env.IMPROVEMENT_API_URL?.trim();
  const secret = env.AGENTS_API_SECRET?.trim();
  if (!baseUrl || !secret) {
    return { ok: false, missing: [!baseUrl && "IMPROVEMENT_API_URL", !secret && "AGENTS_API_SECRET"].filter((x): x is string => !!x) };
  }
  return { ok: true, baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

export async function callTarea(
  config: { baseUrl: string; secret: string },
  tarea: TareaWorker,
  fetchImpl: typeof fetch = fetch,
): Promise<{ tarea: TareaWorker; ok: boolean; status: number }> {
  try {
    const res = await fetchImpl(`${config.baseUrl}/api/agentes/${tarea}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.secret}` },
      signal: AbortSignal.timeout(55_000),
    });
    return { tarea, ok: res.ok, status: res.status };
  } catch {
    return { tarea, ok: false, status: 0 };
  }
}
