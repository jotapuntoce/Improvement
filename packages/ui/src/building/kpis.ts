// Cómo se DIBUJA el número de un indicador, y nada más.
//
// Qué indicadores existe ya no se decide en código: cada empresa guarda los suyos en la tabla
// org_kpi, y de dónde sale cada número lo resuelve apps/improvement/server/kpis/sources.ts. Antes
// aquí vivía un catálogo cerrado de 8 KPIs; ningún cliente real cabía en él (Jaime Salinas mide
// autorización de proyectos, avance de obra, ventas y postventa) y cada cliente nuevo habría pedido
// otra entrada en la lista — personalización en una rama de código, justo lo que
// .claude/rules/motor-generico.md prohíbe.
export const MIN_KPIS = 4;
export const MAX_KPIS = 6;

export type KpiFormat = "numero" | "porcentaje" | "dinero";

export const KPI_FORMATS: { id: KpiFormat; label: string }[] = [
  { id: "numero", label: "Número" },
  { id: "porcentaje", label: "Porcentaje" },
  { id: "dinero", label: "Dinero" },
];

// maximumFractionDigits: 0 — un indicador de tarjeta enseña "$1,240,000", no los centavos: el número
// compite por ancho con otros cinco y la precisión no aporta a una lectura de un vistazo.
const MONEY = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const PLAIN = new Intl.NumberFormat("es-MX");

export function formatKpiValue(value: number, format: string): string {
  if (format === "porcentaje") return `${PLAIN.format(value)}%`;
  if (format === "dinero") return MONEY.format(value);
  return PLAIN.format(value);
}

/**
 * Las filas de org_kpi que se insertan al crear una empresa: un punto de partida que ya dice algo el
 * primer día, no una tarjeta en blanco esperando que el dueño configure seis indicadores antes de ver
 * nada. Todos salen de tablas que el motor ya tiene, así que funcionan sin capturar nada a mano.
 *
 * Son un DEFAULT, no un catálogo: el dueño los renombra, los repunta a otra fuente o los borra desde
 * /empresas/configuracion. Cambiar esta lista solo afecta a las empresas que se creen después — las
 * que existen ya tienen sus filas, que son la fuente de verdad.
 */
export function defaultOrgKpis(): {
  label: string;
  hint: string;
  source: string;
  config: Record<string, unknown>;
  position: number;
}[] {
  return [
    { label: "Objetivos activos", hint: "Lo que tu equipo tiene en marcha ahora", source: "objetivos", config: { estado: "abiertos" }, position: 0 },
    { label: "Objetivos logrados", hint: "Todo lo que ya cerraron", source: "objetivos", config: { estado: "completados" }, position: 1 },
    { label: "Objetivos vencidos", hint: "Pasaron su fecha y siguen abiertos", source: "objetivos", config: { estado: "vencidos" }, position: 2 },
    { label: "Puntos del equipo", hint: "Los puntos que acumula tu gente", source: "puntos", config: {}, position: 3 },
    { label: "Personas en el equipo", hint: "Cuántos trabajan contigo aquí", source: "equipo", config: {}, position: 4 },
    { label: "Clientes", hint: "El tamaño de tu cartera", source: "clientes", config: {}, position: 5 },
  ];
}
