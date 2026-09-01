// SceneShell — arma el grafo con server/scene/loadDashboardScene.ts y monta Scene3D (vía
// Scene3DLoader, el Client Component que hace el dynamic import con ssr:false). Fuera del files
// declarado de E3-T1 (el blueprint nunca asigna esta página a ninguna tarea), pero el usuario pidió
// construirla aquí para poder verificar la escena en el preview real.
import { requireOrgMembership } from "@/server/auth/guard";
import { loadDashboardScene } from "@/server/scene/loadDashboardScene";
import { Scene3DLoader } from "./Scene3DLoader.tsx";

export default async function DashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);
  const graph = await loadDashboardScene(memberRow.userId, orgId);

  return (
    <main style={{ height: "100vh", background: "var(--bg)", color: "var(--text-primary)" }}>
      <Scene3DLoader graph={graph} />
    </main>
  );
}
