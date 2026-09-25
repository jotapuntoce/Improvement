// Monograma M2 de JotaPuntoCe (manual de marca v1): J · C de trazo fino y, como punto, la silueta del
// cerebro con los 6 colores de lóbulo (--dept-*). Para login, documentos, favicon y los detalles chicos
// del admin (la firma en la TV de la recepción); nunca junto al nombre "JotaPuntoCe". Geometría idéntica a Branding/jotapuntoce/assets/build.py.
const BRAIN = "M10,45 C6,28 18,10 38,8 C52,2 72,4 84,14 C96,22 98,38 92,48 C96,56 90,66 80,64 C76,70 66,72 60,68 L58,78 L52,78 L52,68 C44,70 36,68 32,62 C20,64 12,56 10,45 Z";

// El cerebro en coordenadas 0..100 × 0..80.
function Brain({ clipId }) {
  return (
    <>
      <clipPath id={clipId}><path d={BRAIN} /></clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width="100" height="80" fill="var(--dept-presentacion)" />
        <ellipse cx="16" cy="44" rx="24" ry="34" fill="var(--dept-planeacion)" />
        <ellipse cx="52" cy="8" rx="30" ry="22" fill="var(--dept-sistemas)" />
        <ellipse cx="86" cy="14" rx="14" ry="14" fill="var(--dept-valor)" />
        <ellipse cx="96" cy="40" rx="12" ry="13" fill="var(--dept-imaginacion)" />
        <ellipse cx="76" cy="72" rx="21" ry="15" fill="var(--dept-branding)" />
      </g>
    </>
  );
}

export default function Monogram({ className, title = "JotaPuntoCe" }) {
  return (
    <svg className={className} viewBox="8 36 104 44" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="butt" strokeLinejoin="miter">
        <path d="M34,42 L47,42 L47,61 A17,17 0 0 1 13,61" />
        <path d="M103,50.1 A17,17 0 1 0 103,71.9" />
      </g>
      <g transform="translate(52,46.6) scale(0.16)">
        <Brain clipId="jc-brain" />
      </g>
    </svg>
  );
}
