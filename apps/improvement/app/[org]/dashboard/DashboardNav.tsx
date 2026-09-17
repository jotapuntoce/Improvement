// Las secciones del org, desde el dashboard. La lista ya no vive aquí: la arma
// server/permissions/loadSections.ts con el permiso de quien entra y los nombres que el dueño les
// puso. Nadie ve una puerta que no abre.
//
// "Planos" sigue aparte: es herramienta de Jose Carlos y no es una sección con tipo de permiso.
import Link from "next/link";
import type { VisibleSection } from "@/server/permissions/loadSections";

export function DashboardNav({
  orgId,
  sections,
  showPlanos,
}: {
  orgId: string;
  sections: VisibleSection[];
  showPlanos: boolean;
}) {
  const all = showPlanos
    ? [...sections, { slug: "planos", label: "Planos", hint: "Los proyectos como piezas conectadas" }]
    : sections;

  return (
    <nav className="dash-nav" aria-label="Secciones de la empresa">
      {all.map((section) => (
        <Link key={section.slug} href={`/${orgId}/${section.slug}`} className="dash-nav-card">
          <span className="dash-nav-label">{section.label}</span>
          <span className="dash-nav-hint">{section.hint}</span>
        </Link>
      ))}
    </nav>
  );
}
