"use client";

// El enlace recién emitido, con botón de copiar. Es la única hoja con estado de esta pantalla: el
// token se muestra UNA vez y no se vuelve a poder leer, así que copiarlo tiene que ser fácil.
import { useState } from "react";

export function InviteLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="invite-link">
      <code className="invite-link-url">{url}</code>
      <button
        type="button"
        className="panel-cta"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
        }}
      >
        {copiado ? "Copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}
