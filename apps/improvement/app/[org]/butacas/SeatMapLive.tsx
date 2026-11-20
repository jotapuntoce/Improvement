"use client";
// Dibuja el mapa de la función y escucha `seat_booking` de esa función con el JWT del usuario: RLS decide
// qué eventos llegan. Cada evento pide la página otra vez al servidor. Los lugares libres son casillas del
// formulario de taquilla que la envuelve; el estado va en texto, no solo en color.
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type Seat = { id: string; label: string; x: number; y: number; kind: string; capacity: number; status: "libre" | "apartado" | "vendido" };
const TEXT = { libre: "Disponible", apartado: "Apartado", vendido: "Vendido" } as const;
const BORDER = { libre: "var(--success)", apartado: "var(--accent-2)", vendido: "var(--border)" } as const;

export function SeatMapLive({
  sessionId,
  seats,
  realtime,
}: {
  sessionId: string;
  seats: Seat[];
  realtime: { accessToken: string; url: string; anonKey: string } | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("CONNECTING");
  // Mientras la venta de ESTE formulario está en vuelo no se refresca: un router.refresh() interrumpe el
  // redirect de la acción y la página cae a una copia previa a la venta. La acción ya trae el mapa nuevo.
  const { pending } = useFormStatus();
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const { accessToken, url, anonKey } = realtime ?? {};

  useEffect(() => {
    if (!accessToken || !url || !anonKey) return;
    // `accessToken` como callback (igual que ChannelLive): sin él, Realtime re-autentica con la anon key.
    const supabase = createClient(url, anonKey, { accessToken: async () => accessToken });
    void supabase.realtime.setAuth(accessToken);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Un apartado son dos eventos (held y sold): se juntan en un solo refresh.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!pendingRef.current) router.refresh();
      }, 300);
    };
    const sub = supabase
      .channel(`butacas-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "seat_booking", filter: `session_id=eq.${sessionId}` }, refresh)
      .subscribe((s) => setStatus(s));
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(sub);
    };
  }, [sessionId, accessToken, url, anonKey, router]);

  const cols = Math.max(...seats.map((s) => s.x)) + 1;
  return (
    <fieldset className="space-y-2">
      <legend className="config-hint">Lugares (marca los que vas a vender)</legend>
      <span hidden data-realtime={status} />
      <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(4.5rem, 1fr))` }}>
        {seats.map((s) => (
          <li
            key={s.id}
            data-seat={s.label}
            data-status={s.status}
            style={{ gridColumnStart: s.x + 1, gridRowStart: s.y + 1, border: `2px solid ${BORDER[s.status]}`, borderRadius: "var(--radius-sm)", padding: "0.25rem 0.5rem" }}
          >
            {s.status === "libre" ? (
              <label className="flex items-center gap-1">
                <input type="checkbox" name="seatId" value={s.id} />
                <span>
                  {s.label} · {TEXT[s.status]}
                </span>
              </label>
            ) : (
              <span>
                {s.label} · {TEXT[s.status]}
              </span>
            )}
            {s.kind === "mesa" && <span className="block text-sm">{s.capacity} personas</span>}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
