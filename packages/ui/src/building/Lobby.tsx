"use client";

// La recepción de la empresa del cliente. No es un panel con tarjetas: es una oficina, y todo lo
// que se puede abrir es un mueble dentro de ella.
//
//   Áreas      -> la planta de cubículos, en banda, hasta arriba
//   Objetivos  -> el pizarrón de vidrio de la pared izquierda
//   Equipo     -> el muro de retratos de la pared derecha
//   Proyectos  -> la iMac del mostrador
//   Clientes   -> el letrero de mostrador, sobre su poste
//   PowerUps   -> el lector de acceso pegado a la pared del pasillo
//
// Cada uno con su mueble propio, y de tamaño fijo: un mueble es una de las cosas que el dueño
// quiere tener a la vista, no un contenedor que se estire con los datos de hoy. Lo que cambia es lo
// que él decide poner adentro. Las medidas viven en ZONAS (lobbyPlano.ts).
//
// Áreas y Objetivos van en muebles distintos a propósito: un área es una parte de la empresa y un
// objetivo es una meta con puntos. Juntos se leían como lo mismo. Las áreas van en banda horizontal
// porque de cuatro en adelante una columna no cabe en ningún panel, y en fila sí caben todas — y
// van arriba del todo, no en el frente del mostrador, porque ahí las cruzaba la cinta de luz.
//
// El mapa de construcción NO vive aquí: eso se cuenta afuera, en el edificio (Building.tsx).
//
// CÓMO ESTÁ ARMADO. El SVG es escenografía y nada más — va aria-hidden y no recibe foco. Encima va
// una capa de enlaces de HTML de verdad, uno por mueble, posicionados en porcentaje sobre la misma
// caja. Así cada zona tiene su nombre accesible, su anillo de foco y su área de toque real. Poner
// los enlaces dentro del SVG habría dado lo contrario: bonito y con un foco imposible de ver.
//
// La geometría de cada mueble vive UNA vez, en ZONAS. El marco que dibuja el SVG y la caja que
// posiciona el HTML salen del mismo número — si se movieran por separado, el contenido se saldría
// del mueble en cuanto alguien tocara uno de los dos.
//
// Todo lo personalizable entra por props y sale de la fila de la organización: el nombre en la
// pared, el glyph del giro, la paleta (heredada por CSS del wrapper) y los nombres de las puertas,
// que el dueño renombra o apaga en organization.section_labels. Nada aquí menciona una empresa.
import type { CSSProperties, ReactNode } from "react";
import { IndustryGlyph } from "./AppIconLarge.tsx";
import type { Industry } from "./industries.ts";
import {
  APOYO_Y,
  type Caja,
  ESCENA,
  GLOBO,
  type LobbyZona,
  MARCOS,
  MAX_PROYECTOS,
  MAX_RETRATOS,
  MOSTRADOR_Y,
  PARED,
  RECEPCION_CABEZA,
  RECEPCION_CX,
  ZONAS,
} from "./lobbyPlano.ts";

export type { LobbyZona };

const W = ESCENA.w;
const H = ESCENA.h;
/** Alto del plafón. Debajo de esta línea empieza la pared, y nada la toca. */
const TECHO = PARED.y0;
/** Dónde la pared del fondo toca el piso. */
const FLOOR_Y = PARED.y1;
/** Cara superior del mostrador. */
const DESK_TOP = MOSTRADOR_Y;
/** Dónde empieza la alfombra del primer plano. */
const RUG_Y = 690;

function caja(z: Caja): CSSProperties {
  return {
    left: `${(z.x / W) * 100}%`,
    top: `${(z.y / H) * 100}%`,
    width: `${(z.w / W) * 100}%`,
    height: `${(z.h / H) * 100}%`,
  };
}

export interface LobbyArea {
  id: string;
  name: string;
  color: string;
}

export interface LobbyPerson {
  id: string;
  name: string;
  color?: string;
  /** Retrato real. Sin él va la inicial sobre su color — nunca una cara inventada. */
  photoUrl?: string | null;
}

