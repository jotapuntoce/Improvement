// El plano de la recepción: dónde va cada mueble y cuánto mide.
//
// Vive aparte de Lobby.tsx a propósito. Aquí no hay JSX ni React, así que una prueba puede pedirle
// el plano con cualquier cantidad de datos y revisar que ningún mueble se salga de la pared ni se
// encime con otro — que es exactamente lo que se rompió dos veces mirándolo nada más a ojo.
//
// El sistema de coordenadas es el del viewBox de la escena: 1400 × 760.
//
// Los muebles son fijos: ver el comentario de ZONAS, más abajo.

export type LobbyZona =
  | "objetivos"
  | "areas"
  | "equipo"
  | "proyectos"
  | "clientes"
  | "powerups";

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ESCENA = { w: 1400, h: 760 };

/**
 * La pared de madera del fondo. A la izquierda queda el ventanal y a la derecha el pasillo oscuro;
 * ninguno de los dos es pared donde se pueda colgar algo, así que TODO mueble vive aquí adentro.
 */
export const PARED = { x0: 236, x1: 1178, y0: 58, y1: 520 };

/** Cuánto sobresale el mueble por fuera de su hueco útil: el marco que dibuja el SVG. */
export interface Marco {
  t: number;
  r: number;
  b: number;
  l: number;
}

export const MARCOS: Record<LobbyZona, Marco> = {
  areas: { t: 10, r: 10, b: 10, l: 10 },
  // 13 del marco de aluminio, 3 del canto, y abajo además la charola de los plumones.
  objetivos: { t: 16, r: 16, b: 28, l: 16 },
  equipo: { t: 14, r: 14, b: 14, l: 14 },
  // El bisel de la iMac arriba y a los lados; abajo, la barbilla.
  proyectos: { t: 8, r: 8, b: 16, l: 8 },
  clientes: { t: 10, r: 10, b: 10, l: 10 },
  powerups: { t: 11, r: 11, b: 11, l: 11 },
};

/** El globo de quien atiende: no es un mueble, pero tampoco puede taparle nada a los demás. */
export const GLOBO: Caja = { x: 436, y: 206, w: 410, h: 66 };
/** Dónde cae quien atiende, y a dónde apunta el pico del globo. */
export const RECEPCION_CX = 700;
/** Alto de su cabeza. */
export const RECEPCION_CABEZA = 352;
/** Cara superior del mostrador. La tapa que se ve empieza 6 más arriba. */
export const MOSTRADOR_Y = 436;
/** El canto de la tapa: hasta aquí llega la pared libre. */
export const TAPA_Y = MOSTRADOR_Y - 6;
/** Dónde se apoyan en el mostrador la pantalla y el letrero. */
export const APOYO_Y = 410;

/**
 * Cuántas cosas le caben a cada mueble. No es un tope de datos: es cuánto mide el mueble por
 * dentro. La pantalla del mostrador enseña tres proyectos y el muro cuelga cinco retratos porque
 * ese es su tamaño, igual que un librero cabe los libros que cabe.
 */
export const RETRATO_W = 48;
export const MAX_RETRATOS = 5;
export const MAX_PROYECTOS = 3;

/** Lo que ocupa por dentro una pantalla de N renglones. La prueba comprueba que el mueble alcanza. */
export function altoDePantalla(filas: number): number {
  return 32 + (filas === 0 ? 16 : filas * 27 + (filas - 1) * 5);
}

/** Lo que ocupa por dentro un muro de N retratos. */
export function anchoDeMuro(retratos: number): number {
  return retratos * RETRATO_W + (retratos - 1) * 8 + 9;
}

/** El marco de un mueble: su hueco más lo que el SVG le dibuja alrededor. */
export function conMarco(z: Caja, m: Marco): Caja {
  return { x: z.x - m.l, y: z.y - m.t, w: z.w + m.l + m.r, h: z.h + m.t + m.b };
}

/**
 * EL PLANO. Dónde va cada mueble y cuánto mide — y no cambia nunca.
 *
 * Los muebles no crecen ni se encogen con los datos. Un mueble es una de las cosas que el dueño
 * quiere tener a la vista al entrar a su empresa, y lo que va adentro lo decide él: si hoy tiene
 * tres proyectos y mañana uno, la pantalla es la misma pantalla. Una oficina donde los muebles se
 * mueven solos cada vez que cambia un dato no es una oficina, es un tablero — y el dueño perdería
 * el mapa que ya se aprendió.
 *
 * Por eso cada mueble mide lo que necesita su contenido LLENO (MAX_PROYECTOS, MAX_RETRATOS) y no lo
 * que trae hoy. Cuando trae menos, el contenido se reparte adentro; no se encoge el mueble.
 *
 * Alineaciones que sostienen el dibujo, por si hay que mover algo:
 *   · la pantalla y el letrero se apoyan en el mostrador (APOYO_Y) y crecen hacia arriba;
 *   · el muro y el lector se arriman a la misma orilla derecha (ORILLA_DER);
 *   · el pizarrón y la pantalla comparten la orilla izquierda;
 *   · el lector queda a la misma distancia del muro que del mostrador.
 */
const ORILLA_DER = 1156;
const ORILLA_IZQ = 248;

export const ZONAS: Record<LobbyZona, Caja> = {
  areas: { x: 250, y: 74, w: 914, h: 40 },
  objetivos: { x: ORILLA_IZQ + 8, y: 168, w: 148, h: 66 },
  equipo: { x: ORILLA_DER - 281, y: 160, w: 281, h: 96 },
  proyectos: { x: ORILLA_IZQ, y: APOYO_Y - 123, w: 236, h: 123 },
  clientes: { x: 784, y: APOYO_Y - 74, w: 124, h: 66 },
  powerups: { x: ORILLA_DER - 124, y: 317, w: 124, h: 66 },
};
