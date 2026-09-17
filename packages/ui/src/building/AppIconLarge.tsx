// Variante grande de AppIcon.js (apps/admin) para el panel /empresas — mismo lenguaje visual
// (degradado, grid, brillo), con un badge de etapa de construcción en vez de un contador de
// actividad. CSS en packages/ui/src/building.css (.app-icon-large-*).
//
// El glyph depende de `industry` (uno de los ids de INDUSTRIES, industries.ts) — cada giro tiene su
// propio ícono; null o un valor fuera de la lista usa la cuadrícula original (default, nunca lanza).
import type { Industry } from "./industries.ts";

export interface AppIconLargeProps {
  label: string;
  stageLabel: string;
  industry?: Industry | string | null;
  size?: number;
}

const glyphProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2.2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Un glyph por giro (industries.ts) — trazos simples, mismo lenguaje visual que la cuadrícula
// default. "otro" y cualquier industry no reconocida caen al default (última entrada del switch).
function Glyph({ industry }: { industry?: Industry | string | null }) {
  switch (industry) {
    case "restaurante":
      return (
        <>
          <line x1="5" y1="3" x2="5" y2="21" {...glyphProps} />
          <line x1="3" y1="3" x2="3" y2="9" {...glyphProps} />
          <line x1="7" y1="3" x2="7" y2="9" {...glyphProps} />
          <path d="M18 3c-2 0-3.2 2-3.2 5s1.2 4 3.2 4" {...glyphProps} />
          <line x1="18" y1="3" x2="18" y2="21" {...glyphProps} />
        </>
      );
    case "retail":
      return (
        <>
          <path d="M6 8h12l-1 12H7L6 8z" {...glyphProps} />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" {...glyphProps} />
        </>
      );
    case "servicios":
      return (
        <>
          <rect x="3" y="8" width="18" height="11" rx="1.5" {...glyphProps} />
          <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" {...glyphProps} />
          <line x1="3" y1="13" x2="21" y2="13" {...glyphProps} />
        </>
      );
    case "salud":
      return (
        <>
          <circle cx="12" cy="12" r="9" {...glyphProps} />
          <line x1="12" y1="8" x2="12" y2="16" {...glyphProps} />
          <line x1="8" y1="12" x2="16" y2="12" {...glyphProps} />
        </>
      );
    case "construccion":
      return (
        <>
          <path d="M15 4l5 5-3 3-5-5z" {...glyphProps} />
          <path d="M13 8L4 17l3 3 9-9" {...glyphProps} />
        </>
      );
    case "tecnologia":
      return (
        <>
          <rect x="7" y="7" width="10" height="10" rx="1.5" {...glyphProps} />
          <line x1="12" y1="2" x2="12" y2="7" {...glyphProps} />
          <line x1="12" y1="17" x2="12" y2="22" {...glyphProps} />
          <line x1="2" y1="12" x2="7" y2="12" {...glyphProps} />
          <line x1="17" y1="12" x2="22" y2="12" {...glyphProps} />
        </>
      );
    case "manufactura":
      return (
        <>
          <circle cx="12" cy="12" r="3" {...glyphProps} />
          <path
            d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"
            {...glyphProps}
          />
        </>
      );
    default:
      return (
        <>
          <rect x="3" y="3" width="8" height="8" rx="1.5" {...glyphProps} />
          <rect x="13" y="3" width="8" height="8" rx="1.5" {...glyphProps} />
          <rect x="3" y="13" width="8" height="8" rx="1.5" {...glyphProps} />
          <rect x="13" y="13" width="8" height="8" rx="1.5" {...glyphProps} />
        </>
      );
  }
}

export function AppIconLarge({ label, stageLabel, industry, size = 96 }: AppIconLargeProps) {
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
        >
          <Glyph industry={industry} />
        </svg>
      </span>
      <span className="app-icon-large-badge">{stageLabel}</span>
      <span className="app-icon-large-label">{label}</span>
    </span>
  );
}
