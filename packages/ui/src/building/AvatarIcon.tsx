// Variante de AppIconLarge.tsx para representar una PERSONA (un cliente, en la vista de Clientes
// del platform admin), no una empresa — mismo lenguaje visual (degradado default, grid, brillo, CSS
// compartido de building.css), iniciales en vez de un glyph de giro, sin badge de etapa (aquí no hay
// una que resumir). Sin personalización de color — no se pidió, y el degradado default de
// .app-icon-large ya usa --accent-1/--accent-2.
export interface AvatarIconProps {
  name: string;
  size?: number;
}

/**
 * WHEN name tiene 2 o más palabras THE SYSTEM SHALL devolver la primera letra de la primera palabra
 * más la primera letra de la última (criterio #1). WHEN name tiene una sola palabra THE SYSTEM
 * SHALL devolver solo esa letra (criterio #2). WHEN name está vacío THE SYSTEM SHALL devolver una
 * cadena vacía, nunca lanzar (criterio #3).
 */
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)).toUpperCase();
}

export function AvatarIcon({ name, size = 96 }: AvatarIconProps) {
  const fontSize = Math.round(size * 0.36);

  return (
    <span className="app-icon-large-wrap" style={{ width: size }}>
      <span className="app-icon-large" style={{ width: size, height: size }}>
        <span className="app-icon-large-grid" aria-hidden="true" />
        <span className="app-icon-large-shine" aria-hidden="true" />
        <span className="app-icon-large-glyph" style={{ fontSize, fontWeight: 700 }}>
          {initialsFor(name)}
        </span>
      </span>
      <span className="app-icon-large-label">{name}</span>
    </span>
  );
}
