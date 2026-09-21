// Cómo va cada persona del equipo. Módulo PURO: sin base de datos, para que la regla se pueda
// probar sin una empresa de por medio (mismo patrón que building/buildingGraph.ts).
// employees/loadTeamStatus.ts es quien lo alimenta con datos reales.
//
// Antes se llamaba sceneGraph.ts y repartía posiciones en un espacio 3D para el panel viejo. Ese
// panel y su escena ya no existen; de todo aquello sobrevivió lo único que alguien mira hoy — el
// estado de cada quien, que es el color del marco de su retrato en el muro de la recepción.
export type PersonStatus = "alerta" | "activo" | "ok";

export interface TeamObjectiveInput {
  status: string;
  dueDate: Date;
}

/**
 * WHEN una persona tiene al menos un objetivo con due_date pasado y status != 'completed' THE
 * SYSTEM SHALL marcarla en alerta (criterio #2) — alerta tiene prioridad sobre activo: un objetivo
 * vencido importa más que uno en curso.
 */
export function deriveStatus(objectives: TeamObjectiveInput[]): PersonStatus {
  const now = new Date();
  const hasOverdue = objectives.some((o) => o.status !== "completed" && o.dueDate < now);
  if (hasOverdue) return "alerta";

  const hasInProgress = objectives.some((o) => o.status === "in_progress");
  if (hasInProgress) return "activo";

  return "ok";
}
