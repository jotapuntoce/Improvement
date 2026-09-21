"use client";

// Recepción compartida. El contenido interactivo de la tarjeta (el form de login real de
// apps/admin, o las puertas de la empresa en apps/improvement) llega como children — Reception solo
// pone la ambientación, igual para cualquier organización.
//
// `scene` la convierte en una recepción de verdad: mostrador, planta, sillas de espera y el logo
// del giro en la pared de atrás. Es opcional y no lo pasa apps/admin — ahí la recepción es la
// antesala de un login y el mobiliario estorbaría al formulario. En apps/improvement sí: esa
// pantalla ES el panel de la empresa, no un paso intermedio hacia otra cosa.
//
// `backLabel` también es opcional porque el botón de volver dejó de significar lo mismo en los dos
// lados: en admin se vuelve al edificio, en improvement se vuelve al portafolio.
import type { ReactNode } from "react";
import { IndustryGlyph } from "./AppIconLarge.tsx";
import type { Industry } from "./industries.ts";

export interface ReceptionProps {
  companyName: string;
  /** La línea bajo el nombre. Opcional: sin ella la pared solo dice el nombre de la empresa. */
  greeting?: string;
  onBack: () => void;
  backLabel?: string;
  /** Dibuja el mobiliario de recepción y el logo del giro en la pared. */
  scene?: boolean;
  industry?: Industry | string | null;
  children: ReactNode;
}

/**
 * El mobiliario. Va en SVG y no en divs con CSS porque son formas, no cajas: un mostrador con su
 * tapa, una planta, dos sillas de espera y el logo del giro en la pared de atrás. Puramente
 * decorativo — aria-hidden, sin texto, sin foco.
 */
function ReceptionScene({ industry }: { industry?: Industry | string | null }) {
  return (
    <svg
      className="jpc-reception-scene"
      viewBox="0 0 400 150"
      aria-hidden="true"
      focusable="false"
    >
      {/* Logo del giro en la pared de atrás — mismo glyph que el ícono de la empresa. */}
      <g transform="translate(176 8) scale(2)" color="var(--building-accent)" opacity=".5">
        <IndustryGlyph industry={industry} />
      </g>

      {/* Sillas de espera, a la izquierda. */}
      {[18, 62].map((x) => (
        <g key={x} fill="none" stroke="var(--building-accent)" strokeWidth="2" opacity=".45">
          <rect x={x} y={96} width="30" height="8" rx="3" />
          <rect x={x + 2} y={72} width="26" height="24" rx="4" />
          <line x1={x + 4} y1={104} x2={x + 4} y2={116} />
          <line x1={x + 26} y1={104} x2={x + 26} y2={116} />
        </g>
      ))}

      {/* Planta, a la derecha del mostrador. */}
      <g stroke="var(--building-accent)" strokeWidth="2" fill="none" opacity=".5">
        <path d="M354 112c0-14-8-22-16-26M354 112c0-14 8-22 16-26M354 112c0-10-2-20-2-28" />
        <path d="M344 112h20l-3 16h-14z" fill="var(--bg-reception-bot)" />
      </g>

      {/* El mostrador. Tapa en el degradado cálido, cuerpo en el tono de la pared. */}
      <rect x="112" y="104" width="176" height="34" rx="3" fill="var(--bg-reception-top)" />
      <rect
        x="104"
        y="96"
        width="192"
        height="12"
        rx="4"
        fill="var(--desk-top, var(--building-accent))"
        opacity=".85"
      />
      <line
        x1="112"
        y1="122"
        x2="288"
        y2="122"
        stroke="var(--building-accent)"
        strokeWidth="1.5"
        opacity=".35"
      />
    </svg>
  );
}

export function Reception({
  companyName,
  greeting,
  onBack,
  backLabel = "← Volver afuera",
  scene,
  industry,
  children,
}: ReceptionProps) {
  return (
    <div className={`jpc-reception${scene ? " jpc-reception--scene" : ""}`}>
      <div className="jpc-reception-wall">
        <p className="jpc-reception-eyebrow">Recepción</p>
        <p className="jpc-reception-word">{companyName}</p>
        {greeting && <p className="jpc-reception-sub">{greeting}</p>}
        {scene && <ReceptionScene industry={industry} />}
      </div>
      <div className="jpc-reception-card">
        {children}
        <button className="jpc-back-link" type="button" onClick={onBack}>
          {backLabel}
        </button>
      </div>
    </div>
  );
}
