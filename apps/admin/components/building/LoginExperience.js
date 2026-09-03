"use client";

// Orquesta la transición: edificio (exterior) -> zoom -> recepción (login real). Building y
// Reception (packages/ui) son ambos "tontos" — reciben props/children y no saben nada del otro ni
// de JotaPuntoCe específicamente; esa data vive en ./jotaPuntoCeData.js.
import { useState } from "react";
import { Building } from "@jotapuntoce/ui/building/Building.tsx";
import { Reception } from "@jotapuntoce/ui/building/Reception.tsx";
import { JOTAPUNTOCE_AREAS, JOTAPUNTOCE_COMPANY_NAME, JOTAPUNTOCE_SLOGAN } from "./jotaPuntoCeData";

export default function LoginExperience({ signInAction, hasError }) {
  const [entered, setEntered] = useState(false);

  return (
    <div className="jpc-scene">
      {entered ? (
        <Reception companyName={JOTAPUNTOCE_COMPANY_NAME} greeting="Bienvenido de vuelta" onBack={() => setEntered(false)}>
          <form action={signInAction}>
            <label className="jpc-field-label">
              Email
              <input className="jpc-field-input" type="email" name="email" required />
            </label>
            <label className="jpc-field-label">
              Contraseña
              <input className="jpc-field-input" type="password" name="password" required />
            </label>
            {hasError && <p className="jpc-reception-error">Email o contraseña incorrectos.</p>}
            <button className="jpc-reception-submit" type="submit">
              Entrar
            </button>
          </form>
        </Reception>
      ) : (
        <Building
          companyName={JOTAPUNTOCE_COMPANY_NAME}
          slogan={JOTAPUNTOCE_SLOGAN}
          areas={JOTAPUNTOCE_AREAS}
          onEnter={() => setEntered(true)}
        />
      )}
    </div>
  );
}
