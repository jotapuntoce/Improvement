"use client";
// ¿Qué pasa si? (G10): arranca con los números reales de hoy y recalcula en el navegador al mover
// ticket, tasa de cierre o tratos por mes. Nada se guarda ni se pide al servidor.
import { useState } from "react";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export type WhatIfBase = { ticketCents: number; winRate: number; dealsPerMonth: number; monthCents: number; sinHistoria: boolean };

export function WhatIf({ base }: { base: WhatIfBase }) {
  const [ticket, setTicket] = useState(Math.round(base.ticketCents / 100));
  const [rate, setRate] = useState(Math.round(base.winRate * 100));
  const [deals, setDeals] = useState(base.dealsPerMonth);
  const today = Math.round(base.dealsPerMonth * base.winRate * base.ticketCents) / 100;
  const projected = deals * (rate / 100) * ticket;
  const diff = projected - today;
  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(Math.max(0, Number(e.target.value) || 0));
  return (
    <section className="config-card dash-card" aria-label="Simulador">
      {base.sinHistoria && <p className="config-hint">Todavía no hay tratos cerrados en 6 meses: arrancamos en ceros. Pon tus propios números.</p>}
      <label className="permiso-field">
        <span>Ticket promedio (pesos)</span>
        <input type="number" min={0} step={100} value={ticket} onChange={num(setTicket)} className="config-input" />
      </label>
      <label className="permiso-field">
        <span>Tasa de cierre (%)</span>
        <input type="number" min={0} max={100} value={rate} onChange={num((n) => setRate(Math.min(100, n)))} className="config-input" />
      </label>
      <label className="permiso-field">
        <span>Tratos nuevos por mes</span>
        <input type="number" min={0} step={0.5} value={deals} onChange={num(setDeals)} className="config-input" />
      </label>
      <p className="dash-number" aria-live="polite">{MXN.format(projected)} al mes</p>
      <p className="config-hint">
        Hoy, con tus números reales: <span className="dash-figure">{MXN.format(today)}</span> al mes · diferencia{" "}
        <span className="dash-figure">{diff >= 0 ? "+" : "−"}{MXN.format(Math.abs(diff))}</span>
      </p>
    </section>
  );
}
