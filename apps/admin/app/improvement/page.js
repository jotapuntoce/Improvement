// Cuentas Improvement, agrupadas por cliente (la persona) — no por organización suelta. Caso real:
// Jaime Salinas tiene dos empresas, Camibel y Afianza. Camibel ya tiene organización real (tarjeta
// activa, con link a su Mapa de Construcción y a su dashboard real de Improvement); Afianza todavía
// no se ha provisionado, así que se ve grisácea con "Obra por construir" — mismo tratamiento que
// Summum System en el dashboard principal (components/reception/ProductsScreen.js): visible, pero
// claramente no disponible todavía.
//
// "Ver su empresa digital ↗" abre en pestaña nueva el dashboard real de esa organización dentro de
// apps/improvement (con el motor 3D, Scene3D.tsx) — no un iframe embebido. Embeberlo necesitaría un
// puente de sesión propio: la sesión de admin (José Carlos) no es la sesión del dueño de la org
// dentro de Improvement.
import Link from "next/link";
import { asc } from "drizzle-orm";
import { requirePlatformAdmin } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { organization, membership, orgBuildStage, prospectClient, prospectCompany } from "@jotapuntoce/db/schema";

function deriveCurrentStageName(stages) {
  const inProgress = stages.find((s) => s.status === "en_progreso");
  if (inProgress) return inProgress.stageName;
  const last = stages[stages.length - 1];
  if (last?.status === "completada") return last.stageName;
  return null;
}

export default async function ImprovementPage() {
  await requirePlatformAdmin();
  const improvementUrl = process.env.NEXT_PUBLIC_IMPROVEMENT_URL || "https://improvement-jotapuntoces-projects.vercel.app";

  const [clients, prospects, orgs, allMemberships, allStages] = await Promise.all([
    db.select().from(prospectClient).orderBy(asc(prospectClient.createdAt)),
    db.select().from(prospectCompany).orderBy(asc(prospectCompany.priority)),
    db.select().from(organization).orderBy(asc(organization.createdAt)),
    db.select().from(membership),
    db.select().from(orgBuildStage).orderBy(asc(orgBuildStage.stageOrder)),
  ]);

  function resolveOrgInfo(orgId) {
    const org = orgs.find((o) => o.id === orgId);
    if (!org) return null;
    const memberCount = allMemberships.filter((m) => m.orgId === orgId).length;
    const orgStages = allStages.filter((s) => s.orgId === orgId);
    return { ...org, memberCount, currentStage: deriveCurrentStageName(orgStages) };
  }

  const prospectsByClient = new Map();
  for (const p of prospects) {
    const list = prospectsByClient.get(p.prospectClientId) ?? [];
    list.push(p);
    prospectsByClient.set(p.prospectClientId, list);
  }
  // Organizaciones que no vinieron del backlog de prospectos (ej. "JotaPuntoCe (demo)", sembrada
  // directo por pnpm db:seed) — se listan aparte para no perderlas, sin forzarlas bajo un cliente
  // que no tienen.
  const claimedOrgIds = new Set(prospects.filter((p) => p.orgId).map((p) => p.orgId));
  const unclaimedOrgs = orgs.filter((o) => !claimedOrgIds.has(o.id));

  const isEmpty = clients.length === 0 && unclaimedOrgs.length === 0;

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <Link href="/" className="page-back-link">
            ← Dashboard
          </Link>
          <h2>Cuentas Improvement</h2>
          <p className="topbar-subtitle">Clientes reales usando Improvement, agrupados por persona.</p>
        </div>
        <Link href="/prospects" className="btn btn-primary">
          Backlog de prospectos
        </Link>
      </section>

      {isEmpty ? (
        <p className="empty-hint">Sin organizaciones todavía.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {clients.map((client) => {
            const clientProspects = prospectsByClient.get(client.id) ?? [];
            if (clientProspects.length === 0) return null;

            return (
              <section
                key={client.id}
                className="product-card"
                style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>{client.fullName}</h3>
                  <p className="product-desc" style={{ margin: "4px 0 0" }}>{client.email}</p>
                </div>

                <section className="product-grid">
                  {clientProspects.map((prospect) => {
                    const orgInfo = prospect.orgId ? resolveOrgInfo(prospect.orgId) : null;

                    if (orgInfo) {
                      return (
                        <div
                          key={prospect.id}
                          className="product-card"
                          style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                          <h4 style={{ margin: 0 }}>{orgInfo.name}</h4>
                          <p className="product-desc" style={{ margin: 0 }}>
                            {orgInfo.memberCount} {orgInfo.memberCount === 1 ? "miembro" : "miembros"}
                            {prospect.industry ? ` · ${prospect.industry}` : ""}
                          </p>
                          <span className="category-chip" style={{ "--chip-color": "var(--success)", alignSelf: "flex-start" }}>
                            {orgInfo.currentStage ?? "Sin etapa activa"}
                          </span>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                            <Link href={`/organizations/${orgInfo.id}`} className="btn btn-ghost">
                              Mapa de Construcción
                            </Link>
                            <a
                              href={`${improvementUrl}/${orgInfo.id}/dashboard`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-primary"
                            >
                              Ver su empresa digital ↗
                            </a>
                          </div>
                        </div>
                      );
                    }

                    // Sin organización todavía — mismo tratamiento que Summum System en el dashboard:
                    // visible, grisáceo, "Obra por construir", sin acción disponible.
                    return (
                      <div
                        key={prospect.id}
                        className="product-card"
                        style={{
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          opacity: 0.45,
                          filter: "grayscale(1)",
                        }}
                      >
                        <h4 style={{ margin: 0 }}>{prospect.name}</h4>
                        {prospect.industry && <p className="product-desc" style={{ margin: 0 }}>{prospect.industry}</p>}
                        <span className="category-chip" style={{ "--chip-color": "var(--text-muted)", alignSelf: "flex-start" }}>
                          Obra por construir
                        </span>
                      </div>
                    );
                  })}
                </section>
              </section>
            );
          })}

          {unclaimedOrgs.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <h3 style={{ margin: 0 }}>Otras organizaciones</h3>
              <div className="product-grid">
                {unclaimedOrgs.map((org) => {
                  const memberCount = allMemberships.filter((m) => m.orgId === org.id).length;
                  const orgStages = allStages.filter((s) => s.orgId === org.id);
                  const currentStage = deriveCurrentStageName(orgStages);
                  return (
                    <Link
                      key={org.id}
                      href={`/organizations/${org.id}`}
                      className="product-card"
                      style={{ padding: "16px", textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: "8px" }}
                    >
                      <h3 style={{ margin: 0 }}>{org.name}</h3>
                      <p className="product-desc" style={{ margin: 0 }}>
                        {memberCount} {memberCount === 1 ? "miembro" : "miembros"}
                      </p>
                      <span className="category-chip" style={{ "--chip-color": "var(--accent-2)", alignSelf: "flex-start" }}>
                        {currentStage ?? "Sin etapa activa"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
