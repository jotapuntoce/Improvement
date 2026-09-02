// Server Component delgado — la regla de route protection (blueprint §"Route protection") exige
// requirePlatformAdmin() en cada página de apps/admin excepto /login. El contenido real vive en
// components/DashboardView.js; como ese archivo está bajo components/ y no puede importar
// packages/db directo (boundary de CLAUDE.md), los contadores de organización se resuelven aquí
// (lib/orgStats.js) y bajan como props.
import { requirePlatformAdmin } from "@/lib/auth.js";
import { getOrgStats, getActiveProjects } from "@/lib/orgStats.js";
import DashboardView from "@/components/DashboardView";

export default async function DashboardPage() {
  await requirePlatformAdmin();
  const [stats, activeProjects] = await Promise.all([getOrgStats(), getActiveProjects()]);
  const improvementUrl = process.env.NEXT_PUBLIC_IMPROVEMENT_URL || "https://improvement-jotapuntoces-projects.vercel.app";
  return <DashboardView {...stats} activeProjects={activeProjects} improvementUrl={improvementUrl} />;
}
