// Contenido de la página / — Server Component puro. app/page.js llama requirePlatformAdmin(),
// getOrgStats() y getActiveProjects() (lib/orgStats.js) y pasa el resultado como props; este
// archivo, bajo components/, no puede importar packages/db directo (boundary de CLAUDE.md), así
// que ya no hay fetch propio.
//
// Reemplaza el hero + stat-grid + brand-cards planos por la escena de "recepción" — misma esencia
// que /login (edificio + recepción), diseñada e iterada en un Artifact antes de portarla aquí:
// pared con la TV de Productos digitales + el panel de las 6 Áreas de la empresa, y abajo el
// pizarrón de corcho con los Proyectos activos reales. El acceso al listado interno de
// organizaciones (antes enlazado aquí) sigue disponible desde el Sidebar ("Improvement" ya apunta
// a /improvement) — no se perdió, solo se dejó de repetir en el cuerpo del dashboard.
import ProductsScreen from "@/components/reception/ProductsScreen";
import AreasPanel from "@/components/reception/AreasPanel";
import ProjectsCorkboard from "@/components/reception/ProjectsCorkboard";

export default function DashboardView({
  totalOrgs = 0,
  totalMembers = 0,
  activeProjects = [],
  improvementUrl,
}) {
  return (
    <div className="page-stack">
      <section className="reception">
        <div className="r-head">
          <div>
            <p className="r-eyebrow">Bienvenido de vuelta</p>
            <h2 className="r-title">
              Recepción <em>JotaPuntoCe</em>
            </h2>
          </div>
          <span className="r-status">
            <span className="r-status-dot" />
            Sistema en vivo
          </span>
        </div>

        <div className="r-top">
          <ProductsScreen
            totalOrgs={totalOrgs}
            totalMembers={totalMembers}
            improvementUrl={improvementUrl}
          />
          <AreasPanel />
        </div>

        <div className="r-bottom">
          <ProjectsCorkboard projects={activeProjects} />
        </div>
      </section>
    </div>
  );
}
