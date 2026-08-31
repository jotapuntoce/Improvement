// Única definición de la relación peso de impacto → puntos en todo el repo (§9.6 del blueprint —
// la escena 3D de E3-T1 importa esta misma función, nunca reimplementa el cálculo).
export const POINTS_PER_WEIGHT_POINT = 10;

export function pointsForObjective(impactWeight: number): number {
  return impactWeight * POINTS_PER_WEIGHT_POINT;
}
