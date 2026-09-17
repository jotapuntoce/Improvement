// Las 8 fases de construcción de una empresa digital — fuente única, igual para toda empresa.
//
// Por qué fijas y sembradas completas: el tracker del panel del dueño enseña TODAS las fases desde
// el primer día y marca en cuál va (como el rastreador de una pizzería enseña los 8 pasos aunque
// vayas en el 2). Antes solo se sembraba "Análisis" y Jose Carlos agregaba las siguientes a mano,
// así que el cliente nunca veía el camino completo ni podía comparar dos de sus empresas.
//
// Jose Carlos sigue moviendo el ESTADO de cada fase desde apps/admin; lo que ya no captura es la
// lista. Cambiar un nombre aquí solo afecta a las empresas que se creen después — las existentes ya
// tienen sus filas en org_build_stage, que es la fuente de verdad en tiempo de lectura.
export const BUILD_STAGES = [
  {
    order: 1,
    name: "Solicitud recibida",
    description: "Tu empresa entró a la fila de construcción y quedó registrada.",
  },
  {
    order: 2,
    name: "Análisis",
    description: "Primer levantamiento de la empresa — áreas, roles y objetivos iniciales.",
  },
  {
    order: 3,
    name: "Plano",
    description: "El diseño de cómo va a funcionar tu empresa digital, pieza por pieza.",
  },
  {
    order: 4,
    name: "Construcción",
    description: "Se arma el panel, las áreas y los objetivos de tu equipo.",
  },
  {
    order: 5,
    name: "Pruebas",
    description: "Se revisa que todo funcione con datos reales antes de entregártelo.",
  },
  {
    order: 6,
    name: "Capacitación",
    description: "Tu equipo aprende a usar su panel y a registrar sus objetivos.",
  },
  {
    order: 7,
    name: "Entrega",
    description: "Tu empresa digital queda viva y operando con tu equipo adentro.",
  },
  // "Seguimiento" y no "Acompañamiento": con ocho pasos en una fila, el nombre más largo decide el
  // ancho de todos, y "Acompañamiento" empujaba el riel fuera del panel. Significan lo mismo.
  {
    order: 8,
    name: "Seguimiento",
    description: "Acompañamiento continuo: ajustes, mejoras y nuevos objetivos.",
  },
] as const;

export type BuildStageStatus = "bloqueada" | "en_progreso" | "completada";

/**
 * Las filas que se insertan en org_build_stage al crear una empresa: las 8 fases completas, la
 * primera en progreso y el resto bloqueadas. Devuelve objetos nuevos en cada llamada — el caller
 * les agrega su orgId y los inserta.
 */
export function initialBuildStages(): {
  stageOrder: number;
  stageName: string;
  description: string;
  status: BuildStageStatus;
}[] {
  return BUILD_STAGES.map((stage) => ({
    stageOrder: stage.order,
    stageName: stage.name,
    description: stage.description,
    status: stage.order === 1 ? "en_progreso" : "bloqueada",
  }));
}