export interface LobbyProject {
  id: string;
  name: string;
  /** 0 a 100. */
  progress: number;
  areaColor?: string | null;
}

/** Cada mueble que sí se puede abrir. El app envuelve el contenido en su propio Link. */
export interface LobbyPuerta {
  zona: LobbyZona;
  render: (
    contenido: ReactNode,
    className: string,
    style: CSSProperties,
    aria: string,
  ) => ReactNode;
}

export interface LobbyProps {
  companyName: string;
  industry?: Industry | string | null;
  /** Lo que dice quien atiende, en su globo. */
  greeting?: string;
  areas: LobbyArea[];
  team: LobbyPerson[];
  projects: LobbyProject[];
  /**
   * Las cifras. `undefined` NO es cero: es "esta persona no tiene por qué ver este número" — cuando
   * el dueño apaga una sección, o cuando alguien no tiene alcance sobre ella, el mueble se sigue
   * viendo pero su dato no. Dibujar un 0 sería mentir, y además contradecir al 404 que le da su
   * pantalla si intenta entrar.
   */
  objectivesOpen?: number;
  clientsCount?: number;
  powerupsCount?: number;
  /**
   * Cómo se llama cada mueble. Lo decide el dueño (organization.section_labels) y llega ya resuelto
   * desde el app. Sin entrada, el mueble usa su nombre de fábrica.
   */
  labels?: Partial<Record<LobbyZona, string>>;
  puertas: LobbyPuerta[];
  footer?: ReactNode;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

/**
 * La cifra grande de un mueble y su pie. Un número que la persona no tiene permitido ver se dibuja
 * como una raya, no como un cero: "—" dice "aquí no te toca"; "0" diría "tu empresa no tiene
 * clientes", que es otra cosa y además probablemente falsa.
 */
function cifra(n: number | undefined, uno: string, varios: string) {
  return { valor: n ?? "—", pie: n === 1 ? uno : varios };
}

/** Las tablillas verticales de la pared de madera del fondo. */
function Duelas() {
  const lineas = [];
  for (let x = 236; x <= 1178; x += 11) {
    lineas.push(
      <line
        key={x}
        x1={x}
        y1={TECHO}
        x2={x}
        y2={FLOOR_Y}
        stroke="var(--bg-reception-top)"
        strokeWidth="4.5"
        opacity={x % 33 === 0 ? 1 : 0.5}
      />,
    );
  }
  return <g>{lineas}</g>;
}

/**
 * Una de las dos lámparas colgantes que bajan del plafón.
 *
 * Cuelgan en las dos puntas —sobre el ventanal y sobre el pasillo—, no sobre el centro: ahí abajo
 * está el letrero con el nombre de la empresa, y una lámpara encima de un letrero lo tapa.
 */
function Colgante({ cx, y }: { cx: number; y: number }) {
  return (
    <g>
      <line x1={cx} y1={TECHO} x2={cx} y2={y} stroke="var(--bg-reception-top)" strokeWidth="2" />
      <path
        d={`M${cx - 48} ${y + 24} L${cx - 34} ${y} L${cx + 34} ${y} L${cx + 48} ${y + 24} Z`}
        fill="var(--sky-top)"
        stroke="var(--building-accent)"
        strokeWidth="1"
        opacity=".9"
      />
      <ellipse cx={cx} cy={y + 26} rx="16" ry="5" fill="var(--sign-glow)" filter="url(#jpc-lb-glow)" />
      <ellipse cx={cx} cy={y + 52} rx="52" ry="34" fill="var(--sign-glow)" opacity=".06" />
    </g>
  );
}

/**
 * Cada mueble se dibuja distinto porque cada uno es una cosa distinta, y en una oficina de verdad
 * no se confunden: un pizarrón no se parece a una pantalla, y un letrero de mostrador no se parece
 * a un control de acceso. El SVG pone el mueble; la capa de HTML de encima pone lo que dice.
 *
 * Todos reciben la MISMA caja de ZONAS y dibujan alrededor de ella, así que el contenido siempre
 * cae adentro del mueble por construcción.
 */

/** Áreas: la planta de cubículos vista desde arriba — el piso y la banca de madera que los une. */
function PlantaCubiculos({ z }: { z: Caja }) {
  const pad = MARCOS.areas.l;
  const x = z.x - pad;
  const y = z.y - pad;
  const w = z.w + pad * 2;
  const h = z.h + pad * 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" fill="var(--sky-top)" stroke="var(--building-accent)" strokeWidth="1.4" opacity=".92" />
      <rect x={x + 10} y={y + h - 13} width={w - 20} height="9" rx="2" fill="var(--desk-top)" opacity=".55" />
    </g>
  );
}

