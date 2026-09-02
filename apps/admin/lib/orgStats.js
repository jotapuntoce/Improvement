// Fuente única de los contadores de organización mostrados en Sidebar, Topbar y DashboardView.
// Reemplaza los contadores de productos sobre localStorage (jpc-admin-products-improvement-v1) que
// quedaron huérfanos cuando E3-T3 borró components/ImprovementCatalog.js — el único código que
// escribía esa key. "Organización activa" = tiene ≥1 membership; se define una sola vez aquí para
// no repetirla en cada componente que la necesita. cache() de React deduplica la consulta cuando
// layout.js y page.js la llaman en el mismo request.
import { cache } from "react";
import { db } from "./db.js";
import { organization, membership, orgBuildStage } from "@jotapuntoce/db/schema";

export const getOrgStats = cache(async function getOrgStats() {
  const [orgs, allMemberships, allStages] = await Promise.all([
    db.select().from(organization),
    db.select().from(membership),
    db.select().from(orgBuildStage),
  ]);

  return {
    totalOrgs: orgs.length,
    orgsWithMembers: new Set(allMemberships.map((m) => m.orgId)).size,
    totalMembers: allMemberships.length,
    completedStages: allStages.filter((s) => s.status === "completada").length,
  };
});

// "Proyectos activos" del pizarrón de corcho del dashboard (DashboardView.js) — una organización
// cuenta como proyecto activo cuando tiene al menos una etapa en status 'en_progreso'. Reutiliza el
// mismo select de organization/orgBuildStage que getOrgStats() en vez de una query nueva; cache()
// dedupe si ambas se llaman en el mismo request.
export const getActiveProjects = cache(async function getActiveProjects() {
  const [orgs, allStages] = await Promise.all([
    db.select().from(organization),
    db.select().from(orgBuildStage),
  ]);

  const stagesByOrg = new Map();
  for (const stage of allStages) {
    if (!stagesByOrg.has(stage.orgId)) stagesByOrg.set(stage.orgId, []);
    stagesByOrg.get(stage.orgId).push(stage);
  }

  const projects = [];
  for (const org of orgs) {
    const stages = (stagesByOrg.get(org.id) || []).sort((a, b) => a.stageOrder - b.stageOrder);
    const current = stages.find((s) => s.status === "en_progreso");
    if (!current) continue;
    projects.push({
      id: org.id,
      name: org.name,
      currentStageName: current.stageName,
      completedCount: stages.filter((s) => s.status === "completada").length,
      totalCount: stages.length,
    });
  }
  return projects;
});
