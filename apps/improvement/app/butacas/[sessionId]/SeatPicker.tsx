"use client";
// Elige hasta 10 lugares libres, pide nombre y correo y manda al Checkout de Stripe. El estado se vuelve a
// leer de la ruta pública cada 5 s.
import { useEffect, useState } from "react";
import { SeatGrid } from "@/components/SeatGrid.tsx";
import type { PublicSeatState } from "@/server/seats/publicState.ts";

const MAX = 10;
const TAQUILLA = "Esta función se vende solo en taquilla.";

export function SeatPicker({ sessionId, initial }: { sessionId: string; initial: PublicSeatState }) {
  const [state, setState] = useState(initial);
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(initial.ventaEnLinea ? null : TAQUILLA);
  const [busy, setBusy] = useState(false);

  // ponytail: polling cada 5 s; sube a Realtime Broadcast si la carga lo pide
  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch(`/api/butacas/${sessionId}/estado`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { ok: true; data: PublicSeatState };
      setState(body.data);
      const libres = new Set(body.data.seats.filter((s) => s.status === "libre").map((s) => s.id));
      setChosen((c) => c.filter((x) => libres.has(x)));
    }, 5000);
    return () => clearInterval(id);
  }, [sessionId]);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX ? [...c, id] : c));

  async function comprar(formData: FormData) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/butacas/${sessionId}/apartar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatIds: chosen, name: formData.get("name"), email: formData.get("email") }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { ok: boolean; data?: { url: string }; error?: { code: string; message: string } } | null;
    if (body?.ok && body.data) {
      window.location.assign(body.data.url);
      return;
    }
    setBusy(false);
    setMessage(body?.error?.code === "TAQUILLA_ONLY" ? TAQUILLA : (body?.error?.message ?? "No se pudo apartar. Intenta de nuevo."));
  }

  return (
    <form action={comprar} className="config-form config-card" aria-label="Comprar lugares">
      <fieldset className="space-y-2">
        <legend className="config-card-title">Elige hasta {MAX} lugares</legend>
        <SeatGrid
          seats={state.seats}
          border={(s) => (s.status === "libre" ? "var(--success)" : "var(--border)")}
          cell={(s) =>
            s.status === "libre" ? (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={chosen.includes(s.id)} onChange={() => toggle(s.id)} />
                <span>{s.label} · Libre</span>
              </label>
            ) : (
              <span>{s.label} · Ocupado</span>
            )
          }
        />
      </fieldset>
      <label className="permiso-field">
        <span>Tu nombre</span>
        <input name="name" required maxLength={80} autoComplete="name" className="config-input" />
      </label>
      <label className="permiso-field">
        <span>Tu correo</span>
        <input name="email" type="email" required autoComplete="email" className="config-input" />
      </label>
      <p role="status" className="config-hint">
        {message}
      </p>
      <button type="submit" className="panel-cta" disabled={busy || chosen.length === 0}>
        Comprar {chosen.length > 0 ? `${chosen.length} lugar${chosen.length === 1 ? "" : "es"}` : ""}
      </button>
    </form>
  );
}