/** Objetivos: pizarrón de vidrio con marco de aluminio y su charola de plumones. */
function Pizarron({ z }: { z: Caja }) {
  // El canto de aluminio va 3 por fuera: juntos son el marco que declara MARCOS.
  const pad = MARCOS.objetivos.l - 3;
  const x = z.x - pad;
  const y = z.y - pad;
  const w = z.w + pad * 2;
  const h = z.h + pad * 2;
  return (
    <g>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx="4" fill="var(--desk-top)" opacity=".45" />
      <rect x={x} y={y} width={w} height={h} rx="2" fill="var(--bg-reception-top)" stroke="var(--building-accent)" strokeWidth="1" opacity=".96" />
      {/* el reflejo diagonal: sin él el vidrio se ve como cartón */}
      <path d={`M${x} ${y + h} L${x + w * 0.52} ${y} h46 L${x + 46} ${y + h} z`} fill="var(--sign-glow)" opacity=".035" />
      <rect x={x + w * 0.24} y={y + h + 4} width={w * 0.52} height="7" rx="3.5" fill="var(--desk-top)" opacity=".7" />
      <rect x={x + w * 0.3} y={y + h + 5.5} width="22" height="4" rx="2" fill="var(--building-accent)" opacity=".85" />
      <rect x={x + w * 0.47} y={y + h + 5.5} width="22" height="4" rx="2" fill="var(--sign-glow)" opacity=".45" />
    </g>
  );
}

/** Equipo: el muro de los reconocimientos — tablero, riel de luz y placa de latón. */
function MuroRetratos({ z }: { z: Caja }) {
  const pad = MARCOS.equipo.l;
  const x = z.x - pad;
  const y = z.y - pad;
  const w = z.w + pad * 2;
  const h = z.h + pad * 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill="var(--bg-reception-top)" stroke="var(--building-accent)" strokeWidth="1.4" opacity=".94" />
      <rect x={x + w * 0.2} y={y - 7} width={w * 0.6} height="4" rx="2" fill="var(--sign-glow)" opacity=".4" filter="url(#jpc-lb-glow)" />
      <rect x={x + 10} y={z.y + 19} width={w - 20} height="1.4" fill="var(--sign-glow)" opacity=".4" />
    </g>
  );
}

/** Proyectos: la iMac del mostrador — bisel delgado, barbilla de aluminio y pie de lámina. */
function Mac({ z }: { z: Caja }) {
  const bisel = MARCOS.proyectos.l;
  const barbilla = MARCOS.proyectos.b;
  const cx = z.x + z.w / 2;
  const cuerpoY = z.y - bisel;
  const cuerpoH = z.h + bisel + barbilla;
  const pieY = cuerpoY + cuerpoH;
  return (
    <g>
      <path d={`M${cx - 30} ${pieY - 3} h60 l15 ${DESK_TOP - 5 - pieY + 3} h-90 z`} fill="var(--desk-top)" opacity=".5" />
      <rect x={z.x - bisel} y={cuerpoY} width={z.w + bisel * 2} height={cuerpoH} rx="10" fill="var(--bg-reception-top)" stroke="var(--desk-top)" strokeWidth="2" />
      <rect x={z.x - 2} y={z.y - 2} width={z.w + 4} height={z.h + 4} rx="3" fill="var(--sky-top)" />
      <circle cx={cx} cy={cuerpoY + 4} r="1.7" fill="var(--desk-top)" opacity=".9" />
    </g>
  );
}

