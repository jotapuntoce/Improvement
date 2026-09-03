"use client";

// Fachada nocturna de JotaPuntoCe — puerto real (React/JSX) del prototipo validado en Claude
// Artifacts. Seis áreas creativas, cada una con 3 ventanas que encienden una por una (nunca todas
// juntas) siguiendo el orden real del circuito punteado, y un científico loco silueteado por
// ventana con su propio gesto de "trabajando". Clic o Enter/Espacio dispara el zoom hacia la
// puerta; LoginExperience.js decide cuándo desmontar esto y montar ReceptionLogin.
import { useEffect, useMemo, useRef, useState } from "react";

const COLS = 9;
const ROWS = 8;
const GX = 106;
const GY = 210; // top-left del grid de ventanas — centra una fachada de 516px en el viewBox de 660
const CELL = 52;
const WIN = 32;

const GRID_W = (COLS - 1) * CELL + WIN;
const GRID_H = (ROWS - 1) * CELL + WIN;
const BX0 = GX - 34;
const BY0 = 96;
const BX1 = GX + GRID_W + 34;
const BY1 = GY + GRID_H + 130;

const DOOR_W = 46;
const DOOR_H = 92;
const DOOR_GAP = 4;
const DOOR_CX = BX0 + (BX1 - BX0) / 2;
const DOOR_Y = BY1 - DOOR_H;

export type SilhouetteKind = "plan" | "sol" | "imag" | "valor" | "brand" | "pres" | "generica";

export interface BuildingArea {
  id: string;
  name: string;
  color: string;
  cells: [number, number][];
  silhouette?: SilhouetteKind;
}

export interface BuildingProps {
  companyName: string;
  slogan?: string;
  areas: BuildingArea[];
  onEnter: () => void;
}

// 2.6s entre turno y turno, encendida ~2.4s de eso (ver @keyframes jpc-window-turn en
// packages/ui/src/building.css) — suficiente para que el gesto de la silueta (loops de 1.3-1.8s)
// se vea completo al menos una vez antes de apagar. Fijo, no varía por organización.
const STAGGER = 2.6;

function cellCenter(row: number, col: number) {
  return { x: GX + col * CELL + WIN / 2, y: GY + row * CELL + WIN / 2 };
}

// PRNG determinista (mulberry32) — las mismas "estrellas" y el mismo parpadeo ambiente de ventanas
// apagadas en cada render, servidor o cliente. Math.random() aquí produciría un mismatch de
// hidratación (el server y el primer render del cliente verían valores distintos).
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStars() {
  const rand = mulberry32(20260902);
  const stars = [];
  for (let i = 0; i < 46; i++) {
    stars.push({
      cx: (rand() * 660).toFixed(1),
      cy: (rand() * (BY0 - 10)).toFixed(1),
      r: (rand() * 1.1 + 0.3).toFixed(2),
    });
  }
  return stars;
}
const STARS = buildStars();

function buildAmbientWindows(cellMeta: Record<string, unknown>) {
  const rand = mulberry32(72340919);
  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (cellMeta[`${row},${col}`]) continue;
      if (rand() < 0.14) cells.push({ row, col });
    }
  }
  return cells;
}

/**
 * Seis científicos locos, 0 0 24 24, silueta 100% sólida (#04060d — "tienen que estar
 * completamente de color negro porque es la sombra"). Pelo alborotado compartido (zigzag relleno,
 * no trazos delgados que se vean grises a escala de ventana), bata + piernas, un instrumento por
 * rol. Las clases jpc-gesture-* son la parte de la sombra que se mueve mientras la ventana está
 * encendida.
 */
