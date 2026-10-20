// Íconos del menú del admin, en el trazo fino de la marca JotaPuntoCe: línea de 1.4 en currentColor
// (sigue el color del menú) y un solo detalle con el hilo de seis colores (--dept-*) por ícono.
// Dibujados a partir de las referencias que eligió Jose Carlos.

// userSpaceOnUse con las coordenadas del trazo: con el modo por caja, una línea horizontal no tiene
// alto y el degradado no se pinta.
function Hilo({ id, x1, x2 }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} x2={x2} y1="0" y2="0">
      <stop offset="0" stopColor="var(--dept-planeacion)" />
      <stop offset="0.2" stopColor="var(--dept-valor)" />
      <stop offset="0.4" stopColor="var(--dept-sistemas)" />
      <stop offset="0.6" stopColor="var(--dept-presentacion)" />
      <stop offset="0.8" stopColor="var(--dept-branding)" />
      <stop offset="1" stopColor="var(--dept-imaginacion)" />
    </linearGradient>
  );
}

function Icono({ className, size = 22, children }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

const trazo = { stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };

// Recepción: mostrador con monitor; el letrero lleva el hilo en vez de la palabra (ilegible a 22 px).
export function ReceptionIcon(props) {
  return (
    <Icono {...props}>
      <defs>
        <Hilo id="jc-hilo-recepcion" x1="8.6" x2="15.4" />
      </defs>
      <g {...trazo}>
        <rect x="4" y="2.8" width="7.5" height="5.4" rx="1.3" />
        <path d="M7.75 8.2v2.3" />
        <path d="M13.6 10.5H21a1 1 0 0 1 1 1v.9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-.9a1 1 0 0 1 1-1h8.4" />
        <path d="M3.4 13.4V20M20.6 13.4V20M2.5 20.6h19" />
        <rect x="6.6" y="15" width="10.8" height="3.2" rx="1.1" />
      </g>
      <path d="M8.6 16.6h6.8" stroke="url(#jc-hilo-recepcion)" strokeWidth="1.4" strokeLinecap="round" />
    </Icono>
  );
}

// Planos: plano enrollado con la planta de un edificio; el lápiz está trazando un muro con el hilo.
export function PlanosIcon(props) {
  return (
    <Icono {...props}>
      <defs>
        <Hilo id="jc-hilo-planos" x1="9.6" x2="12.4" />
      </defs>
      <g {...trazo}>
        {/* rollo */}
        <path d="M2.6 19.4V5.3a2.2 2.2 0 0 1 4.4 0v14.1a2.2 2.2 0 0 0-4.4 0" />
        {/* hoja */}
        <path d="M8.9 4.4h3.6M18.6 4.4h1.2a1 1 0 0 1 1 1v15.2H4.8" />
        {/* planta */}
        <path d="M14.8 8.6h3.8v9.4H9.6V8.6" />
        <path d="M12.3 10.3v3h1v2.4M15.6 10.3v2.6h3M15.6 15.3v2.7M9.6 12.9h1.4" />
        {/* lápiz */}
        <path d="M13.4 9.4l.7-2.6 5.2-5.2a1.35 1.35 0 0 1 1.9 1.9l-5.2 5.2-2.6.7Z" />
        <path d="M18.2 2.7l1.9 1.9" />
      </g>
      <path d="M9.6 8.6h2.8" stroke="url(#jc-hilo-planos)" strokeWidth="1.4" strokeLinecap="round" />
    </Icono>
  );
}

// Solicitudes: una persona con su solicitud en la mano y el globo con la palomita de "recibido",
// dibujada con el hilo.
export function SolicitudesIcon(props) {
  return (
    <Icono {...props}>
      <defs>
        <Hilo id="jc-hilo-solicitudes" x1="14.8" x2="18.9" />
      </defs>
      <g {...trazo}>
        {/* persona */}
        <circle cx="6.4" cy="8.4" r="2.6" />
        <path d="M2.4 21v-4.6a3.9 3.9 0 0 1 3.9-3.9h2.2a3.4 3.4 0 0 1 3 1.8" />
        <path d="M4.9 15.6v2.6h3.4" />
        {/* hoja de la solicitud */}
        <path d="M9.2 14.3h4.5l-2 6.7H7.2Z" />
        {/* globo */}
        <path d="M13.9 2.4h5.9a1.8 1.8 0 0 1 1.8 1.8v3a1.8 1.8 0 0 1-1.8 1.8h-3.1l-2.4 2.4V9h-.4a1.8 1.8 0 0 1-1.8-1.8v-3a1.8 1.8 0 0 1 1.8-1.8Z" />
      </g>
      <path d="M14.8 5.8l1.4 1.4 2.7-2.7" stroke="url(#jc-hilo-solicitudes)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Icono>
  );
}

// Chequeos: el regalo (el chequeo gratis); el moño lleva el hilo.
export function ChequeosIcon(props) {
  return (
    <Icono {...props}>
      <defs>
        <Hilo id="jc-hilo-chequeos" x1="7.6" x2="16.4" />
      </defs>
      <g {...trazo}>
        <rect x="3.5" y="9" width="17" height="11.5" rx="1.4" />
        <path d="M2.8 9h18.4M12 9v11.5" />
      </g>
      <path
        d="M12 8.6C10.8 6 7.6 5.2 7.6 7.2c0 1.3 2.4 1.4 4.4 1.4s4.4-.1 4.4-1.4c0-2-3.2-1.2-4.4 1.4"
        stroke="url(#jc-hilo-chequeos)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </Icono>
  );
}