/** Clientes: el letrero del mostrador de documentación, sobre su poste. */
function LetreroCounter({ z }: { z: Caja }) {
  const pad = MARCOS.clientes.l;
  const x = z.x - pad;
  const y = z.y - pad;
  const w = z.w + pad * 2;
  const h = z.h + pad * 2;
  const cx = z.x + z.w / 2;
  return (
    <g>
      <rect x={cx - 4} y={y + h} width="8" height={DESK_TOP - 6 - (y + h)} fill="var(--desk-top)" opacity=".55" />
      <rect x={x} y={y} width={w} height={h} rx="4" fill="var(--bg-reception-top)" stroke="var(--building-accent)" strokeWidth="1.4" />
      <path d={`M${x} ${y + 4} h${w} v3 a4 4 0 0 1 -4 4 h${-(w - 8)} a4 4 0 0 1 -4 -4 z`} fill="var(--building-accent)" opacity=".8" />
      <path d={`M${x + w - 30} ${y + h - 14} l16 5 -16 5 4 -5 z`} fill="var(--sign-glow)" opacity=".55" />
    </g>
  );
}

/** PowerUps: el lector de la pared — pantallita, lente, led y las escuadras del encuadre. */
function Verificador({ z }: { z: Caja }) {
  const pad = MARCOS.powerups.l;
  const x = z.x - pad;
  const y = z.y - pad;
  const w = z.w + pad * 2;
  const h = z.h + pad * 2;
  const cx = z.x + z.w / 2;
  const c = 13;
  const esquinas: [number, number, number, number][] = [
    [z.x, z.y, 1, 1],
    [z.x + z.w, z.y, -1, 1],
    [z.x, z.y + z.h, 1, -1],
    [z.x + z.w, z.y + z.h, -1, -1],
  ];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="12" fill="var(--bg-reception-top)" stroke="var(--building-accent)" strokeWidth="1.4" />
      <rect x={z.x - 4} y={z.y - 4} width={z.w + 8} height={z.h + 8} rx="6" fill="var(--sky-top)" />
      <circle cx={cx - 11} cy={y + 6} r="2.4" fill="var(--desk-top)" />
      <circle cx={cx + 11} cy={y + 6} r="2" fill="var(--success)" opacity=".9" />
      {esquinas.map(([ex, ey, sx, sy], i) => (
        <path
          key={i}
          d={`M${ex + sx * c} ${ey} H${ex} V${ey + sy * c}`}
          fill="none"
          stroke="var(--building-accent)"
          strokeWidth="1.6"
          opacity=".7"
        />
      ))}
    </g>
  );
}

/**
 * La recepcionista. De pie detrás del mostrador: en una recepción real quien atiende está de frente
 * y a la vista. Línea sobre relleno oscuro —contraluz— porque la oficina está iluminada por detrás
 * y una silueta negra como las de las ventanas del edificio aquí se perdería contra la madera.
 */
function Recepcionista({ cx }: { cx: number }) {
  const cy = RECEPCION_CABEZA;
  const torso = `M${cx - 50} ${DESK_TOP + 4} q0 -78 50 -78 q50 0 50 78 z`;
  const pelo = `M${cx - 28} ${cy - 2} q0 -36 28 -36 q28 0 28 36 q-9 -17 -28 -17 q-19 0 -28 17 z`;
  const mechones = `M${cx - 28} ${cy - 4} q-9 27 -3 47 M${cx + 28} ${cy - 4} q9 27 3 47`;

  return (
    <g>
      <ellipse cx={cx} cy={cy + 28} rx="110" ry="96" fill="var(--building-accent)" opacity=".05" />
      <path d={torso} fill="var(--bg-reception-top)" stroke="var(--building-accent)" strokeWidth="1.8" />
      <circle cx={cx} cy={cy} r="27" fill="var(--bg-reception-top)" stroke="var(--building-accent)" strokeWidth="1.8" />
      <path d={pelo} fill="var(--building-accent)" opacity=".6" />
      <path d={mechones} fill="none" stroke="var(--building-accent)" strokeWidth="3" strokeLinecap="round" opacity=".6" />
    </g>
  );
}

