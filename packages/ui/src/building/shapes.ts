// Qué tamaño y qué forma tiene el edificio de cada cliente.
//
// Hermano de palettes.ts: la paleta dice de qué color es, esto dice qué tan alto y qué tan ancho.
// Un taller no vive en la misma torre que un despacho, y una nave industrial no se parece a una
// clínica. Con la fachada fija de 9×8 los ocho giros eran el mismo edificio pintado de otro color.
//
// Se mide en VENTANAS, no en píxeles: la ventana es la escala humana de la escena (siempre mide lo
// mismo, en todos los edificios), así que "5 columnas por 9 filas" se lee directo como una torre
// angosta y "10 por 3" como una nave larga. La geometría en píxeles la deriva Building.tsx a partir
// de esto, siempre centrada y siempre apoyada en el mismo suelo.
//
// Igual que la paleta: se elige por GIRO, que es un dato de la fila, nunca por nombre de empresa
// (motor genérico, Non-negotiable #2 de CLAUDE.md).
import { isIndustry, type Industry } from "./industries.ts";

export interface BuildingShape {
  /** Ventanas a lo ancho. */
  cols: number;
  /** Pisos de ventanas a lo alto. */
  rows: number;
}

/**
 * El tope es 10 columnas y 9 filas: más ancho no cabe en el viewBox de 660 y más alto se sale por
 * arriba, porque el suelo está fijo (el edificio crece hacia el cielo, nunca hacia abajo).
 */
const SHAPES: Record<Industry, BuildingShape> = {
  // Un local, no un edificio: chaparro y compacto.
  restaurante: { cols: 6, rows: 4 },
  // Fachada de tienda: ancha y baja, todo el frente a la calle.
  retail: { cols: 9, rows: 4 },
  // Despacho: la torre angosta de oficinas.
  servicios: { cols: 5, rows: 9 },
  // Clínica: bloque ancho de varios pisos.
  salud: { cols: 8, rows: 6 },
  // La forma original de la escena, y el default.
  construccion: { cols: 9, rows: 8 },
  // Campus: ancho y de media altura, más vidrio que muro.
  tecnologia: { cols: 10, rows: 5 },
  // Nave industrial: larguísima y de un par de niveles.
  manufactura: { cols: 10, rows: 3 },
  otro: { cols: 9, rows: 8 },
};

export function buildingShape(industry: string | null | undefined): BuildingShape {
  return SHAPES[isIndustry(industry) ? industry : "otro"];
}
