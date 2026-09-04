"use client";

import { useEffect, useRef } from "react";

// Las 6 áreas creativas de JotaPuntoCe (Planeación, Soluciones, Imaginación, Valor agregado,
// Branding, Presentación) — mismo set de la fachada del edificio en /login
// (components/building/LoginExperience.js, que monta Building/Reception de @jotapuntoce/ui). Son
// la identidad interna fija de la empresa, no datos de una organización cliente, así que viven
// como constante aquí, igual que allá.
const AREAS = [
  { key: "planeacion", name: "Planeación", tokenVar: "--dept-planeacion", count: 2 },
  { key: "soluciones", name: "Soluciones", tokenVar: "--dept-soluciones", count: 1 },
  { key: "imaginacion", name: "Imaginación", tokenVar: "--dept-imaginacion", count: 3 },
  { key: "valor", name: "Valor agregado", tokenVar: "--dept-valor", count: 1 },
  { key: "branding", name: "Branding", tokenVar: "--dept-branding", count: 2 },
  { key: "presentacion", name: "Presentación", tokenVar: "--dept-presentacion", count: 1 },
];

// NOTA: ni el conteo por área (arriba) ni los mensajes urgentes (abajo) tienen todavía una fuente
// de datos real — no existe en el esquema un concepto de "urgencia" o "proyectos por área de
// JotaPuntoCe" (packages/db/src/schema.ts no tiene esa tabla). Se dejan como contenido de ejemplo,
// visible y marcado aquí, hasta que se decida de dónde sale ese dato.
const ALERT_MESSAGES = [
  "Planeación: 2 planes por revisar antes del viernes",
  "Soluciones: 1 combinación de producto sin cerrar",
  "Imaginación: una idea nueva esperando forma",
  "Valor agregado: 1 detalle pendiente en Improvement",
  "Branding: 2 piezas de esta semana sin publicar",
  "Presentación: 1 demo por agendar con el cliente",
];

const TOTAL_PENDING = AREAS.reduce((sum, a) => sum + a.count, 0);

export default function AreasPanel() {
  const alertRef = useRef(null);

  useEffect(() => {
    const el = alertRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let idx = 0;
    const id = setInterval(() => {
      idx = (idx + 1) % ALERT_MESSAGES.length;
      if (reduced) {
        el.textContent = ALERT_MESSAGES[idx];
        return;
      }
      el.classList.add("is-swapping");
      setTimeout(() => {
        el.textContent = ALERT_MESSAGES[idx];
        el.classList.remove("is-swapping");
      }, 350);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="areas-mount">
      <p className="wall-label">
        <span className="wall-label-dot wall-label-dot-areas" />
        Áreas de la empresa
      </p>

      <div className="areas-panel">
        <div className="areas-decor">
          <div className="wall-clock">
            <div className="clock-hand clock-hand-h" />
            <div className="clock-hand clock-hand-m" />
            <div className="clock-hand clock-hand-s" />
            <div className="clock-pin" />
          </div>
          <div className="dept-counts">
            {AREAS.map((area) => (
              <span className="count-chip" key={area.key}>
                <span className="count-swatch" style={{ "--dc": `var(${area.tokenVar})` }} />
                {area.count}
              </span>
            ))}
          </div>
          <div className="areas-alert">
            <span className="alert-dot" />
            <span className="alert-text" ref={alertRef}>
              {ALERT_MESSAGES[0]}
            </span>
          </div>
        </div>

        {/* Todavía no existe una página real por área — el hover ya se siente como "puedes
            entrar" (pedido explícito), pero el href queda en # hasta que haya un destino real. */}
        <div className="dept-grid">
          {AREAS.map((area) => (
            <a href="#" className="dept-item" key={area.key}>
              <span className="dept-swatch" style={{ "--dc": `var(${area.tokenVar})` }} />
              <span className="dept-name">{area.name}</span>
              <span className="dept-enter">→</span>
            </a>
          ))}
        </div>

        <div className="wall-notice">
          <p className="notice-title">Resumen</p>
          <p className="notice-text">
            <b>{TOTAL_PENDING}</b> pendientes activos esta semana —{" "}
            {AREAS.map((area, i) => (
              <span key={area.key}>
                <b>{area.count}</b> en {area.name}
                {i < AREAS.length - 2 ? ", " : i === AREAS.length - 2 ? " y " : "."}
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}
