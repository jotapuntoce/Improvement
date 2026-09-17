// Cálculo puro de posiciones del plano: recibe piezas y conexiones, devuelve dónde va cada caja.
// Sin React y sin dependencias — el orden del recorrido no se guarda en la base, se deriva aquí
// (ver .claude/rules/base-de-datos.md y el comentario de la tabla assembly en schema.ts).
//
// No se agregó una librería de layout (dagre y compañía) porque el algoritmo que hace falta son las
// ~20 líneas de computeColumns: regla 8 de CLAUDE.md.

export type LayoutPiece = { id: string; name: string };
export type LayoutConnection = {
  fromPieceId: string;
  toPieceId: string;
  conditionLabel?: string | null;
};

export type PlacedPiece = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Pieza creada pero todavía sin ensamblar — ni entra ni sale nada de ella. */
  loose: boolean;
};

export type PlacedConnection = {
  fromPieceId: string;
  toPieceId: string;
  conditionLabel?: string | null;
  /** Curva de la flecha, ya lista para el atributo `d` de un <path>. */
  path: string;
  /** Punto medio, donde se escribe la condición de una bifurcación. */
  labelX: number;
  labelY: number;
};

export const CARD_W = 184;
export const CARD_H = 62;
const GAP_X = 76;
const GAP_Y = 22;
const PAD = 16;

/**
 * Columna de cada pieza = el camino más largo desde una pieza inicial, relajando las aristas hasta
 * que nada cambie. El tope de pasadas es lo que hace esto seguro con ciclos (volver del dashboard al
 * login es un flujo legítimo): sin él, un ciclo empujaría columnas para siempre.
 */
function computeColumns(
  pieces: LayoutPiece[],
  connections: LayoutConnection[],
): Map<string, number> {
  const column = new Map<string, number>();
  for (const piece of pieces) column.set(piece.id, 0);

  for (let pass = 0; pass < pieces.length; pass++) {
    let changed = false;
    for (const conn of connections) {
      const from = column.get(conn.fromPieceId);
      const to = column.get(conn.toPieceId);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) {
        column.set(conn.toPieceId, from + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return column;
}

/**
 * Coloca las piezas en columnas (el recorrido, de izquierda a derecha) y filas (las ramas de una
 * bifurcación, apiladas). Dentro de una columna se respeta el orden en que llegaron las piezas, así
 * el dibujo no salta de posición entre renders.
 */
export function layoutAssembly(pieces: LayoutPiece[], connections: LayoutConnection[]) {
  const column = computeColumns(pieces, connections);

  const connected = new Set<string>();
  for (const conn of connections) {
    connected.add(conn.fromPieceId);
    connected.add(conn.toPieceId);
  }

  const rowCursor = new Map<number, number>();
  const placed: PlacedPiece[] = pieces.map((piece) => {
    const col = column.get(piece.id) ?? 0;
    const row = rowCursor.get(col) ?? 0;
    rowCursor.set(col, row + 1);

    return {
      id: piece.id,
      name: piece.name,
      x: PAD + col * (CARD_W + GAP_X),
      y: PAD + row * (CARD_H + GAP_Y),
      loose: !connected.has(piece.id),
    };
  });

  const byId = new Map(placed.map((p) => [p.id, p]));

  const edges: PlacedConnection[] = [];
  for (const conn of connections) {
    const from = byId.get(conn.fromPieceId);
    const to = byId.get(conn.toPieceId);
    if (!from || !to) continue;

    const x1 = from.x + CARD_W;
    const y1 = from.y + CARD_H / 2;
    const x2 = to.x;
    const y2 = to.y + CARD_H / 2;
    // Curva con tirantes horizontales: sale y entra en horizontal aunque las cajas estén en filas
    // distintas, que es lo que hace legible una bifurcación.
    const grip = Math.max(28, Math.abs(x2 - x1) / 2);

    edges.push({
      fromPieceId: conn.fromPieceId,
      toPieceId: conn.toPieceId,
      conditionLabel: conn.conditionLabel,
      path: `M ${x1} ${y1} C ${x1 + grip} ${y1}, ${x2 - grip} ${y2}, ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - 8,
    });
  }

  const width = Math.max(...placed.map((p) => p.x + CARD_W), CARD_W) + PAD;
  const height = Math.max(...placed.map((p) => p.y + CARD_H), CARD_H) + PAD;

  return { pieces: placed, connections: edges, width, height };
}
