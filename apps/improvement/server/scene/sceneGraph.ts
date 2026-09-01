// Grafo de la escena 3D — funciones puras, sin acceso a datos (regla: testeables sin DOM, sin
// Canvas, sin jsdom). server/scene/loadDashboardScene.ts es quien las alimenta con datos reales.
export type AvatarStatus = "alerta" | "activo" | "ok";

export interface SceneAreaInput {
  id: string;
  name: string;
  color: string;
}

export interface SceneObjectiveInput {
  status: string;
  dueDate: Date;
}

export interface SceneEmployeeInput {
  id: string;
  name: string;
  objectives: SceneObjectiveInput[];
}

export interface SceneZone {
  id: string;
  name: string;
  color: string;
  position: [number, number, number];
}

export interface SceneAvatar {
  id: string;
  name: string;
  status: AvatarStatus;
  position: [number, number, number];
}

export interface SceneGraph {
  zones: SceneZone[];
  avatars: SceneAvatar[];
}

const ZONE_SPACING = 6;
const AVATAR_SPACING = 3;
const AVATAR_ROW_Z = 5;

function centeredPosition(index: number, count: number, spacing: number, z: number): [number, number, number] {
  return [index * spacing - ((count - 1) * spacing) / 2, 0, z];
}

/**
 * WHEN buildSceneGraph recibe 3 áreas y 5 empleados THE SYSTEM SHALL devolver zones.length === 3 y
 * avatars.length === 5 (criterio #1) — layout determinista, formas procedurales simples, sin arte
 * custom.
 */
export function buildSceneGraph(areas: SceneAreaInput[], employees: SceneEmployeeInput[]): SceneGraph {
  const zones: SceneZone[] = areas.map((a, i) => ({
    id: a.id,
    name: a.name,
    color: a.color,
    position: centeredPosition(i, areas.length, ZONE_SPACING, 0),
  }));

  const avatars: SceneAvatar[] = employees.map((e, i) => ({
    id: e.id,
    name: e.name,
    status: deriveAvatarStatus(e.objectives),
    position: centeredPosition(i, employees.length, AVATAR_SPACING, AVATAR_ROW_Z),
  }));

  return { zones, avatars };
}

/**
 * WHEN un empleado tiene al menos un objetivo con due_date pasado y status != 'completed' THE
 * SYSTEM SHALL marcar su avatar con estado alerta (criterio #2) — alerta tiene prioridad sobre
 * activo: un objetivo vencido importa más que uno en curso.
 */
function deriveAvatarStatus(objectives: SceneObjectiveInput[]): AvatarStatus {
  const now = new Date();
  const hasOverdue = objectives.some((o) => o.status !== "completed" && o.dueDate < now);
  if (hasOverdue) return "alerta";

  const hasInProgress = objectives.some((o) => o.status === "in_progress");
  if (hasInProgress) return "activo";

  return "ok";
}

/**
 * WHEN shouldAutoRotate(true) se llama THE SYSTEM SHALL devolver false (criterio #3) — la cámara
 * no rota sola si el visitante pidió prefers-reduced-motion. La lectura de esa preferencia ocurre
 * en Scene3D.tsx (solo ahí hay `window`); esta función es la decisión pura, testeable sin montar
 * nada.
 */
export function shouldAutoRotate(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion;
}
