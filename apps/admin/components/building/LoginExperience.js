"use client";

// Orquesta la transición: edificio (exterior) -> zoom -> recepción (login real). Es la única pieza
// con estado de esta escena — JotaPuntoCeBuilding y ReceptionLogin son ambos "tontos", reciben
// callbacks/props y no saben nada del otro.
import { useState } from "react";
import JotaPuntoCeBuilding from "./JotaPuntoCeBuilding";
import ReceptionLogin from "./ReceptionLogin";

export default function LoginExperience({ signInAction, hasError }) {
  const [entered, setEntered] = useState(false);

  return (
    <div className="jpc-scene">
      {entered ? (
        <ReceptionLogin signInAction={signInAction} hasError={hasError} onBack={() => setEntered(false)} />
      ) : (
        <JotaPuntoCeBuilding onEnter={() => setEntered(true)} />
      )}
    </div>
  );
}
