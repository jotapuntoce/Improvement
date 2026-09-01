// Contenido de la página / — Server Component puro. app/page.js llama requirePlatformAdmin() y
// getOrgStats() (lib/orgStats.js) y pasa el resultado como props; este archivo, bajo components/,
// no puede importar packages/db directo (boundary de CLAUDE.md), así que ya no hay fetch propio.
// Reemplaza los contadores de productos sobre localStorage (jpc-admin-products-improvement-v1),
// huérfanos desde que E3-T3 borró components/ImprovementCatalog.js.
import Link from "next/link";
import AppIcon from "@/components/AppIcon";

function StatCard({ label, value, icon }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div>
        <p className="stat-value">{value}</p>
        <p className="stat-label">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardView({
  totalOrgs = 0,
  orgsWithMembers = 0,
  totalMembers = 0,
  completedStages = 0,
}) {
  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="hero-eyebrow">Bienvenido de vuelta</p>
          <h2 className="hero-title">
            Panel Administrativo <span className="grad-text">JotaPuntoCe</span>
          </h2>
          <p className="hero-copy">
            Gestiona tus marcas y productos desde un solo lugar. Empieza por Improvement.
          </p>
        </div>
        <Link href="/improvement" className="btn btn-primary">
          Ir a Improvement →
        </Link>
      </section>

      <section className="stat-grid">
        <StatCard label="Organizaciones" value={totalOrgs} icon="🏢" />
        <StatCard label="Con miembros" value={orgsWithMembers} icon="⚡" />
        <StatCard label="Miembros totales" value={totalMembers} icon="👥" />
        <StatCard label="Etapas completadas" value={completedStages} icon="✅" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Link href="/improvement" className="brand-card">
          <div className="brand-card-glow" />
          <AppIcon size={48} liveCount={orgsWithMembers} liveLabel="organización(es) con miembros" />
          <div>
            <h3>Improvement</h3>
            <p>Empresa digital · catálogo y gestión de productos.</p>
          </div>
          <span className="brand-card-arrow">→</span>
        </Link>
        <div className="brand-card brand-card-disabled">
          <div className="brand-card-icon">+</div>
          <div>
            <h3>Próxima marca</h3>
            <p>Aquí aparecerá tu siguiente negocio.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
