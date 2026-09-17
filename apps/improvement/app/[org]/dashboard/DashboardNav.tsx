// Las secciones del org, desde el dashboard. Existía la ruta de cada una pero ningún botón llevaba
// a ellas: se entraba al dashboard y el recorrido se acababa ahí, solo se llegaba escribiendo la URL.
//
// "Planos" no está en esta lista aunque la ruta exista: es herramienta de Jose Carlos (ver el guard
// en [org]/planos/page.tsx), y showPlanos la muestra solo cuando la sesión es de platform admin.
// Server Component: son enlaces, no hay estado que manejar.
import Link from "next/link";

interface Section {
  slug: string;
  label: string;
  hint: string;
}

const CLIENT_SECTIONS: Section[] = [
  { slug: "mapa", label: "Mapa de Construcción", hint: "En qué etapa va tu empresa digital" },
  { slug: "objetivos", label: "Objetivos", hint: "Las metas del equipo y sus puntos" },
  { slug: "equipo", label: "Equipo", hint: "Quién trabaja contigo" },
  { slug: "clientes", label: "Clientes", hint: "Tu cartera y cómo va cada cuenta" },
  { slug: "powerups", label: "PowerUps", hint: "Canjea los puntos que acumula tu equipo" },
];

const ADMIN_SECTIONS: Section[] = [
  { slug: "planos", label: "Planos", hint: "Los proyectos como piezas conectadas" },
];

export function DashboardNav({ orgId, showPlanos }: { orgId: string; showPlanos: boolean }) {
  const sections = showPlanos ? [...CLIENT_SECTIONS, ...ADMIN_SECTIONS] : CLIENT_SECTIONS;

  return (
    <nav className="dash-nav" aria-label="Secciones de la empresa">
      {sections.map((section) => (
        <Link key={section.slug} href={`/${orgId}/${section.slug}`} className="dash-nav-card">
          <span className="dash-nav-label">{section.label}</span>
          <span className="dash-nav-hint">{section.hint}</span>
        </Link>
      ))}
    </nav>
  );
}
