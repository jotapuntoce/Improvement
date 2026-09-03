"use client";

// Recepción compartida — lo que aparece después del zoom del edificio (ver Building.tsx). El
// contenido interactivo de la tarjeta (el form de login real de apps/admin, o el botón "Entrar a
// tu dashboard" de apps/improvement) llega como children — Reception solo pone la ambientación de
// mostrador/recepción y el botón "Volver afuera", iguales para cualquier organización.
import type { ReactNode } from "react";

export interface ReceptionProps {
  companyName: string;
  greeting: string;
  onBack: () => void;
  children: ReactNode;
}

export function Reception({ companyName, greeting, onBack, children }: ReceptionProps) {
  return (
    <div className="jpc-reception">
      <div className="jpc-reception-wall">
        <p className="jpc-reception-eyebrow">Recepción</p>
        <p className="jpc-reception-word">{companyName}</p>
        <p className="jpc-reception-sub">{greeting}</p>
      </div>
      <div className="jpc-reception-card">
        {children}
        <button className="jpc-back-link" type="button" onClick={onBack}>
          ← Volver afuera
        </button>
      </div>
    </div>
  );
}
