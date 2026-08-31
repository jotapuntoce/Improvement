// Ícono estilo "app" para representar Improvement (la empresa digital) en el panel.
// Los detalles son dinámicos de verdad, no solo decorativos:
// - el degradado usa el color de acento activo (cambia con el AccentPicker)
// - el punto "en vivo" y el badge reflejan datos reales (productos activos)
export default function AppIcon({ size = 44, liveCount, className = "" }) {
  const hasLive = typeof liveCount === "number" && liveCount > 0;
  const glyphSize = Math.round(size * 0.52);

  return (
    <span
      className={`app-icon-wrap ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="app-icon" style={{ width: size, height: size }}>
        <span className="app-icon-grid" aria-hidden="true" />
        <span className="app-icon-shine" aria-hidden="true" />
        <svg
          className="app-icon-glyph"
          width={glyphSize}
          height={glyphSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="1 18 8.5 10.5 13.5 15.5 23 6" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      </span>
      {hasLive && <span className="app-icon-live-dot" title={`${liveCount} producto(s) activo(s)`} />}
      {typeof liveCount === "number" && liveCount > 0 && (
        <span className="app-icon-badge">{liveCount > 99 ? "99+" : liveCount}</span>
      )}
    </span>
  );
}