export function Lobby({
  companyName,
  industry,
  greeting,
  areas,
  team,
  projects,
  objectivesOpen,
  clientsCount,
  powerupsCount,
  labels,
  puertas,
  footer,
}: LobbyProps) {
  const porZona = new Map(puertas.map((p) => [p.zona, p] as const));

  /** El nombre del mueble: el que le puso el dueño, o el de fábrica. */
  const rot = (zona: LobbyZona, fabrica: string) => labels?.[zona] ?? fabrica;

  const metas = cifra(objectivesOpen, "meta abierta", "metas abiertas");
  const cuentas = cifra(clientsCount, "cuenta", "cuentas");
  const canjes = cifra(powerupsCount, "por canjear", "por canjear");

  function mueble(zona: LobbyZona, contenido: ReactNode, aria: string, extra = "") {
    const puerta = porZona.get(zona);
    const style = caja(ZONAS[zona]);
    const className = `jpc-lobby-zona${extra ? ` ${extra}` : ""}`;
    if (!puerta) {
      // Sección apagada o sin permiso: el mueble se ve, pero no se abre. Un div y no un enlace
      // muerto — nadie tabula hacia una puerta que no lleva a ningún lado.
      return (
        <div className={`${className} jpc-lobby-zona--muda`} style={style} aria-hidden="true">
          {contenido}
        </div>
      );
    }
    return puerta.render(contenido, className, style, aria);
  }

  const luz = `M96 ${DESK_TOP + 150} C 240 ${DESK_TOP + 46}, 470 ${DESK_TOP + 50}, 700 ${DESK_TOP + 112} S 1150 ${DESK_TOP + 168}, 1318 ${DESK_TOP + 62}`;

  return (
    <div className="jpc-lobby">
      <div className="jpc-lobby-sala">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter id="jpc-lb-glow" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="9" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="jpc-lb-led" x="-60%" y="-260%" width="220%" height="620%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
            <linearGradient id="jpc-lb-piso" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bg-reception-top)" />
              <stop offset="100%" stopColor="var(--sky-top)" />
            </linearGradient>
            <linearGradient id="jpc-lb-barra" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bg-reception-bot)" />
              <stop offset="100%" stopColor="var(--bg-reception-top)" />
            </linearGradient>
            <linearGradient id="jpc-lb-ventana" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--sky-top)" />
              <stop offset="100%" stopColor="var(--sky-bot)" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={W} height={FLOOR_Y} fill="var(--bg-reception-bot)" />

          {/* Ventanal de piso a techo con la ciudad detrás, y la cortina. */}
          <rect x="0" y={TECHO} width="232" height={FLOOR_Y - TECHO} fill="url(#jpc-lb-ventana)" />
          {[
            [28, 300], [54, 336], [86, 288], [118, 350], [150, 310], [40, 392], [104, 420],
            [168, 372], [196, 330], [70, 262], [134, 246], [186, 288],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="1.6" fill="var(--sign-glow)" opacity=".7" />
          ))}
          {[8, 30, 52, 74, 96].map((x) => (
            <rect key={x} x={x} y={TECHO} width="9" height={FLOOR_Y - TECHO} fill="var(--bg-reception-top)" opacity=".55" />
          ))}

          <Duelas />
          <rect x="1178" y={TECHO} width={W - 1178} height={FLOOR_Y - TECHO} fill="var(--sky-top)" opacity=".85" />

          {/* Plafón con los spots empotrados. */}
          <rect x="0" y="0" width={W} height={TECHO} fill="var(--bg-reception-top)" />
          {[190, 400, 610, 820, 1030, 1240].map((x) => (
            <ellipse key={x} cx={x} cy="26" rx="17" ry="5" fill="var(--sign-glow)" opacity=".8" filter="url(#jpc-lb-glow)" />
          ))}

          <Colgante cx={54} y={190} />
          <Colgante cx={1346} y={190} />

          <rect x="0" y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill="url(#jpc-lb-piso)" />
          <rect x="0" y={FLOOR_Y - 8} width={W} height="8" fill="var(--bg-reception-top)" />
          <rect x="0" y={RUG_Y} width={W} height={H - RUG_Y} fill="#14161c" />

          {/* El letrero de la empresa: el glyph del giro centrado sobre el nombre. Vive en el
              hueco entre los dos paneles de pared, y ninguna lámpara le cae encima. */}
          <g transform="translate(684 132) scale(1.3)" color="var(--building-accent)" opacity=".8">
            <IndustryGlyph industry={industry} />
          </g>
          <text
            x={W / 2}
            y="192"
            textAnchor="middle"
            className="jpc-lobby-word"
            fill="var(--sign-glow)"
            fontSize="30"
            filter="url(#jpc-lb-glow)"
          >
            {companyName}
          </text>

          <PlantaCubiculos z={ZONAS.areas} />
          <Pizarron z={ZONAS.objetivos} />
          <MuroRetratos z={ZONAS.equipo} />
          <Verificador z={ZONAS.powerups} />

          {[218, 1298].map((x) => (
            <g key={x} stroke="var(--building-accent)" strokeWidth="2.6" fill="none" opacity=".45">
              <path
                d={`M${x} ${FLOOR_Y - 12}c0-40-20-58-40-68M${x} ${FLOOR_Y - 12}c0-40 20-58 40-68M${x} ${FLOOR_Y - 12}c0-30-5-56-5-78`}
              />
              <path d={`M${x - 22} ${FLOOR_Y - 12}h44l-7 44h-30z`} fill="var(--bg-reception-top)" />
            </g>
          ))}

          <Recepcionista cx={RECEPCION_CX} />
          <Mac z={ZONAS.proyectos} />
          <LetreroCounter z={ZONAS.clientes} />

          {/* El mostrador curvo: la tapa vuela sobre un cuerpo redondeado, como en la referencia. */}
          <path
            d={`M62 ${DESK_TOP + 22} q0 -22 30 -22 h1216 q30 0 30 22 v168 q0 44 -52 44 h-1172 q-52 0 -52 -44 z`}
            fill="url(#jpc-lb-barra)"
          />
          <path
            d={`M46 ${DESK_TOP} q0 -14 26 -14 h1256 q26 0 26 14 q0 16 -26 16 h-1256 q-26 0 -26 -16 z`}
            fill="var(--desk-top)"
            opacity=".78"
          />

          {/* La luz: la firma del mueble. Una cinta que recorre el frente en curva y un zócalo
              encendido debajo. Va dos veces — difusa para el resplandor, sólida para el filamento. */}
          <path d={luz} fill="none" stroke="var(--building-accent)" strokeWidth="16" strokeLinecap="round" filter="url(#jpc-lb-led)" opacity=".8" />
          <path d={luz} fill="none" stroke="var(--sign-glow)" strokeWidth="2.6" strokeLinecap="round" opacity=".9" />
          <rect x="80" y={DESK_TOP + 228} width="1240" height="9" rx="4.5" fill="var(--building-accent)" filter="url(#jpc-lb-led)" />
          <ellipse cx={W / 2} cy={RUG_Y - 18} rx="620" ry="30" fill="var(--building-accent)" opacity=".07" />
        </svg>

        <div className="jpc-lobby-capa">
          {/* Lo que dice quien atiende. Va primero en el DOM porque es lo primero que se oye al
              entrar, y encima de su cabeza con el pico apuntándole: sale de ella, no de la app. */}
          {greeting && (
            <p
              className="jpc-lobby-globo"
              style={
                {
                  ...caja(GLOBO),
                  // El pico no va al centro del globo: va justo encima de ella.
                  "--pico": `${((RECEPCION_CX - GLOBO.x) / GLOBO.w) * 100}%`,
                } as CSSProperties
              }
            >
              {greeting}
            </p>
          )}

          {mueble(
            "areas",
            <>
              <span className="jpc-lobby-rotulo">{rot("areas", "Áreas de trabajo")}</span>
              <ul className="jpc-lobby-areas">
                {areas.map((a) => (
                  <li key={a.id}>
                    <i className="jpc-lobby-silla" style={{ background: a.color }} />
                    <span className="jpc-lobby-escritorio">{a.name}</span>
                  </li>
                ))}
              </ul>
            </>,
            `${rot("areas", "Áreas de trabajo")}: ${areas.length}`,
            "jpc-lobby-zona--banda",
          )}

          {mueble(
            "objetivos",
            <>
              <span className="jpc-lobby-rotulo">{rot("objetivos", "Objetivos")}</span>
              <p className="jpc-lobby-dato">
                <strong className="jpc-lobby-cifra">{metas.valor}</strong>
                <span className="jpc-lobby-pie">{metas.pie}</span>
              </p>
            </>,
            `${rot("objetivos", "Objetivos")}: ${metas.valor} ${metas.pie}`,
          )}

          {mueble(
            "equipo",
            <>
              <span className="jpc-lobby-rotulo">{rot("equipo", "Equipo")}</span>
              <div className="jpc-lobby-retratos">
                {team.slice(0, MAX_RETRATOS).map((p) => (
                  <figure key={p.id} style={{ borderColor: p.color ?? "var(--building-accent)" }}>
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt="" />
                    ) : (
                      <span style={{ color: p.color ?? "var(--building-accent)" }}>
                        {iniciales(p.name)}
                      </span>
                    )}
                    <figcaption>{p.name.split(/\s+/)[0]}</figcaption>
                  </figure>
                ))}
              </div>
            </>,
            `${rot("equipo", "Equipo")}: ${team.length} personas`,
          )}

          {mueble(
            "proyectos",
            <>
              <span className="jpc-lobby-rotulo">{rot("proyectos", "Proyectos activos")}</span>
              {projects.length === 0 ? (
                <p className="jpc-lobby-pie">Sin proyectos activos.</p>
              ) : (
                <ul className="jpc-lobby-proyectos">
                  {projects.slice(0, MAX_PROYECTOS).map((p) => (
                    <li key={p.id}>
                      <span>{p.name}</span>
                      <i>
                        <b
                          style={{
                            width: `${Math.min(100, Math.max(0, p.progress))}%`,
                            background: p.areaColor ?? "var(--building-accent)",
                          }}
                        />
                      </i>
                    </li>
                  ))}
                </ul>
              )}
            </>,
            `${rot("proyectos", "Proyectos activos")}: ${projects.length}`,
          )}

          {mueble(
            "clientes",
            <>
              <span className="jpc-lobby-rotulo">{rot("clientes", "Clientes")}</span>
              <p className="jpc-lobby-dato">
                <strong className="jpc-lobby-cifra">{cuentas.valor}</strong>
                <span className="jpc-lobby-pie">{cuentas.pie}</span>
              </p>
            </>,
            `${rot("clientes", "Clientes")}: ${cuentas.valor} ${cuentas.pie}`,
          )}

          {mueble(
            "powerups",
            <>
              <span className="jpc-lobby-rotulo">{rot("powerups", "PowerUps")}</span>
              <p className="jpc-lobby-dato">
                <strong className="jpc-lobby-cifra">{canjes.valor}</strong>
                <span className="jpc-lobby-pie">{canjes.pie}</span>
              </p>
            </>,
            `${rot("powerups", "PowerUps")}: ${canjes.valor} ${canjes.pie}`,
          )}
        </div>
      </div>

      {footer}
    </div>
  );
}
