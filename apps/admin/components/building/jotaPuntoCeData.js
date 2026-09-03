// Datos literales de JotaPuntoCe para Building.tsx (packages/ui) — identidad de marca de la
// plataforma, no dato de cliente, por eso vive como constante aquí y no en la base de datos (ver
// .claude/rules/motor-generico.md: la regla de "todo en datos" aplica a organizaciones cliente,
// JotaPuntoCe no es una fila de `organization`).
export const JOTAPUNTOCE_COMPANY_NAME = "JOTAPUNTOCE";
export const JOTAPUNTOCE_SLOGAN = "Eficiencia con Propósito";

// Mismas 6 áreas, mismos colores, mismas celdas que antes tenía ZONES en JotaPuntoCeBuilding.js —
// portado tal cual, sin recalcular con distributeCells (ese algoritmo es para organizaciones
// cliente sin layout curado a mano).
export const JOTAPUNTOCE_AREAS = [
  { id: "imag", name: "Imaginación", color: "var(--dept-imaginacion)", silhouette: "imag", cells: [[0, 1], [0, 6], [1, 8]] },
  { id: "plan", name: "Planeación", color: "var(--dept-planeacion)", silhouette: "plan", cells: [[0, 4], [1, 3], [2, 7]] },
  { id: "sol", name: "Soluciones", color: "var(--dept-soluciones)", silhouette: "sol", cells: [[2, 8], [3, 5], [6, 8]] },
  { id: "valor", name: "Valor agregado", color: "var(--dept-valor)", silhouette: "valor", cells: [[3, 1], [3, 7], [4, 4]] },
  { id: "brand", name: "Branding", color: "var(--dept-branding)", silhouette: "brand", cells: [[4, 8], [5, 6], [6, 2]] },
  { id: "pres", name: "Presentación", color: "var(--dept-presentacion)", silhouette: "pres", cells: [[5, 3], [6, 1], [7, 7]] },
];
