// Los niveles de evolución de un negocio — los NOMBRES son iguales para toda empresa, el camino no.
//
// La distinción importa y es lo que separa esta lista de BUILD_STAGES:
//
// - BUILD_STAGES es el tracker de la construcción de la empresa DIGITAL. Todas las empresas recorren
//   las mismas 8 fases en el mismo orden, y quien las mueve es Improvement.
// - Estos niveles son de la empresa REAL. Cada empresa empieza en uno distinto y llega al siguiente
//   por un camino distinto — ese camino son sus filas de org_need, nunca una rama de código.
//
// Por eso aquí solo viven los nombres: qué le falta a ESTA empresa para subir es diagnóstico, y el
// diagnóstico es dato de esa empresa (.claude/rules/motor-generico.md).
export const EVOLUTION_LEVELS = [
  {
    level: 0,
    name: "Arranque",
    description: "La empresa opera, pero casi todo pasa por el dueño.",
  },
  {
    level: 1,
    name: "Orden",
    description: "El trabajo está repartido y escrito: deja de vivir en la cabeza de una persona.",
  },
  {
    level: 2,
    name: "Ritmo",
    description: "El equipo cumple sus objetivos sin que el dueño tenga que empujar cada uno.",
  },
  {
    level: 3,
    name: "Tracción",
    description: "El ingreso deja de depender de un solo cliente o de un solo canal.",
  },
  {
    level: 4,
    name: "Sistema",
    description: "Los procesos se repiten igual aunque cambie la gente que los ejecuta.",
  },
  {
    level: 5,
    name: "Escala",
    description: "La empresa crece sin que su costo crezca al mismo ritmo.",
  },
  {
    level: 6,
    name: "Autonomía",
    description: "La empresa opera y mejora sin el dueño adentro de la operación.",
  },
] as const;

export type EvolutionLevel = (typeof EVOLUTION_LEVELS)[number];

/**
 * El nivel en el que va una empresa. Un índice fuera de rango devuelve el primero y nunca lanza: una
 * fila vieja con un valor raro tiene que dibujar un panel, no tirarlo.
 */
export function evolutionLevelAt(level: number): EvolutionLevel {
  return EVOLUTION_LEVELS[level] ?? EVOLUTION_LEVELS[0];
}
