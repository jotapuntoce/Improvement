// Página pública de una función, sin sesión: el mapa con lugares libres u ocupados y la compra en línea
// (SeatPicker). Solo columnas públicas (server/seats/publicState.ts); nunca compradores ni ids internos.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicSeatState } from "@/server/seats/publicState.ts";
import { SeatPicker } from "./SeatPicker.tsx";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

const when = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "full", timeStyle: "short" });
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default async function ButacasPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ pago?: string }>;
}) {
  const { sessionId } = await params;
  const { pago } = await searchParams;
  const state = await loadPublicSeatState(sessionId, new Date());
  if (!state) notFound();

  return (
    <main className="config-page" style={{ maxWidth: "56rem" }}>
      <h1 className="config-title">{state.title}</h1>
      <p className="config-hint">
        {when.format(new Date(state.startsAt))} · {money.format(state.priceCents / 100)} por lugar
      </p>
      {pago === "ok" && (
        <p role="status" className="config-hint">
          ¡Listo! Tu pago se recibió; te llegará la confirmación por correo.
        </p>
      )}
      {pago === "cancelado" && (
        <p role="status" className="config-hint">
          El pago se canceló y tus lugares se liberarán en unos minutos.
        </p>
      )}
      <SeatPicker sessionId={sessionId} initial={state} />
    </main>
  );
}
