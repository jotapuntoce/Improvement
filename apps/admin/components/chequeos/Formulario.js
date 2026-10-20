"use client";
// Formulario con el mensaje de error del resultado tipado ({ ok:false, error }): la única pieza cliente del panel de
// chequeos.
import { useActionState } from "react";

function mensaje(error) {
  if (error.mensaje) return error.mensaje;
  const campos = Object.entries(error.campos ?? {});
  return campos.length ? campos.map(([c, m]) => `${c}: ${m}`).join(" · ") : error.code;
}

export default function Formulario({ action, children, className = "chq-form", boton = "Guardar" }) {
  const [estado, enviar, enviando] = useActionState(action, null);
  const error = estado && !estado.ok ? estado.error : null;
  return (
    <form action={enviar} className={className}>
      {children}
      <button type="submit" className="btn btn-primary" disabled={enviando}>
        {enviando ? "Guardando…" : boton}
      </button>
      {error && <p className="form-error">{mensaje(error)}</p>}
      {estado?.ok && <p className="chq-ok">Listo</p>}
    </form>
  );
}
