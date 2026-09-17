// El plano dibujado: cajas conectadas por flechas. Server Component a propósito — no hay estado de
// cliente ni handlers. Al hacer click en una pieza se navega a una URL (`hrefForPiece`), así el panel
// de "qué hace esta pieza" lo renderiza el servidor y el enlace a una pieza concreta se puede
// compartir tal cual. Sin `hrefForPiece` las cajas no son enlaces: esa es la vista de solo lectura.
//
// Los colores salen todos de tokens (.claude/rules/tokens-de-diseno.md); aquí no hay ni un hex.
import {
  CARD_H,
  CARD_W,
  layoutAssembly,
  type LayoutConnection,
  type LayoutPiece,
} from "./layout.ts";

type AssemblyMapProps = {
  pieces: LayoutPiece[];
  connections: LayoutConnection[];
  selectedPieceId?: string | null;
  hrefForPiece?: (pieceId: string) => string;
};

/** SVG no corta texto solo, y una caja mide 184px: a 13px entran unos 24 caracteres. */
function fit(name: string) {
  return name.length > 24 ? `${name.slice(0, 23)}…` : name;
}

export function AssemblyMap({
  pieces,
  connections,
  selectedPieceId = null,
  hrefForPiece,
}: AssemblyMapProps) {
  if (pieces.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", margin: 0 }}>Todavía no hay piezas en este plano.</p>
    );
  }

  const { pieces: placed, connections: edges, width, height } = layoutAssembly(pieces, connections);

  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Plano con ${pieces.length} piezas y ${connections.length} conexiones`}
        style={{ maxWidth: "none", fontFamily: "inherit" }}
      >
        <defs>
          <marker
            id="assembly-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--border-strong)" />
          </marker>
        </defs>

        {edges.map((edge) => (
          <g key={`${edge.fromPieceId}-${edge.toPieceId}`}>
            <path
              d={edge.path}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1.5}
              markerEnd="url(#assembly-arrow)"
            />
            {edge.conditionLabel ? (
              <text
                x={edge.labelX}
                y={edge.labelY}
                textAnchor="middle"
                fontSize={11}
                fill="var(--accent-2)"
              >
                {edge.conditionLabel}
              </text>
            ) : null}
          </g>
        ))}

        {placed.map((piece) => {
          const selected = piece.id === selectedPieceId;
          const box = (
            <g>
              <rect
                x={piece.x}
                y={piece.y}
                width={CARD_W}
                height={CARD_H}
                rx={10}
                fill="var(--bg-card)"
                stroke={selected ? "var(--accent-1)" : "var(--border)"}
                strokeWidth={selected ? 2 : 1}
                // Contorno punteado = pieza creada pero aún no ensamblada.
                strokeDasharray={piece.loose && !selected ? "4 3" : undefined}
              />
              <text
                x={piece.x + 16}
                y={piece.y + CARD_H / 2 + 5}
                fontSize={13}
                fill={piece.loose ? "var(--text-secondary)" : "var(--text-primary)"}
              >
                {fit(piece.name)}
              </text>
            </g>
          );

          if (!hrefForPiece) return <g key={piece.id}>{box}</g>;

          return (
            <a
              key={piece.id}
              href={hrefForPiece(piece.id)}
              aria-label={`Ver qué hace ${piece.name}`}
            >
              {box}
            </a>
          );
        })}
      </svg>
    </div>
  );
}
