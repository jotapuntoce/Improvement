"use client";

// Fachada nocturna de un edificio corporativo genérico — puerto real (React/JSX) del prototipo
// validado en Claude Artifacts. Áreas configurables por organización, cada una con sus ventanas
// que encienden una por una (nunca todas juntas) siguiendo el orden real del circuito punteado, y
// un científico loco silueteado por ventana con su propio gesto de "trabajando". Clic o
// Enter/Espacio dispara el zoom hacia la puerta; el componente que la monta decide cuándo
// desmontar esto y montar Reception.
import { useEffect, useMemo, useRef, useState } from "react";
import { IndustryGlyph } from "./AppIconLarge.tsx";
import {
  Acabados,
  EquipoAfuera,
  Ingenieros,
  MonoCintas,
  MonoListon,
  Obra,
  Plano,
  Terreno,
} from "./constructionSite.tsx";
import type { Industry } from "./industries.ts";
import { buildingShape, type BuildingShape } from "./shapes.ts";

// La ventana mide siempre lo mismo, en todos los edificios: es la escala humana de la escena y lo
// único que deja leer "esa torre tiene nueve pisos". Lo que cambia por giro es cuántas caben
// (packages/ui/src/building/shapes.ts) — el edificio crece en ventanas, no estirando las que tiene.
const CELL = 52;
const WIN = 32;

const VIEW_W = 660;
/** El edificio siempre está centrado y la puerta siempre cae aquí, mida lo que mida la fachada. */
const CENTER_X = VIEW_W / 2;
/** El suelo NO se mueve: un edificio más chaparro empieza más abajo, no flota. */
const GROUND_Y = 736;
/** Muro liso entre la última fila de ventanas y el suelo — donde van la puerta y la marquesina. */
const PLINTH = 130;
/** Franja de arriba, entre la ceja del edificio y la primera fila: ahí vive el rótulo. */
const SIGN_BAND = 114;
/** Muro a cada lado del grid de ventanas. */
const SIDE = 34;

const DOOR_W = 46;
const DOOR_H = 92;
const DOOR_GAP = 4;
const DOOR_CX = CENTER_X;
const DOOR_Y = GROUND_Y - DOOR_H;

interface Geometry {
  gx: number;
  gy: number;
  bx0: number;
  bx1: number;
  by0: number;
  by1: number;
}

/**
 * De "cuántas ventanas" a "qué rectángulo". Ancla en dos puntos que no se mueven nunca —el centro
 * del viewBox y la línea del suelo— para que la puerta, el terreno y las escenas de afuera sigan
 * cuadrando sin saber qué forma le tocó a este cliente.
 */
function geometry(shape: BuildingShape): Geometry {
  const gridW = (shape.cols - 1) * CELL + WIN;
  const gridH = (shape.rows - 1) * CELL + WIN;
  return {
    gx: CENTER_X - gridW / 2,
    gy: GROUND_Y - PLINTH - gridH,
    bx0: CENTER_X - gridW / 2 - SIDE,
    bx1: CENTER_X + gridW / 2 + SIDE,
    by0: GROUND_Y - PLINTH - gridH - SIGN_BAND,
    by1: GROUND_Y,
  };
}

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
  /**
   * En qué etapa del mapa de construcción va la empresa digital, 1 a 8 (BUILD_STAGES).
   *
   * Discreto y no un porcentaje: cada etapa tiene su propia escena — el terreno solo, los
   * ingenieros midiendo, la obra, los acabados, el equipo afuera, el moño. Ver ESCENAS.
   */
  stageOrder?: number;
  /** El nombre de la etapa actual, para el pie del edificio. */
  stageLabel?: string;
  /** El giro de la empresa — el glyph que va en la marquesina, sobre la puerta. */
  industry?: Industry | string | null;
}

// 2.6s entre turno y turno, encendida ~2.4s de eso (ver @keyframes jpc-window-turn en
// packages/ui/src/building.css) — suficiente para que el gesto de la silueta (loops de 1.3-1.8s)
// se vea completo al menos una vez antes de apagar. Fijo, no varía por organización.
const STAGGER = 2.6;

function cellCenter(g: Geometry, row: number, col: number) {
  return { x: g.gx + col * CELL + WIN / 2, y: g.gy + row * CELL + WIN / 2 };
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

// El cielo llega hasta donde empieza el edificio: una nave industrial deja mucho más cielo que
// una torre, y con una banda de estrellas fija la mitad de arriba se quedaba vacía.
function buildStars(skyH: number) {
  const rand = mulberry32(20260902);
  const stars = [];
  for (let i = 0; i < 46; i++) {
    stars.push({
      cx: (rand() * VIEW_W).toFixed(1),
      cy: (rand() * Math.max(skyH, 10)).toFixed(1),
      r: (rand() * 1.1 + 0.3).toFixed(2),
    });
  }
  return stars;
}

function buildAmbientWindows(cellMeta: Record<string, unknown>, rows: number, cols: number) {
  const rand = mulberry32(72340919);
  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (cellMeta[`${row},${col}`]) continue;
      if (rand() < 0.14) cells.push({ row, col });
    }
  }
  return cells;
}

