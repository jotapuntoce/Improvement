"use client";

// "Solicitar empresa" como un botón y nada más: el formulario vive dentro, no ocupando el panel.
//
// <dialog> nativo en vez de un modal propio — el navegador ya trae el foco atrapado dentro, el
// cierre con Escape, el fondo inerte y el rol de diálogo para lectores de pantalla. Lo único que
// pone este componente es abrir y cerrar.
//
// La Server Action llega como prop y no importada: un archivo "use client" nunca importa de
// server/** (tabla de boundaries, CLAUDE.md) — mismo patrón que components/LogoutButton.tsx.
import { useRef } from "react";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries.ts";

export function RequestCompanyDialog({
  action,
  priceLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  priceLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className="panel-cta" onClick={() => dialogRef.current?.showModal()}>
        + Solicitar empresa
      </button>

      <dialog ref={dialogRef} className="panel-dialog" aria-labelledby="solicitar-titulo">
        {/* Cerrar en onSubmit y no después de que la acción resuelva: <dialog> no se cierra solo
            cuando su formulario se envía, y esperar dejaría el modal encima del panel que la Server
            Action acaba de revalidar. Si la acción falla, el panel simplemente no cambia. */}
        <form
          action={action}
          onSubmit={() => dialogRef.current?.close()}
          className="panel-dialog-form"
        >
          <h2 id="solicitar-titulo" className="panel-dialog-title">
            Solicitar una empresa nueva
          </h2>

          <p className="panel-dialog-price">
            Costo de construcción: <strong>{priceLabel}</strong>
          </p>
          <p className="panel-dialog-price-note">
            Se cobra al aprobar la solicitud. Te confirmamos la forma de pago antes de empezar.
          </p>

          <label className="panel-field">
            Nombre de la empresa
            <input name="companyName" required autoFocus className="panel-input" />
          </label>

          <label className="panel-field">
            Giro
            <select name="industry" defaultValue="otro" className="panel-input">
              {INDUSTRIES.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>

          <div className="panel-dialog-actions">
            {/* type="button" y close() a mano: formmethod="dialog" cancelaría el envío del
                formulario de al lado en algunos navegadores, y este botón solo cierra. */}
            <button type="button" className="panel-btn-ghost" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="panel-cta">
              Enviar solicitud
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
