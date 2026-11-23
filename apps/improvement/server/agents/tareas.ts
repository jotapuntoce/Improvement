// Contrato con el worker de apps/agentes: las tareas que puede pedir por POST /api/agentes/<tarea>.
// Puro y sin imports — la prueba de contrato del worker (paso 23) lo lee tal cual.
export const TAREAS = ["heartbeat", "encargos", "reporte", "agenda", "google", "butacas"] as const;
export type Tarea = (typeof TAREAS)[number];