/**
 * Científicos locos, uno por rol de área (0 0 24 24), silueta 100% sólida (#04060d — "tienen que
 * estar completamente de color negro porque es la sombra"). Pelo alborotado compartido (zigzag
 * relleno, no trazos delgados que se vean grises a escala de ventana), bata + piernas, un
 * instrumento por rol. Las clases jpc-gesture-* son la parte de la sombra que se mueve mientras la
 * ventana está encendida.
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

/**
 * Qué se ve en cada etapa del mapa de construcción (BUILD_STAGES, 1 a 8).
 *
 * Esta tabla ES la conexión entre el tracker y el edificio: el dueño abre su empresa y ve, sin
 * traducir nada, exactamente en qué punto va. No hay interpolación ni porcentajes — las etapas son
 * discretas y cada una tiene su escena. Un edificio que crece un 12.5% por etapa era mi versión
 * anterior y no contaba nada: solo se veía más alto.
 *
 * `edificio`: qué tanto existe la construcción.
 * `ventanas`: si hay gente adentro trabajando (las siluetas de las áreas).
 * `letrero`: si el rótulo con el nombre ya está puesto.
 * `capa`: la escena de afuera que le toca a esa etapa.
 */
type Escena = {
  edificio: "ninguno" | "huella" | "parcial" | "completo";
  ventanas: boolean;
  letrero: boolean;
  capa: "ingenieros" | "plano" | "obra" | "acabados" | "equipo" | "mono" | null;
  hint: string;
};

const ESCENAS: Record<number, Escena> = {
  // 1 Solicitud recibida
  1: { edificio: "ninguno", ventanas: false, letrero: false, capa: null, hint: "Este es tu terreno. Aquí va a estar tu empresa." },
  // 2 Análisis
  2: { edificio: "ninguno", ventanas: false, letrero: false, capa: "ingenieros", hint: "Estamos midiendo tu terreno." },
  // 3 Plano
  3: { edificio: "huella", ventanas: false, letrero: false, capa: "plano", hint: "Ya sabemos cómo va a ser. Esta es su huella." },
  // 4 Construcción
  4: { edificio: "parcial", ventanas: false, letrero: false, capa: "obra", hint: "Tu empresa se está construyendo." },
  // 5 Pruebas
  5: { edificio: "completo", ventanas: false, letrero: true, capa: "acabados", hint: "Ya está de pie. Le estamos dando los acabados." },
  // 6 Capacitación
  6: { edificio: "completo", ventanas: false, letrero: true, capa: "equipo", hint: "Tu equipo está afuera, aprendiendo a usarla." },
  // 7 Entrega
  7: { edificio: "completo", ventanas: true, letrero: true, capa: "mono", hint: "Es tuya. Corta el listón." },
  // 8 Seguimiento
  8: { edificio: "completo", ventanas: true, letrero: true, capa: null, hint: "Toca el edificio para entrar →" },
};

/** Sin etapa conocida se dibuja terminado: es como se dibujaba antes de que supiera del tracker. */
const ESCENA_DEFAULT = ESCENAS[8]!;

// Dónde empieza la fachada cuando el edificio va a medias. 0.52 y no 0.5 para que se vea
// claramente por debajo del centro — a la mitad exacta parece una decisión de nadie.
const PARCIAL_SHARE = 0.52;
const HUELLA_ALTO = 26;

