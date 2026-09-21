"use client";

// El botón de construcción: vive entre la etiqueta del dueño y el botón de salir, y adentro trae el
// rastreador de las 8 fases.
//
// El rastreador salió del cuerpo del panel porque competía por el lugar más valioso de la pantalla
// con lo que el dueño realmente abre a ver (sus pendientes), y porque una vez que la empresa está
// entregada deja de cambiar durante meses. Como botón sigue a un clic, y el paso actual se lee sin
// abrirlo — va escrito en el propio botón.
//
// <dialog> nativo y no un modal propio: el navegador ya trae foco atrapado, cierre con Escape, fondo
// inerte y el rol de diálogo para lectores de pantalla. Mismo patrón que RequestCompanyDialog.
//
// El rastreador entra como `children` para que siga siendo un Server Component: este archivo solo
// pone el abrir y cerrar, no toca datos.
import { useRef, type ReactNode } from "react";

/** El casco de obra del señalamiento de construcción — a 18px es la silueta que se lee de un vistazo. */
function HardHat() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M12 4c-1 0-1.8.8-1.8 1.8v3.4A6.8 6.8 0 0 0 5.2 16h13.6a6.8 6.8 0 0 0-5-6.8V5.8C13.8 4.8 13 4 12 4Z"
        fill="currentColor"
      />
      <rect x="2.6" y="16" width="18.8" height="2.6" rx="1.3" fill="currentColor" />
    </svg>
  );
}

export function TrackerDialog({ stepLabel, children }: { stepLabel: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="build-btn"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Ver la construcción de tu empresa — ${stepLabel}`}
      >
        <span className="build-btn-icon">
          <HardHat />
        </span>
        <span className="build-btn-text">Construcción</span>
        <span className="build-btn-step">{stepLabel}</span>
      </button>

      <dialog ref={dialogRef} className="panel-dialog panel-dialog--wide" aria-labelledby="tracker-titulo">
        <div className="panel-dialog-form">
          <h2 id="tracker-titulo" className="panel-dialog-title">
            Construcción de tu empresa digital
          </h2>
          {children}
          <div className="panel-dialog-actions">
            <button
              type="button"
              className="panel-btn-ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Cerrar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