function ScientistDefs() {
  return (
    <defs>
      <symbol id="jpc-ic-plan" viewBox="0 0 24 24" fill="#04060d">
        <path d="M6.4 5.6 L7.4 1 L9 4.8 L10.4 0.4 L12 5 L13.6 0.4 L15 4.8 L16.6 1 L17.6 5.6 Z" />
        <circle cx="12" cy="7.6" r="3.2" />
        <path d="M8 22 L8.3 17 C8.3 12.6 9.6 11.4 12 11.4 C14.4 11.4 15.7 12.6 15.7 17 L16 22 L13.2 22 L12.9 17.4 L11.1 17.4 L10.8 22 Z" />
        <path d="M8.6 13.4 L4.6 16.4 L5.6 17.8 L9.4 14.6 Z" />
        <path d="M15.4 13.6 L17.2 16.4 L16 17.2 L14.4 14.6 Z" />
        <rect x="2.4" y="16.4" width="4.4" height="4.2" rx=".5" />
        <rect className="jpc-gesture-tilt" x="3.6" y="14.4" width="1" height="3.6" rx=".4" />
      </symbol>

      <symbol id="jpc-ic-sol" viewBox="0 0 24 24" fill="#04060d">
        <path d="M6.4 5.6 L7.4 1 L9 4.8 L10.4 0.4 L12 5 L13.6 0.4 L15 4.8 L16.6 1 L17.6 5.6 Z" />
        <circle cx="12" cy="7.6" r="3.2" />
        <path d="M8 22 L8.3 17 C8.3 12.6 9.6 11.4 12 11.4 C14.4 11.4 15.7 12.6 15.7 17 L16 22 L13.2 22 L12.9 17.4 L11.1 17.4 L10.8 22 Z" />
        <path d="M8.4 13.8 L3.8 15.8 L4.4 17.2 L8.8 15.2 Z" />
        <path d="M15.6 13.8 L20.2 15.8 L19.6 17.2 L15.2 15.2 Z" />
        <g className="jpc-gesture-pulse">
          <rect x="2.7" y="13.6" width="1.3" height="2.6" rx=".3" />
          <circle cx="3.35" cy="17.6" r="2.1" />
        </g>
        <g className="jpc-gesture-pulse" style={{ animationDelay: ".5s" }}>
          <rect x="20" y="13.6" width="1.3" height="2.6" rx=".3" />
          <circle cx="20.65" cy="17.6" r="2.1" />
        </g>
      </symbol>

      <symbol id="jpc-ic-imag" viewBox="0 0 24 24" fill="#04060d">
        <path d="M7.2 5.2 L8 1.6 L9.4 4.8 L10.6 1 L12 5 L13.4 1 L14.6 4.8 L16 1.6 L16.8 5.2 Z" />
        <circle cx="12" cy="7.8" r="3.6" />
        <path d="M8.4 22 C8.5 17 9.4 13.6 12 13.6 C14.6 13.6 15.5 17 15.6 22 Z" />
        <path d="M11.6 13.4 L5 6.6 L6.2 5.2 L12.6 12 Z" />
        <path d="M12.4 13.4 L19 6.6 L17.8 5.2 L11.4 12 Z" />
        <path className="jpc-gesture-pulse" d="M4 4 L4.8 1.8 L5.6 4 L4.8 5 Z" />
        <path className="jpc-gesture-pulse" style={{ animationDelay: ".3s" }} d="M19.2 3 L20 .8 L20.8 3 L20 4 Z" />
        <path className="jpc-gesture-pulse" style={{ animationDelay: ".6s" }} d="M1.4 9 L2.4 7.6 L3.4 9 L2.4 10 Z" />
      </symbol>

      <symbol id="jpc-ic-valor" viewBox="0 0 24 24" fill="#04060d">
        <path d="M6.4 5.6 L7.4 1 L9 4.8 L10.4 0.4 L12 5 L13.6 0.4 L15 4.8 L16.6 1 L17.6 5.6 Z" />
        <circle cx="12" cy="7.6" r="3.2" />
        <path d="M8 22 L8.3 17 C8.3 12.6 9.6 11.4 12 11.4 C14.4 11.4 15.7 12.6 15.7 17 L16 22 L13.2 22 L12.9 17.4 L11.1 17.4 L10.8 22 Z" />
        <path d="M9.8 13.6 L9.4 16.6 L11.2 16.8 L11.4 13.8 Z" />
        <rect x="9.9" y="16.4" width="1.2" height="2.2" rx=".3" />
        <circle cx="10.5" cy="20" r="2" />
        <path className="jpc-gesture-tilt" d="M14.2 13.6 L18.4 10.2 L19.2 11.2 L15.4 14.6 Z" />
        <path className="jpc-gesture-pulse" d="M19 8.4 L19.8 6.6 L20.6 8.4 L19.8 9.4 Z" />
      </symbol>

      <symbol id="jpc-ic-brand" viewBox="0 0 24 24" fill="#04060d">
        <path d="M5.4 5.6 L6.4 1 L8 4.8 L9.4 0.4 L11 5 L12.6 0.4 L14 4.8 L15.6 1 L16.6 5.6 Z" />
        <circle cx="11" cy="7.6" r="3.2" />
        <path d="M7 22 L7.3 17 C7.3 12.6 8.6 11.4 11 11.4 C13.4 11.4 14.7 12.6 14.7 17 L15 22 L12.2 22 L11.9 17.4 L10.1 17.4 L9.8 22 Z" />
        <path d="M13.4 13.6 L14.8 15 L13.8 16 L12 14.4 Z" />
        <rect x="14.6" y="12" width="7.6" height="6.4" rx=".7" />
        <rect x="17.4" y="18.4" width="1.8" height="1.8" />
        <rect className="jpc-gesture-pulse" x="15.7" y="13.3" width="5.2" height="1.4" rx=".5" fill="#0c1626" />
        <rect className="jpc-gesture-pulse" style={{ animationDelay: ".45s" }} x="15.7" y="15.4" width="3.4" height="1.4" rx=".5" fill="#0c1626" />
      </symbol>

      <symbol id="jpc-ic-pres" viewBox="0 0 24 24" fill="#04060d">
        <path d="M6.4 5.6 L7.4 1 L9 4.8 L10.4 0.4 L12 5 L13.6 0.4 L15 4.8 L16.6 1 L17.6 5.6 Z" />
        <circle cx="12" cy="7.6" r="3.2" />
        <path d="M7 22 L7.6 17.4 C7.7 12.8 9.2 11.4 12 11.4 C14.8 11.4 16.3 12.8 16.4 17.4 L17 22 L13.6 22 L12.6 17.6 L11.4 17.6 L10.4 22 Z" />
        <path d="M14.4 13 L20 9.2 L21 10.8 L15.2 14.6 Z" />
        <path d="M9.6 13 L6.4 10.4 L5.4 11.8 L9 14.6 Z" />
        <rect className="jpc-gesture-float" x="20.4" y="4" width="3.2" height="6" rx=".6" transform="rotate(12 22 7)" />
      </symbol>

      <symbol id="jpc-ic-generica" viewBox="0 0 24 24" fill="#04060d">
        <path d="M6.4 5.6 L7.4 1 L9 4.8 L10.4 0.4 L12 5 L13.6 0.4 L15 4.8 L16.6 1 L17.6 5.6 Z" />
        <circle cx="12" cy="7.6" r="3.2" />
        <path d="M8 22 L8.3 17 C8.3 12.6 9.6 11.4 12 11.4 C14.4 11.4 15.7 12.6 15.7 17 L16 22 L13.2 22 L12.9 17.4 L11.1 17.4 L10.8 22 Z" />
        <rect className="jpc-gesture-pulse" x="6.6" y="13.6" width="1.6" height="5.6" rx=".8" transform="rotate(-6 7.4 16.4)" />
        <rect className="jpc-gesture-pulse" style={{ animationDelay: ".4s" }} x="15.8" y="13.6" width="1.6" height="5.6" rx=".8" transform="rotate(6 16.6 16.4)" />
      </symbol>
    </defs>
  );
}