// Encuadre. Con edificio se ve la escena completa; sin edificio se recorta a la franja de abajo,
// donde está el terreno. Sin esto, las tres primeras etapas eran 500px de cielo vacío con una línea
// de suelo hasta el fondo — se veía como una pantalla rota, no como un terreno.
const VIEW_COMPLETO = "0 0 660 800";
const VIEW_TERRENO = "0 592 660 208";
export function Building({
  companyName,
  slogan,
  areas,
  onEnter,
  stageOrder,
  stageLabel,
  industry,
}: BuildingProps) {
  const [entering, setEntering] = useState(false);
  const [monoCortado, setMonoCortado] = useState(false);
  const [tagX, setTagX] = useState<number | null>(null);
  const wordRef = useRef<SVGTextElement>(null);

  // Qué forma tiene ESTE edificio. El mismo buildingShape(industry) que ya usó buildBuildingGraph
  // para repartir las ventanas entre las áreas: los dos leen el giro, así que no pueden discrepar.
  const shape = buildingShape(industry);
  const geom = useMemo(() => geometry(shape), [shape]);

  const { cellMeta, cycle, circuitPoints, circuitD, ambientWindows, stars } = useMemo(() => {
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
          const c = cellCenter(geom, row, col);
          return { x: acc.x + c.x, y: acc.y + c.y };
        },
        { x: 0, y: 0 },
      );
      return { x: sum.x / a.cells.length, y: sum.y / a.cells.length };
    });

    // Non-null assertions: `p` siempre recorre [1, points.length), así que `p - 1` y `p` siempre
    // caen dentro del arreglo — noUncheckedIndexedAccess no puede probarlo por sí solo (mismo
    // patrón ya usado en distributeCells más abajo en este mismo módulo hermano, buildingGraph.ts).
    let d = points.length ? `M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}` : "";
    for (let p = 1; p < points.length; p++) {
      const prev = points[p - 1]!;
      const cur = points[p]!;
      const midX = (prev.x + cur.x) / 2;
      d += ` L ${midX.toFixed(1)} ${prev.y.toFixed(1)} L ${midX.toFixed(1)} ${cur.y.toFixed(1)} L ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
    }

    return {
      cellMeta: meta,
      cycle: totalLit * STAGGER,
      circuitPoints: points,
      circuitD: d,
      ambientWindows: buildAmbientWindows(meta, shape.rows, shape.cols),
      stars: buildStars(geom.by0 - 10),
    };
  }, [areas, geom, shape]);

  // Alinea la última letra del tagline con el final del nombre de la empresa en el rótulo
  // midiendo el ancho real ya con la tipografía cargada — antes de eso getBBox() reflejaría la
  // fuente de reserva y descuadraría todo (mismo bug ya resuelto en el prototipo de Artifacts).
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
    // Entrega: el primer clic corta el listón, el segundo entra. Es la única vez que el producto
    // le pone un paso de más a propósito — cortar el listón de tu propia empresa se hace una vez.
    if (escena.capa === "mono" && !monoCortado) {
      setMonoCortado(true);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onEnter();
      return;
    }
    setEntering(true);
    window.setTimeout(onEnter, 850);
  }

  const signCX = CENTER_X;
  const wordY = geom.by0 + 46;
  // El nombre se ajusta al ancho de ESTE edificio: 38px cabían en la fachada de 516 del giro
  // original, pero se desbordaban por los dos lados en la torre angosta de un despacho.
  const wordSize = Math.min(38, (geom.bx1 - geom.bx0) * 0.074);

  const escena = (stageOrder ? ESCENAS[stageOrder] : undefined) ?? ESCENA_DEFAULT;
  const hayEdificio = escena.edificio === "parcial" || escena.edificio === "completo";
  const facadeY =
    escena.edificio === "parcial"
      ? geom.by0 + (geom.by1 - geom.by0) * PARCIAL_SHARE
      : geom.by0;
  // La primera fila de ventanas que cae dentro de la fachada dibujada. Abajo de eso no hay muro
  // en el que poner una ventana, así que esas filas no se dibujan en absoluto.
  const firstBuiltRow = Math.max(0, Math.ceil((facadeY - geom.gy + (CELL - WIN) / 2) / CELL));

  return (
    <div className="jpc-stage-wrap">
      <div
        className={`jpc-stage${entering ? " jpc-zoom-enter" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`Entrar a ${companyName}`}
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
          viewBox={hayEdificio ? VIEW_COMPLETO : VIEW_TERRENO}
          role="img"
          aria-label={
            hayEdificio
              ? `Edificio de ${companyName} de noche. ${escena.hint}`
              : `El terreno donde se va a construir ${companyName}. ${escena.hint}`
          }
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
            {stars.map((s, i) => (
              <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
            ))}
          </g>

          {/* El terreno está siempre: debajo del edificio en cada etapa, y solo él en la primera. */}
          <Terreno x0={geom.bx0} x1={geom.bx1} groundY={geom.by1} companyName={companyName} />

          {escena.edificio === "huella" && (
            <Plano x0={geom.bx0} x1={geom.bx1} groundY={geom.by1} huellaAlto={HUELLA_ALTO} />
          )}

          {hayEdificio && (
            <rect
              x={geom.bx0}
              y={facadeY}
              width={geom.bx1 - geom.bx0}
              height={geom.by1 - facadeY}
              rx="6"
              fill="url(#jpc-facadeGrad)"
              stroke="var(--building-accent)"
              strokeWidth="2"
            />
          )}
          {escena.capa === "mono" && (
            <MonoCintas x0={geom.bx0} x1={geom.bx1} topY={geom.by0 - 16} bottomY={geom.by1} />
          )}

          {escena.capa === "ingenieros" && <Ingenieros x0={geom.bx0} x1={geom.bx1} groundY={geom.by1} />}
          {escena.capa === "obra" && (
            <Obra
              x0={geom.bx0}
              x1={geom.bx1}
              topY={geom.by0}
              buildLineY={facadeY}
              groundY={geom.by1}
              paso={CELL}
            />
          )}
          {escena.capa === "acabados" && <Acabados x0={geom.bx0} groundY={geom.by1} facadeY={facadeY} />}

          {escena.letrero && (
            <>
          <rect
            x={geom.bx0 - 6}
            y={geom.by0 - 16}
            width={geom.bx1 - geom.bx0 + 12}
            height="16"
            rx="3"
            fill="var(--bg-facade-2)"
            stroke="var(--building-accent)"
            strokeWidth="1.5"
          />

          <text x={signCX} y={wordY} textAnchor="middle" className="jpc-sign-word" fill="var(--sign-glow)" fontSize={wordSize} filter="url(#jpc-softGlow)" ref={wordRef}>
            {companyName}
          </text>
          <rect x={signCX - 30} y={wordY + 12} width="60" height="2.4" rx="1.2" fill="var(--accent-2)" />
          {tagX !== null && slogan && (
            <text x={tagX} y={wordY + 30} textAnchor="end" className="jpc-sign-tagline" fill="var(--gold)" fontSize="15">
              {slogan}
            </text>
          )}
            </>
          )}

          {hayEdificio && (
          <g>
            {Array.from({ length: shape.rows }).map((_, row) =>
              Array.from({ length: shape.cols }).map((_, col) => {
                const meta = cellMeta[`${row},${col}`];
                const c = cellCenter(geom, row, col);
                const wx = c.x - WIN / 2;
                const wy = c.y - WIN / 2;
                const isAmbient = !meta && ambientWindows.some((a) => a.row === row && a.col === col);

                // Ese piso todavía no se entrega: no hay ventana que prender, ni siquiera apagada.
                if (row < firstBuiltRow) return null;

                // Sin área asignada, o con el edificio todavía vacío de gente: ventana apagada.
                // Un muro liso sin una sola ventana no se lee como "en acabados", se lee como que
                // falta dibujar algo.
                if (!meta || !escena.ventanas) {
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
          )}

          {escena.ventanas && (
          <>
          <path d={circuitD} fill="none" stroke="var(--building-accent)" strokeWidth="1.6" strokeDasharray="1 7" strokeLinecap="round" opacity=".55" />
          {circuitPoints.map((pt, i) => (
            // circuitPoints se deriva de areas.map(...) arriba, así que circuitPoints.length ===
            // areas.length siempre — areas[i]! es seguro por construcción.
            <circle key={i} cx={pt.x.toFixed(1)} cy={pt.y.toFixed(1)} r="2.4" fill={areas[i]!.color} />
          ))}
          </>
          )}

          {escena.edificio === "completo" && (
            <>
              {/* El giro de la empresa, en la marquesina sobre la puerta. Mismo glyph que su ícono. */}
              <g
                transform={`translate(${DOOR_CX - 16} ${DOOR_Y - 42}) scale(1.35)`}
                color="var(--building-accent)"
                opacity=".8"
              >
                <IndustryGlyph industry={industry} />
              </g>

              {[-1, 1].map((side) => {
                const dx = DOOR_CX + (side * DOOR_GAP) / 2 + (side < 0 ? -DOOR_W : 0);
                return (
                  <g key={side}>
                    <rect x={dx} y={DOOR_Y} width={DOOR_W} height={DOOR_H} rx="2" fill="var(--bg-facade-2)" stroke="var(--building-accent)" strokeWidth="1.4" />
                    <circle cx={side < 0 ? dx + DOOR_W - 7 : dx + 7} cy={DOOR_Y + DOOR_H / 2} r="1.6" fill="var(--building-accent)" />
                  </g>
                );
              })}
            </>
          )}

          {/* La gente va encima de la fachada: están afuera, entre el edificio y quien mira. */}
          {escena.capa === "equipo" && <EquipoAfuera doorCX={DOOR_CX} groundY={geom.by1} />}
          {escena.capa === "mono" && (
            <MonoListon
              x0={geom.bx0}
              x1={geom.bx1}
              doorCX={DOOR_CX}
              ribbonY={DOOR_Y + DOOR_H / 2}
              cortado={monoCortado}
            />
          )}
        </svg>
      </div>
      <p className="jpc-enter-hint">
        {stageLabel ? `${stageLabel} · ` : ""}
        {escena.capa === "mono" && monoCortado ? "Listo. Entra a tu empresa →" : escena.hint}
      </p>
    </div>
  );
}
