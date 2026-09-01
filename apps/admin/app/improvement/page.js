// Cuentas Improvement — reemplaza por completo el catálogo de productos sobre localStorage
// (criterio #1: esta página ya no toca el helper de persistencia local, ni directo ni a través de
// components/ImprovementCatalog.js). Lista de organization real con conteo de miembros y la etapa
// actual de su Mapa de Construcción.
import Link from "next/link";
import { asc } from "drizzle-orm";
import { requirePlatformAdmin } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { organization, membership, orgBuildStage } from "@jotapuntoce/db/schema";

function deriveCurrentStageName(stages) {
  const inProgress = stages.find((s) => s.status === "en_progreso");
  if (inProgress) return inProgress.stageName;
  const last = stages[stages.length - 1];
  if (last?.status === "completada") return last.stageName;
  return null;
}

export default async function ImprovementPage() {
  await requirePlatformAdmin();

  const [orgs, allMemberships, allStages] = await Promise.all([
    db.select().from(organization).orderBy(asc(organization.createdAt)),
    db.select().from(membership),
    db.select().from(orgBuildStage).orderBy(asc(orgBuildStage.stageOrder)),
  ]);

  const rows = orgs.map((org) => {
    const memberCount = allMemberships.filter((m) => m.orgId === org.id).length;
    const orgStages = allStages.filter((s) => s.orgId === org.id);
    return { ...org, memberCount, currentStage: deriveCurrentStageName(orgStages) };
  });

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <h2>Cuentas Improvement</h2>
          <p className="topbar-subtitle">Organizaciones reales usando Improvement.</p>
        </div>
        <Link href="/prospects" className="btn btn-primary">
          Backlog de prospectos
        </Link>
      </section>

      {rows.length === 0 ? (
        <p className="empty-hint">Sin organizaciones todavía.</p>
      ) : (
        <section className="product-grid">
          {rows.map((org) => (
            <Link
              key={org.id}
              href={`/organizations/${org.id}`}
              className="product-card"
              style={{ padding: "16px", textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <h3 style={{ margin: 0 }}>{org.name}</h3>
              <p className="product-desc" style={{ margin: 0 }}>
                {org.memberCount} {org.memberCount === 1 ? "miembro" : "miembros"}
              </p>
              <span className="category-chip" style={{ "--chip-color": "var(--accent-2)", alignSelf: "flex-start" }}>
                {org.currentStage ?? "Sin etapa activa"}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
