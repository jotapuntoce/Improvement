"use client";

// El terreno y la obra: todo lo que se ve AFUERA del edificio mientras la empresa digital se
// construye. Building.tsx decide qué capas prende según la etapa; aquí solo viven las formas.
//
// Vive aparte de Building.tsx por tamaño: la fachada, las ventanas y los científicos ya eran un
// archivo completo, y meterle ocho escenas más lo volvía imposible de leer. Nada de esto sabe en qué
// etapa va la empresa — recibe coordenadas y dibuja.
//
// Las figuras son siluetas de trazo, no rellenos sólidos como los científicos de las ventanas: los
// científicos se ven a contraluz desde adentro (por eso son sombra), y esta gente está afuera, de
// noche, iluminada por los reflectores de la obra.

const FIG = {
  fill: "none",
  stroke: "var(--building-accent)",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Una persona de pie, de `x` a los pies en `groundY`. ~32px de alto. */
function Figura({ x, groundY, casco }: { x: number; groundY: number; casco?: boolean }) {
  const cabezaY = groundY - 27;
  return (
    <g {...FIG}>
      <circle cx={x} cy={cabezaY} r="4" />
      {casco && <path d={`M ${x - 6} ${cabezaY - 2} a 6 6 0 0 1 12 0 z`} />}
      <line x1={x} y1={cabezaY + 4} x2={x} y2={groundY - 12} />
      <line x1={x} y1={groundY - 12} x2={x - 5} y2={groundY} />
      <line x1={x} y1={groundY - 12} x2={x + 5} y2={groundY} />
      <line x1={x - 6} y1={groundY - 17} x2={x + 6} y2={groundY - 17} />
    </g>
  );
}

/**
 * El terreno: el lote cercado con sus estacas y el letrero de obra con el nombre de la empresa.
 *
 * Es lo único que se ve en "Solicitud recibida" y sigue estando debajo de todo lo demás en cada
 * etapa posterior. El dueño que abre su empresa el primer día ve un terreno suyo, con su nombre
 * en el letrero — no una pantalla vacía que diga "todavía no hay nada".
 */
export function Terreno({
  x0,
  x1,
  groundY,
  companyName,
}: {
  x0: number;
  x1: number;
  groundY: number;
  companyName: string;
}) {
  const estacas = [x0, x0 + (x1 - x0) / 3, x0 + ((x1 - x0) * 2) / 3, x1];
  return (
    <g>
      <line
        x1={x0 - 30}
        y1={groundY}
        x2={x1 + 30}
        y2={groundY}
        stroke="var(--building-accent)"
        strokeWidth="2"
        opacity=".6"
      />
      {/* Malla de obra entre estacas — punteada, como la cinta que acordona un lote. */}
      <line
        x1={x0}
        y1={groundY - 22}
        x2={x1}
        y2={groundY - 22}
        stroke="var(--building-accent)"
        strokeWidth="1.4"
        strokeDasharray="7 6"
        opacity=".45"
      />
      {estacas.map((x) => (
        <line
          key={x}
          x1={x}
          y1={groundY - 26}
          x2={x}
          y2={groundY}
          stroke="var(--building-accent)"
          strokeWidth="1.8"
          opacity=".55"
        />
      ))}

      {/* El letrero de obra, con el nombre de quien va a ser dueño de esto. */}
      <g transform={`translate(${x0 + 10} ${groundY - 96})`}>
        <line x1="14" y1="44" x2="14" y2="74" stroke="var(--building-accent)" strokeWidth="2" opacity=".6" />
        <line x1="58" y1="44" x2="58" y2="74" stroke="var(--building-accent)" strokeWidth="2" opacity=".6" />
        <rect
          x="0"
          y="6"
          width="72"
          height="40"
          rx="3"
          fill="var(--bg-facade-2)"
          stroke="var(--building-accent)"
          strokeWidth="1.6"
        />
        <text
          x="36"
          y="24"
          textAnchor="middle"
          fill="var(--building-accent)"
          fontSize="9"
          className="jpc-obra-sign"
        >
          EN OBRA
        </text>
        <text x="36" y="37" textAnchor="middle" fill="var(--sign-glow)" fontSize="10">
          {companyName.length > 12 ? `${companyName.slice(0, 11)}…` : companyName}
        </text>
      </g>
    </g>
  );
}

/**
 * Análisis: dos ingenieros midiendo el terreno, uno en el teodolito y otro sosteniendo el estadal.
 * La línea punteada entre ellos es la visual del instrumento — lo que están midiendo.
 */
export function Ingenieros({ x0, x1, groundY }: { x0: number; x1: number; groundY: number }) {
  const medidor = x0 + 70;
  const ayudante = x1 - 60;
  return (
    <g className="jpc-obra-capa">
      {/* Teodolito sobre su tripié. */}
      <g {...FIG}>
        <circle cx={medidor + 34} cy={groundY - 46} r="5" />
        <line x1={medidor + 39} y1={groundY - 46} x2={medidor + 48} y2={groundY - 46} />
        <line x1={medidor + 34} y1={groundY - 41} x2={medidor + 26} y2={groundY} />
        <line x1={medidor + 34} y1={groundY - 41} x2={medidor + 34} y2={groundY} />
        <line x1={medidor + 34} y1={groundY - 41} x2={medidor + 42} y2={groundY} />
      </g>
      <Figura x={medidor} groundY={groundY} casco />

      {/* El estadal del ayudante, y la visual entre los dos. */}
      <line
        x1={ayudante}
        y1={groundY - 54}
        x2={ayudante}
        y2={groundY}
        stroke="var(--building-accent)"
        strokeWidth="2.4"
        opacity=".7"
      />
      <Figura x={ayudante - 16} groundY={groundY} casco />
      <line
        x1={medidor + 48}
        y1={groundY - 46}
        x2={ayudante}
        y2={groundY - 46}
        stroke="var(--accent-2)"
        strokeWidth="1"
        strokeDasharray="4 5"
        opacity=".55"
      />
    </g>
  );
}

/**
 * Plano: la huella del edificio ya trazada sobre el terreno y la mesa donde está el plano abierto.
 *
 * Esta etapa Jose Carlos no la describió — describió la 1, 2, 4, 5, 6, 7 y 8. La deduje del propio
 * nombre de la etapa ("Plano") y de lo que va antes y después: ya se midió el terreno, todavía no se
 * construye, y lo único que existe en ese momento es el dibujo. Si no es lo que tenía en la cabeza,
 * esta es la función que hay que cambiar y no toca nada más.
 */
export function Plano({
  x0,
  x1,
  groundY,
  huellaAlto,
}: {
  x0: number;
  x1: number;
  groundY: number;
  huellaAlto: number;
}) {
  return (
    <g className="jpc-obra-capa">
      {/* La huella: dónde va a ir el edificio, marcada en el suelo. */}
      <rect
        x={x0}
        y={groundY - huellaAlto}
        width={x1 - x0}
        height={huellaAlto}
        fill="var(--building-accent)"
        opacity=".07"
      />
      <rect
        x={x0}
        y={groundY - huellaAlto}
        width={x1 - x0}
        height={huellaAlto}
        fill="none"
        stroke="var(--accent-2)"
        strokeWidth="1.6"
        strokeDasharray="10 7"
        opacity=".7"
      />

      {/* La mesa con el plano abierto, y quien lo está revisando. */}
      <g {...FIG}>
        <line x1={x1 - 74} y1={groundY - 34} x2={x1 + 6} y2={groundY - 34} />
        <line x1={x1 - 68} y1={groundY - 34} x2={x1 - 68} y2={groundY} />
        <line x1={x1} y1={groundY - 34} x2={x1} y2={groundY} />
        <path d={`M ${x1 - 70} ${groundY - 38} h 72 l -6 4 h -72 z`} />
      </g>
      <Figura x={x1 - 96} groundY={groundY} />
    </g>
  );
}

/** Construcción: andamios y grúa sobre la parte que todavía no existe, más los obreros abajo. */
export function Obra({
  x0,
  x1,
  topY,
  buildLineY,
  groundY,
  paso,
}: {
  x0: number;
  x1: number;
  topY: number;
  buildLineY: number;
  groundY: number;
  paso: number;
}) {
  const travesanos = Math.max(0, Math.floor((buildLineY - topY) / paso));
  return (
    <g className="jpc-obra">
      <rect
        x={x0}
        y={topY}
        width={x1 - x0}
        height={Math.max(0, buildLineY - topY)}
        rx="6"
        fill="none"
        stroke="var(--building-accent)"
        strokeWidth="1.4"
        strokeDasharray="6 6"
        opacity=".45"
      />
      {[x0 + 16, x1 - 16].map((x) => (
        <line
          key={x}
          x1={x}
          y1={topY + 4}
          x2={x}
          y2={buildLineY}
          stroke="var(--building-accent)"
          strokeWidth="2"
          opacity=".5"
        />
      ))}
      {Array.from({ length: travesanos }).map((_, i) => (
        <line
          key={i}
          x1={x0 + 16}
          y1={buildLineY - i * paso - 10}
          x2={x1 - 16}
          y2={buildLineY - i * paso - 10}
          stroke="var(--building-accent)"
          strokeWidth="1.4"
          opacity=".35"
        />
      ))}

      {/* Grúa: mástil, pluma, cable y gancho colgando sobre la obra. */}
      <g stroke="var(--building-accent)" strokeWidth="2" fill="none" opacity=".7" strokeLinecap="round">
        <line x1={x1 + 26} y1={topY - 70} x2={x1 + 26} y2={groundY} />
        <line x1={x1 - 90} y1={topY - 70} x2={x1 + 58} y2={topY - 70} />
        <line x1={x1 - 40} y1={topY - 70} x2={x1 - 40} y2={topY - 40} />
        <path d={`M ${x1 - 46} ${topY - 40} h 12 v 8 h -12 z`} />
      </g>

      <Figura x={x0 + 40} groundY={groundY} casco />
      <Figura x={x0 + 78} groundY={groundY} casco />
    </g>
  );
}

/**
 * Pruebas: el edificio ya está de pie y le están dando los acabados. Andamio ligero pegado a la
 * fachada, un pintor arriba y otro abajo — nada de grúa, que eso ya se fue.
 */
export function Acabados({ x0, groundY, facadeY }: { x0: number; groundY: number; facadeY: number }) {
  const andamioY = facadeY + 120;
  return (
    <g className="jpc-obra-capa">
      <line
        x1={x0 - 14}
        y1={andamioY}
        x2={x0 + 96}
        y2={andamioY}
        stroke="var(--building-accent)"
        strokeWidth="2.4"
        opacity=".6"
      />
      {[x0 - 10, x0 + 90].map((x) => (
        <line
          key={x}
          x1={x}
          y1={andamioY}
          x2={x}
          y2={groundY}
          stroke="var(--building-accent)"
          strokeWidth="1.6"
          opacity=".45"
        />
      ))}
      <Figura x={x0 + 40} groundY={andamioY} casco />
      <Figura x={x0 + 130} groundY={groundY} casco />
    </g>
  );
}

/**
 * Capacitación: el equipo todavía afuera del edificio, aprendiendo a usarlo. Se dibujan agrupados
 * junto a la puerta y mirando hacia ella — el detalle que hace que se lea como "están por entrar"
 * y no como "se están yendo".
 */
export function EquipoAfuera({ doorCX, groundY }: { doorCX: number; groundY: number }) {
  return (
    <g className="jpc-obra-capa">
      {[-96, -64, -34, 36, 66, 98].map((dx) => (
        <Figura key={dx} x={doorCX + dx} groundY={groundY} />
      ))}
    </g>
  );
}

/**
 * Entrega: las cintas que envuelven el edificio y el moño en el techo.
 *
 * Dos cintas y no una al centro: la del centro pasaba justo encima del rótulo con el nombre de la
 * empresa y lo tapaba. Envolviendo por los lados se lee mejor como regalo y el nombre se sigue
 * viendo, que es lo que importa el día que se lo entregas.
 *
 * Se dibuja ANTES que el letrero a propósito (ver Building.tsx): la cinta pasa por detrás.
 */
export function MonoCintas({
  x0,
  x1,
  topY,
  bottomY,
}: {
  x0: number;
  x1: number;
  topY: number;
  bottomY: number;
}) {
  const ancho = x1 - x0;
  const centro = x0 + ancho / 2;
  return (
    <g className="jpc-mono">
      {[x0 + ancho * 0.26, x0 + ancho * 0.74].map((x) => (
        <line
          key={x}
          x1={x}
          y1={topY}
          x2={x}
          y2={bottomY}
          stroke="var(--gold)"
          strokeWidth="13"
          opacity=".7"
        />
      ))}

      {/* El moño, sobre el techo — nada le pasa por encima. */}
      <g transform={`translate(${centro} ${topY - 4})`}>
        <path d="M 0 0 C -50 -44 -80 -13 -48 9 C -30 20 -11 11 0 0 Z" fill="var(--gold)" opacity=".92" />
        <path d="M 0 0 C 50 -44 80 -13 48 9 C 30 20 11 11 0 0 Z" fill="var(--gold)" opacity=".92" />
        <path d="M -7 2 L -30 48 L -9 41 Z" fill="var(--gold)" opacity=".72" />
        <path d="M 7 2 L 30 48 L 9 41 Z" fill="var(--gold)" opacity=".72" />
        <circle cx="0" cy="2" r="12" fill="var(--gold)" />
      </g>
    </g>
  );
}

/**
 * El listón de la entrada: lo único que se corta.
 *
 * `cortado` parte las dos mitades y las abre. Es la única animación del producto que existe solo
 * para que se sienta bien — el dueño cortando el listón de su propia empresa. Vale la pena.
 *
 * Se dibuja DESPUÉS de las puertas: cruza por delante de ellas, como el listón de una inauguración.
 */
export function MonoListon({
  x0,
  x1,
  doorCX,
  ribbonY,
  cortado,
}: {
  x0: number;
  x1: number;
  doorCX: number;
  ribbonY: number;
  cortado: boolean;
}) {
  return (
    <g className={cortado ? "jpc-liston jpc-liston--cortado" : "jpc-liston"}>
      {/* El origen de giro es el punto del corte, en unidades del viewBox: las dos mitades caen
          desde ahí, como un listón cortado de verdad. Va inline porque solo aquí se conocen esas
          coordenadas — en el CSS serían dos números mágicos que nadie podría volver a derivar. */}
      <line
        style={{ transformOrigin: `${doorCX}px ${ribbonY}px` }}
        className="jpc-liston-izq"
        x1={x0 - 24}
        y1={ribbonY}
        x2={doorCX}
        y2={ribbonY}
        stroke="var(--gold)"
        strokeWidth="11"
      />
      <line
        style={{ transformOrigin: `${doorCX}px ${ribbonY}px` }}
        className="jpc-liston-der"
        x1={doorCX}
        y1={ribbonY}
        x2={x1 + 24}
        y2={ribbonY}
        stroke="var(--gold)"
        strokeWidth="11"
      />
    </g>
  );
}
