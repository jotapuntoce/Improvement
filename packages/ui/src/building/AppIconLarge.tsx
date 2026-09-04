// Variante grande de AppIcon.js (apps/admin) para el panel /empresas — mismo lenguaje visual
// (degradado, grid, brillo), con un badge de etapa de construcción en vez de un contador de
// actividad. CSS en packages/ui/src/building.css (.app-icon-large-*).
export interface AppIconLargeProps {
  label: string;
  stageLabel: string;
  size?: number;
}

export function AppIconLarge({ label, stageLabel, size = 96 }: AppIconLargeProps) {
  const glyphSize = Math.round(size * 0.42);

  return (
    <span className="app-icon-large-wrap" style={{ width: size }}>
      <span className="app-icon-large" style={{ width: size, height: size }}>
        <span className="app-icon-large-grid" aria-hidden="true" />
        <span className="app-icon-large-shine" aria-hidden="true" />
        <svg
          className="app-icon-large-glyph"
          width={glyphSize}
          height={glyphSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      </span>
      <span className="app-icon-large-badge">{stageLabel}</span>
      <span className="app-icon-large-label">{label}</span>
    </span>
  );
}
