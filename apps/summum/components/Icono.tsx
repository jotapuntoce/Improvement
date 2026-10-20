// Íconos de línea aprobados en la landing de Summum System (Summum System/landing/index.html, const ICO).
// Una tinta (currentColor), trazo de 1.5; se dibujan al entrar en pantalla (ver .icono en Sitio.module.css).
import s from "./Sitio.module.css";

const ICO = {
  agenda: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10.5 18.5h3M9.5 6.5h5M9.5 9.5h5M9.5 12.5h3"/>',
  rota: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a4.5 4.5 0 0 1 4.6 5.2"/><path d="M20.6 10.7l-2.3-.6M20.6 10.7l.9-2.2"/>',
  idea: '<path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/><path d="M9.5 19h5M10.5 21.5h3"/>',
  lupa: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3L21 21M10.5 7.5v6M7.5 10.5h6"/>',
  matraz: '<path d="M9 3h6M10 3v6l-5.4 9.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9V3"/><path d="M7.4 15h9.2"/>',
  medalla: '<circle cx="12" cy="10" r="6"/><path d="M8.6 15l-1.6 6.5 5-2.6 5 2.6-1.6-6.5"/><path d="M12 6.5l1.8 3h-3.6z"/>',
  adentro: '<circle cx="12" cy="12" r="2.5"/><path d="M3.5 3.5l5.5 5.5M9 4.5V9H4.5M20.5 20.5L15 15M15 19.5V15h4.5M20.5 3.5L15 9M19.5 9H15V4.5M3.5 20.5L9 15M4.5 15H9v4.5"/>',
  afuera: '<circle cx="12" cy="12" r="2.5"/><path d="M14.5 9.5l6-6M16.5 3.5h4v4M9.5 14.5l-6 6M3.5 16.5v4h4M14.5 14.5l6 6M20.5 16.5v4h-4M9.5 9.5l-6-6M7.5 3.5h-4v4"/>',
  red: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="12" r="2.5"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6.6 7.2l3.6 3.2M17.4 7.2l-3.6 3.2M7.5 17.6l2.8-3.8M16.5 17.6l-2.8-3.8"/>',
  sube: '<path d="M3 20h5v-5h5v-5h5V5h3"/><path d="M15 3h6v6"/>',
  ciclo: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 2.8v4h-4M6 21.2v-4h4"/>',
  baja: '<path d="M3 4h5v5h5v5h5v5h3"/><path d="M15 21h6v-6"/>',
  comunidad: '<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5M11 19c0-2.8 2.2-5 5-5s5 2.2 5 5"/>',
  experiencia: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
  comercial: '<path d="M3 11.5V4h7.5L21 14.5 13.5 22z"/><circle cx="7.5" cy="8" r="1.4"/>',
  operacion: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  talento: '<circle cx="9" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.3 3.2.9"/><path d="M18 21v-8M15 16l3-3 3 3"/>',
  finanzas: '<path d="M3 20.5h18M6.5 17v-5M12 17V6.5M17.5 17v-8"/>',
} as const;

export type NombreIcono = keyof typeof ICO;

// Cada trazo con pathLength=1 para que la animación de dibujo funcione igual en cualquier forma.
const conLongitud = (svg: string) => svg.replace(/<(path|circle|rect)\b/g, '<$1 pathLength="1"');

export function Icono({ nombre, size = 28 }: { nombre: NombreIcono; size?: number }) {
  return (
    <svg
      className={s.icono}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      // Contenido fijo de este archivo (no de usuario): seguro de insertar.
      dangerouslySetInnerHTML={{ __html: conLongitud(ICO[nombre]) }}
    />
  );
}
