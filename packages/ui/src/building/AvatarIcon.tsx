// Variante de AppIconLarge.tsx (mismo archivo, misma familia) para representar una PERSONA (un
// cliente), no una empresa — mismo lenguaje visual (degradado, grid, brillo), con iniciales en vez
// del glyph de cuadrícula, sin badge de etapa. El degradado usa uno de los 4 presets de acento ya
// existentes en packages/ui/src/tokens.css, reexpuestos como tokens nombrados (Task 5) — nunca un
// hex literal en este archivo.
export type AvatarColorPreset = "aurora" | "esmeralda" | "solar" | "indigo";

const PRESET_TOKENS: Record<AvatarColorPreset, [string, string]> = {
  aurora: ["var(--preset-aurora-1)", "var(--preset-aurora-2)"],
  esmeralda: ["var(--preset-esmeralda-1)", "var(--preset-esmeralda-2)"],
  solar: ["var(--preset-solar-1)", "var(--preset-solar-2)"],
  indigo: ["var(--preset-indigo-1)", "var(--preset-indigo-2)"],
};

export interface AvatarIconProps {
  name: string;
  // string | null, no AvatarColorPreset: viene directo de profile.avatarColor (columna de texto
  // sin restricción a nivel de tipo — ver ClientSummary.avatarColor en clientList.ts, Task 2). Este
  // componente valida internamente cuáles son los 4 valores reales; cualquier otro (incluido null,
  // el estado "todavía no personalizado", o un valor inesperado) cae al degradado Aurora.
  avatarColor?: string | null;
  size?: number;
}

/**
 * WHEN name tiene 2 o más palabras THE SYSTEM SHALL devolver la primera letra de la primera
 * palabra más la primera letra de la última (criterio #1). WHEN name tiene una sola palabra THE
 * SYSTEM SHALL devolver solo esa letra (criterio #2). WHEN name está vacío THE SYSTEM SHALL
 * devolver una cadena vacía, nunca lanzar (criterio #3).
 */
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)).toUpperCase();
}

function isAvatarColorPreset(value: string): value is AvatarColorPreset {
  return value in PRESET_TOKENS;
}

export function AvatarIcon({ name, avatarColor, size = 96 }: AvatarIconProps) {
  const [c1, c2] = avatarColor && isAvatarColorPreset(avatarColor) ? PRESET_TOKENS[avatarColor] : PRESET_TOKENS.aurora;
  const initialsFontSize = Math.round(size * 0.36);

  return (
    <span className="app-icon-large-wrap" style={{ width: size }}>
      <span
        className="app-icon-large"
        style={{ width: size, height: size, background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      >
        <span className="app-icon-large-grid" aria-hidden="true" />
        <span className="app-icon-large-shine" aria-hidden="true" />
        <span
          className="app-icon-large-glyph"
          style={{ fontSize: initialsFontSize, fontWeight: 700, color: "var(--text-primary)" }}
        >
          {initialsFor(name)}
        </span>
      </span>
      <span className="app-icon-large-label">{name}</span>
    </span>
  );
}
