// Dashboard del org: las secciones a las que se puede entrar, más el resumen de áreas y equipo.
//
// La escena 3D (Scene3D.tsx, vía Scene3DLoader) está fuera del proceso por decisión de Jose Carlos,
// no borrada: para volver a encenderla se cambia SceneList por Scene3DLoader abajo — pero ojo, esa
// escena necesita alto propio (antes este <main> era height: 100vh), y ahora comparte la página con
// la navegación.
import { isPlatformAdmin, requireOrgMembership } from "@/server/auth/guard";
import { loadDashboardScene } from "@/server/scene/loadDashboardScene";
import { DashboardNav } from "./DashboardNav.tsx";
import { SceneList } from "./SceneList.tsx";

export default async function DashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);
  const [graph, admin] = await Promise.all([
    loadDashboardScene(memberRow.userId, orgId),
    isPlatformAdmin(memberRow.userId),
  ]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-geist-sans), sans-serif",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Tu empresa</h1>
      <DashboardNav orgId={orgId} showPlanos={admin} />
      <SceneList graph={graph} />
    </main>
  );
}
