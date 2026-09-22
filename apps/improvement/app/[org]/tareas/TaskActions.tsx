"use client";

// Los botones de una tarea delegada. Cliente porque necesitan estado (qué se está enviando) y
// porque la nota se escribe sin recargar; la página que los contiene sigue siendo Server Component.
//
// Cada botón llama una Server Action que la página le pasó ya atada a su orgId. Este componente no
// sabe de qué empresa es la tarea, ni tiene por qué: si lo supiera, un día alguien le pasaría el
// orgId desde el cliente y sería un dato de entrada más que validar.
import { useState } from "react";

export type TaskAction = "aceptar" | "rechazar" | "empezar" | "completar";

export function TaskActions({
  status,
  onAction,
}: {
  status: string;
  onAction: (action: TaskAction, note: string) => Promise<string | null>;
}) {
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(action: TaskAction) {
    setOcupado(true);
    setError(null);
    try {
      setError(await onAction(action, nota));
    } finally {
      setOcupado(false);
    }
  }

  // Qué se puede hacer desde dónde. El mismo recorrido que valida el servidor
  // (server/improvement/delegation.ts) — aquí solo para no ofrecer un botón que va a fallar.
  const acciones: [TaskAction, string][] =
    status === "sugerida"
      ? [
          ["aceptar", "La tomo"],
          ["rechazar", "No me toca"],
        ]
      : status === "aceptada"
        ? [
            ["empezar", "Ya estoy en ella"],
            ["completar", "Terminada"],
          ]
        : status === "en_progreso"
          ? [["completar", "Terminada"]]
          : [];

  if (acciones.length === 0) return null;

  return (
    <div className="jpc-tarea-acciones">
      {error && (
        <p className="invite-error" role="alert">
          {error}
        </p>
      )}
      <textarea
        rows={2}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Una nota, si quieres decir algo"
        disabled={ocupado}
        className="config-input"
      />
      <div className="permiso-actions">
        {acciones.map(([a, label], i) => (
          <button
            key={a}
            type="button"
            disabled={ocupado}
            className={i === 0 ? "panel-cta" : "panel-btn-ghost"}
            onClick={() => correr(a)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