export function Building({ companyName, slogan, areas, onEnter }: BuildingProps) {
  const [entering, setEntering] = useState(false);
  const [tagX, setTagX] = useState<number | null>(null);
  const wordRef = useRef<SVGTextElement>(null);

  const { cellMeta, cycle, circuitPoints, circuitD, ambientWindows } = useMemo(() => {
    const totalLit = areas.reduce((n, a) => n + a.cells.length, 0);
    const meta: Record<string, { area: BuildingArea; seq: number }> = {};
    let seq = 0;
    for (const a of areas) {
      for (const [row, col] of a.cells) {
        meta[`${row},${col}`] = { area: a, seq: seq++ };
      }
    }

    const points = areas.map((a) => {
      const sum = a.cells.reduce(
        (acc, [row, col]) => {
          const c = cellCenter(row, col);
          return { x: acc.x + c.x, y: acc.y + c.y };
        },
        { x: 0, y: 0 },
      );
      return { x: sum.x / a.cells.length, y: sum.y / a.cells.length };
    });

    let d = points.length ? `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}` : "";
    for (let p = 1; p < points.length; p++) {
      const prev = points[p - 1];
      const cur = points[p];
      const midX = (prev.x + cur.x) / 2;
      d += ` L ${midX.toFixed(1)} ${prev.y.toFixed(1)} L ${midX.toFixed(1)} ${cur.y.toFixed(1)} L ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
    }

    return {
      cellMeta: meta,
      cycle: totalLit * STAGGER,
      circuitPoints: points,
      circuitD: d,
      ambientWindows: buildAmbientWindows(meta),
    };
  }, [areas]);

  // Alinea la última letra del tagline con el final de la "E" de JOTAPUNTOCE midiendo el ancho
  // real ya con la tipografía cargada — antes de eso getBBox() reflejaría la fuente de reserva y
  // descuadraría todo (mismo bug ya resuelto en el prototipo de Artifacts).
  useEffect(() => {
    let cancelled = false;
    function measure() {
      if (cancelled || !wordRef.current) return;
      const box = wordRef.current.getBBox();
      setTagX(box.x + box.width);
    }
    if (document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(measure);
    } else {
      measure();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  function handleEnter() {
    if (entering) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onEnter();
      return;
    }
    setEntering(true);
    window.setTimeout(onEnter, 850);
  }

  const signCX = BX0 + (BX1 - BX0) / 2;
  const wordY = BY0 + 46;

  return (
    <div className="jpc-stage-wrap">
      <div
        className={`jpc-stage${entering ? " jpc-zoom-enter" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Entrar a JotaPuntoCe"
        onClick={handleEnter}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleEnter();
          }
        }}
      >
        <div className="jpc-ground-glow" aria-hidden="true" />
        <svg
          viewBox="0 0 660 800"
          role="img"
          aria-label="Edificio de JotaPuntoCe de noche, con ventanas iluminadas por área"
        >
          <defs>
            <linearGradient id="jpc-facadeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bg-facade)" />
              <stop offset="100%" stopColor="var(--bg-facade-2)" />
            </linearGradient>
            <filter id="jpc-softGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <ScientistDefs />

          <g fill="#e8edfb" opacity=".55">
            {STARS.map((s, i) => (
              <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
            ))}
          </g>

          <rect
            x={BX0}
            y={BY0}
            width={BX1 - BX0}
            height={BY1 - BY0}
            rx="6"
            fill="url(#jpc-facadeGrad)"
            stroke="var(--building-accent)"
            strokeWidth="2"
          />
          <rect
            x={BX0 - 6}
            y={BY0 - 16}
            width={BX1 - BX0 + 12}
            height="16"
            rx="3"
            fill="var(--bg-facade-2)"
            stroke="var(--gold)"
            strokeWidth="1.5"
          />

          <text x={signCX} y={wordY} textAnchor="middle" className="jpc-sign-word" fill="var(--sign-glow)" fontSize="38" filter="url(#jpc-softGlow)" ref={wordRef}>
            {companyName}
          </text>
          <rect x={signCX - 30} y={wordY + 12} width="60" height="2.4" rx="1.2" fill="var(--accent-2)" />
          {tagX !== null && slogan && (
            <text x={tagX} y={wordY + 30} textAnchor="end" className="jpc-sign-tagline" fill="var(--gold)" fontSize="15">
              {slogan}
            </text>
          )}

          <g>
            {Array.from({ length: ROWS }).map((_, row) =>
              Array.from({ length: COLS }).map((_, col) => {
                const meta = cellMeta[`${row},${col}`];
                const c = cellCenter(row, col);
                const wx = c.x - WIN / 2;
                const wy = c.y - WIN / 2;
                const isAmbient = !meta && ambientWindows.some((a) => a.row === row && a.col === col);

                if (!meta) {
                  return (
                    <rect
                      key={`${row},${col}`}
                      x={wx}
                      y={wy}
                      width={WIN}
                      height={WIN}
                      rx="3"
                      fill={isAmbient ? "#3a3120" : "var(--bg-window-off)"}
                      opacity={isAmbient ? 0.5 : 1}
                      stroke="var(--border-window)"
                      strokeWidth="1"
                    />
                  );
                }

                return (
                  <g
                    key={`${row},${col}`}
                    className="jpc-window-turn"
                    style={{ animationDelay: `${meta.seq * STAGGER}s`, animationDuration: `${cycle}s` }}
                  >
                    <rect x={wx} y={wy} width={WIN} height={WIN} rx="3" fill={meta.area.color} stroke="var(--border-window)" strokeWidth="1" filter="url(#jpc-softGlow)" />
                    <use href={`#jpc-ic-${meta.area.silhouette ?? "generica"}`} x={wx + WIN * 0.14} y={wy + WIN * 0.1} width={WIN * 0.72} height={WIN * 0.82} />
                  </g>
                );
              }),
            )}
          </g>

          <path d={circuitD} fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeDasharray="1 7" strokeLinecap="round" opacity=".55" />
          {circuitPoints.map((pt, i) => (
            <circle key={i} cx={pt.x.toFixed(1)} cy={pt.y.toFixed(1)} r="2.4" fill={areas[i].color} />
          ))}

          {[-1, 1].map((side) => {
            const dx = DOOR_CX + (side * DOOR_GAP) / 2 + (side < 0 ? -DOOR_W : 0);
            return (
              <g key={side}>
                <rect x={dx} y={DOOR_Y} width={DOOR_W} height={DOOR_H} rx="2" fill="var(--bg-facade-2)" stroke="var(--building-accent)" strokeWidth="1.4" />
                <circle cx={side < 0 ? dx + DOOR_W - 7 : dx + 7} cy={DOOR_Y + DOOR_H / 2} r="1.6" fill="var(--building-accent)" />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="jpc-enter-hint">Toca el edificio para entrar →</p>
    </div>
  );
}
