// ¿Qué pasa si? — solo el dueño. El servidor entrega los números reales de hoy (forecast.ts) y el
// simulador los mueve en el navegador.
import { notFound } from "next/navigation";
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { whatIfBase } from "@/server/insights/forecast.ts";
import { WhatIf } from "@/components/dashboard/WhatIf.tsx";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0 });

export default async function QuePasaSi({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await requireOrgMembership(orgId);
  const base = await whatIfBase(me.userId, orgId);
  if (!base.ok) notFound();
  const b = base.data;
  return (
    <main className="config-page">
      <h1 className="config-title">¿Qué pasa si…?</h1>
      <ul className="equipo-list" aria-label="Tus números reales de hoy">
        <li>Ticket promedio ganado (6 meses): <span className="dash-figure">{MXN.format(b.ticketCents / 100)}</span></li>
        <li>Tasa de cierre: <span className="dash-figure">{PCT.format(b.winRate)}</span></li>
        <li>Tratos nuevos por mes: <span className="dash-figure">{b.dealsPerMonth}</span></li>
        <li>Ganado este mes: <span className="dash-figure">{MXN.format(b.monthCents / 100)}</span></li>
      </ul>
      <WhatIf base={b} />
    </main>
  );
}
