"use client";

import { useEffect, useRef } from "react";

// "Productos digitales" del dashboard, dentro de una TV de calidad montada en la pared (pedido
// explícito de Jose Carlos, iterado varias veces en el Artifact antes de portarlo aquí). Los 2
// números de arriba son reales (props desde DashboardView -> app/page.js -> getOrgStats()); el
// conteo animado es puramente decorativo (cuenta de 0 al valor real al montar).
export default function ProductsScreen({ totalOrgs, totalMembers, improvementUrl }) {
  const orgsRef = useRef(null);
  const membersRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = [
      { el: orgsRef.current, value: totalOrgs, delay: 150 },
      { el: membersRef.current, value: totalMembers, delay: 240 },
    ];
    if (reduced) {
      targets.forEach(({ el, value }) => {
        if (el) el.textContent = String(value);
      });
      return;
    }
    const duration = 700;
    const cancels = targets.map(({ el, value, delay }) => {
      if (!el) return null;
      let start = null;
      let frame;
      function step(ts) {
        if (start === null) start = ts;
        const elapsed = ts - start - delay;
        if (elapsed < 0) {
          frame = requestAnimationFrame(step);
          return;
        }
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = String(Math.round(eased * value));
        if (progress < 1) frame = requestAnimationFrame(step);
      }
      frame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frame);
    });
    return () => cancels.forEach((cancel) => cancel && cancel());
  }, [totalOrgs, totalMembers]);

  return (
    <div className="screen-mount">
      <p className="wall-label">
        <span className="wall-label-dot wall-label-dot-products" />
        Productos digitales
      </p>

      <div className="tv-wrap">
        <div className="tv-glow" aria-hidden="true" />
        <div className="tv-frame">
          <div className="screen">
            <div className="screen-chrome">
              <span className="screen-brand">JOTAPUNTOCE // ORGANIZACIONES</span>
              <span className="screen-live">
                <span className="screen-live-dot" />
                LIVE
              </span>
            </div>

            <div className="board-stats">
              <div className="board-stat">
                <div className="board-stat-value" ref={orgsRef}>
                  0
                </div>
                <div className="board-stat-label">Organizaciones</div>
              </div>
              <div className="board-stat">
                <div className="board-stat-value" ref={membersRef}>
                  0
                </div>
                <div className="board-stat-label">Miembros</div>
              </div>
            </div>

            <div className="apps">
              <a
                href={improvementUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="app-tile app-tile-active"
              >
                <span className="tile-icon tile-icon-live">
                  <span className="tile-shine" />
                  <svg
                    width="21"
                    height="21"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 21h18" />
                    <path d="M7 21V5" />
                    <path d="M7 5h12" />
                    <path d="M16 5v4" />
                    <rect x="13" y="9" width="6" height="5" rx="1" />
                    <path d="M9 21v-5h3v5" />
                  </svg>
                </span>
                <div className="tile-body">
                  <div className="tile-title-row">
                    <span className="tile-title">Improvement</span>
                    <span className="tile-badge tile-badge-live">ACTIVO</span>
                  </div>
                  <p className="tile-sub">Empresa digital en construcción</p>
                </div>
                <span className="tile-external">↗</span>
              </a>

              <div className="app-tile app-tile-dormant">
                <span className="tile-icon tile-icon-dormant">
                  <svg
                    width="21"
                    height="21"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="2.6 3.2"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <path d="M4 12h16" />
                    <path d="M12 4v16" />
                  </svg>
                </span>
                <div className="tile-body">
                  <div className="tile-title-row">
                    <span className="tile-title">Summum System</span>
                    <span className="tile-badge tile-badge-soon">PLANO</span>
                  </div>
                  <p className="tile-sub">Aún no se construye nada</p>
                </div>
              </div>
            </div>
          </div>
          <div className="tv-chin">
            <span className="tv-led" aria-hidden="true" />
            <span className="tv-brand">JOTAPUNTOCE</span>
          </div>
        </div>
      </div>
      <div className="screen-stand" />
      <div className="screen-base" />
    </div>
  );
}
