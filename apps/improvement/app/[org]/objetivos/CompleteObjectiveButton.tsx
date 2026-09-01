"use client";

// Única hoja interactiva de /[org]/objetivos (§9.6 del blueprint — ObjectiveList y ObjectiveRow son
// Server Components). Recibe la Server Action ya resuelta por la página (con orgId y objectiveId
// capturados por closure del lado del servidor) — este componente nunca ve ni decide un id de org.
import { useTransition } from "react";

export function CompleteObjectiveButton({
  action,
  disabled,
}: {
  action: () => Promise<void>;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      onClick={() => startTransition(() => action())}
      style={{
        padding: "8px 14px",
        borderRadius: "10px",
        border: "none",
        fontWeight: 600,
        fontSize: "13px",
        cursor: disabled || isPending ? "default" : "pointer",
        background: disabled ? "var(--bg-card)" : "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
        color: disabled ? "var(--text-secondary)" : "#05060b",
        opacity: isPending ? 0.7 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {disabled ? "Completado" : isPending ? "Completando..." : "Completar"}
    </button>
  );
}
