// La tarjeta de una empresa del portafolio: el ícono a la izquierda ocupando el alto de la tarjeta,
// el nombre arriba a la derecha y debajo los indicadores que esa empresa eligió medir.
//
// Los indicadores llegan ya resueltos (etiqueta y número) desde server/kpis/loadKpis.ts: la tarjeta
// no sabe de dónde salió cada número ni necesita saberlo. Dos empresas del mismo dueño pueden medir
// cosas completamente distintas y esto las dibuja igual.
//
// Server Component. La tarjeta entera es un <Link> cuando la empresa existe; una solicitud
// pendiente o rechazada se dibuja igual pero sin destino — no hay panel al que entrar todavía.
import Link from "next/link";
import { AppIconLarge } from "@jotapuntoce/ui/building/AppIconLarge.tsx";
import { formatKpiValue } from "@jotapuntoce/ui/building/kpis.ts";
import type { PanelCompany } from "@/server/companies/loadOwnerPanel";

const STATUS_NOTE: Record<string, string> = {
  pendiente: "Esperando aprobación",
  rechazada: "Solicitud rechazada",
};

function KpiGrid({ kpis }: { kpis: PanelCompany["kpis"] }) {
  if (!kpis) {
    return (
      <p className="company-card-note">
        Los indicadores aparecen en cuanto tu empresa entre en construcción.
      </p>
    );
  }

  if (kpis.length === 0) {
    return (
      <p className="company-card-note">
        Todavía no eliges qué medir en esta empresa. Configúralo y aparecen aquí.
      </p>
    );
  }

  return (
    <dl className="company-kpis">
      {kpis.map((kpi) => (
        <div key={kpi.id} className="company-kpi">
          <dt className="company-kpi-label" title={kpi.hint ?? undefined}>
            {kpi.label}
          </dt>
          <dd className="company-kpi-value">{formatKpiValue(kpi.value, kpi.format)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CompanyCard({ company }: { company: PanelCompany }) {
  const body = (
    <>
      <span className="company-card-icon">
        <AppIconLarge
          label=""
          stageLabel={company.stages[company.currentIndex]?.stageName ?? "Sin etapa activa"}
          industry={company.industry}
          size={112}
        />
      </span>
      <span className="company-card-body">
        <span className="company-card-title">
          {company.name}
          {STATUS_NOTE[company.status] && (
            <span className="company-card-status">{STATUS_NOTE[company.status]}</span>
          )}
        </span>
        <KpiGrid kpis={company.kpis} />
      </span>
    </>
  );

  if (!company.orgId) {
    return <div className="company-card company-card--inactive">{body}</div>;
  }

  return (
    <Link href={`/empresas/${company.orgId}`} className="company-card">
      {body}
    </Link>
  );
}
