"use client";

// Única hoja interactiva de /[org]/powerups — mismo patrón que CompleteObjectiveButton.tsx
// (apps/improvement/app/[org]/objetivos/). Recibe la Server Action ya resuelta por la página, con
// orgId/partnerId capturados por closure del lado del servidor.
import { useTransition } from "react";

export function RedeemPowerupButton({
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
        color: disabled ? "var(--text-muted)" : "#05060b",
        opacity: isPending ? 0.7 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {isPending ? "Canjeando..." : disabled ? "Balance insuficiente" : "Canjear"}
    </button>
  );
}
