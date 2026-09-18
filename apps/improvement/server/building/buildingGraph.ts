// Lógica pura de layout del edificio — sin acceso a datos (mismo patrón que
// server/scene/sceneGraph.ts). server/building/loadBuilding.ts alimenta esto con datos reales.
export type SilhouetteKind = "plan" | "sol" | "imag" | "valor" | "brand" | "pres" | "generica";

export interface BuildingAreaInput {
  id: string;
  name: string;
  color: string;
  silhouette?: SilhouetteKind;
}

export interface BuildingOrgInput {
  name: string;
  slogan: string | null;
  accentColor: string | null;
  industry: string | null;
}

export interface BuildingArea {
  id: string;
  name: string;
  color: string;
  cells: [number, number][];
  silhouette?: SilhouetteKind;
}

export interface BuildingGraph {
  companyName: string;
  slogan: string | null;
  accentColor: string | null;
  industry: string | null;
  areas: BuildingArea[];
  /**
   * En qué etapa del mapa de construcción va la empresa, 1 a 8 — derivado de org_build_stage, la
   * MISMA fuente que el tracker del panel. El edificio dibuja la escena de esta etapa (ver
   * ESCENAS en packages/ui/src/building/Building.tsx): los dos no pueden decir cosas distintas
   * porque leen la misma fila.
   */
  stageOrder: number;
  /** El nombre de la etapa en curso, o null si el mapa de construcción todavía no arranca. */
  stageLabel: string | null;
}

/** Las 8 fases de BUILD_STAGES. Solo se usa como default cuando una empresa no tiene mapa. */
const TOTAL_STAGES = 8;

const WINDOWS_PER_AREA = 3;
const BUILDING_ROWS = 8;
const BUILDING_COLS = 9;

// mulberry32 — mismo PRNG determinista ya usado en apps/admin/components/building/JotaPuntoCeBuilding.js
// para las estrellas y el parpadeo ambiente. Necesario aquí por el mismo motivo: server y cliente
// deben calcular exactamente el mismo layout, o hay mismatch de hidratación.
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// djb2 — hash de string a entero, determinista, solo para derivar un seed estable por organización
// (mismo layout en cada carga, distinto entre organizaciones distintas).
function hashSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * WHEN distributeCells recibe N areaIds THE SYSTEM SHALL devolver N grupos de celdas
 * (row, col) sin celdas repetidas entre grupos (criterio #1), determinista para el mismo seed
 * (criterio #2), y reduce windowsPerArea en vez de fallar si no caben todas (criterio #3).
 */
export function distributeCells(
  areaIds: string[],
  rows: number,
  cols: number,
  windowsPerArea: number,
  seed: number,
): { id: string; cells: [number, number][] }[] {
  if (areaIds.length === 0) return [];

  const totalCells = rows * cols;
  const perArea = Math.max(1, Math.min(windowsPerArea, Math.floor(totalCells / areaIds.length)));

  const allCells: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) allCells.push([r, c]);
  }

  const rand = mulberry32(seed);
  for (let i = allCells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = allCells[i]!;
    allCells[i] = allCells[j]!;
    allCells[j] = temp;
  }

  return areaIds.map((id, i): { id: string; cells: [number, number][] } => ({
    id,
    cells: allCells.slice(i * perArea, i * perArea + perArea) as Array<[number, number]>,
  }));
}

/**
 * WHEN buildBuildingGraph recibe una organización y sus áreas THE SYSTEM SHALL devolver un
 * BuildingGraph con un area por cada fila de entrada, cada una con su color real y su propio grupo
 * de cells (criterio #1) — mismo layout en llamadas repetidas para la misma organización
 * (criterio #2, vía hashSeed determinista sobre el nombre).
 */
export interface CurrentStage {
  order: number;
  name: string | null;
}

/**
 * En qué etapa va la empresa, como el número de etapa (1 a 8) y su nombre.
 *
 * Misma prioridad que deriveStageLabel y deriveCurrentStageIndex en companies/companyList.ts —
 * la primera en_progreso manda; si no hay ninguna, la última completada. Sin etapas devuelve la
 * última: una empresa sin mapa se dibuja terminada, como se dibujaba antes de que el edificio
 * supiera del tracker.
 *
 * Discreto y no un porcentaje: cada etapa tiene su propia escena en el edificio. Interpolar
 * entre dos etapas dibujaría algo que no corresponde a ninguna.
 */
export function currentStage(
  stages: { status: string; stageName: string; stageOrder: number }[],
): CurrentStage {
  if (stages.length === 0) return { order: TOTAL_STAGES, name: null };

  const enCurso = stages.find((s) => s.status === "en_progreso");
  if (enCurso) return { order: enCurso.stageOrder, name: enCurso.stageName };

  const completadas = stages.filter((s) => s.status === "completada");
  const ultima = completadas[completadas.length - 1];
  if (ultima) return { order: ultima.stageOrder, name: ultima.stageName };

  // Ninguna empezó todavía: va en la primera, no en ninguna. Un dueño recién dado de alta ve su
  // terreno, que es exactamente donde está.
  const primera = stages[0]!;
  return { order: primera.stageOrder, name: primera.stageName };
}

export function buildBuildingGraph(
  org: BuildingOrgInput,
  areas: BuildingAreaInput[],
  stages: { status: string; stageName: string; stageOrder: number }[] = [],
): BuildingGraph {
  const distributed = distributeCells(
    areas.map((a) => a.id),
    BUILDING_ROWS,
    BUILDING_COLS,
    WINDOWS_PER_AREA,
    hashSeed(org.name),
  );
  const cellsById = new Map(distributed.map((d) => [d.id, d.cells] as const));

  const etapa = currentStage(stages);

  return {
    companyName: org.name,
    slogan: org.slogan,
    accentColor: org.accentColor,
    industry: org.industry,
    stageOrder: etapa.order,
    stageLabel: etapa.name,
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      cells: cellsById.get(a.id) ?? [],
      silhouette: a.silhouette,
    })),
  };
}
