// Cadencia del worker (puro). Mismo conjunto que TAREAS de apps/improvement/server/agents/tareas.ts;
// tests/schedule.test.ts falla si difieren.
export const TAREAS_WORKER = ["heartbeat", "encargos", "reporte", "agenda", "google", "butacas"] as const;
export type TareaWorker = (typeof TAREAS_WORKER)[number];

/** Cada minuto heartbeat, encargos y butacas; google cada 5; agenda y reporte cada 15. Orden de TAREAS_WORKER. */
export function tareasDue(now: Date): TareaWorker[] {
  const m = now.getUTCMinutes();
  const due: Record<TareaWorker, boolean> = {
    heartbeat: true,
    encargos: true,
    reporte: m % 15 === 0,
    agenda: m % 15 === 0,
    google: m % 5 === 0,
    butacas: true,
  };
  return TAREAS_WORKER.filter((t) => due[t]);
}
