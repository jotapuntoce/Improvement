// Mapa de Construcción — de solo lectura, mapa de niveles tipo videojuego. Sin formularios ni
// manejadores de clic: no existe (ni debe existir) un Server Action que mute org_build_stage desde
// esta app — la edita a mano Jose Carlos desde apps/admin (Non-Goals: sin comentarios/chat).
import { requireOrgMembership } from "@/server/auth/guard";
import { getBuildMap } from "@/server/scene/buildMap";

const STATUS_LABEL: Record<string, string> = {
  bloqueada: "Bloqueada",
  en_progreso: "En progreso",
  completada: "Completada",
};

function stageStyle(status: string) {
  const base = {
    borderRadius: "var(--radius-lg, 22px)",
    border: "1px solid var(--border)",
    padding: "20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    position: "relative" as const,
  };

  if (status === "completada") {
    return { ...base, background: "color-mix(in srgb, var(--success) 14%, var(--bg-card))", borderColor: "var(--success)" };
  }
  if (status === "en_progreso") {
    return {
      ...base,
      background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-1) 20%, var(--bg-card)), color-mix(in srgb, var(--accent-2) 20%, var(--bg-card)))",
      borderColor: "var(--accent-1)",
    };
  }
  return { ...base, background: "var(--bg-card)", color: "var(--text-secondary)" };
}

export default async function MapaPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const memberRow = await requireOrgMembership(orgId);
  const { stages, currentIndex } = await getBuildMap(memberRow.userId, orgId);

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
        gap: "20px",
        maxWidth: "640px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Mapa de Construcción</h1>

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
        {stages.map((stage, i) => (
          <li key={stage.id} style={stageStyle(stage.status)}>
            {i === currentIndex && (
              <span
                style={{
                  position: "absolute",
                  top: "-10px",
                  right: "16px",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "999px",
                  background: "var(--accent-1)",
                  color: "#05060b",
                }}
              >
                Estás aquí
              </span>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ fontWeight: 700 }}>
                {stage.stageOrder}. {stage.stageName}
              </span>
              <span style={{ fontSize: "12px" }}>{STATUS_LABEL[stage.status] ?? stage.status}</span>
            </div>
            {stage.description && <p style={{ margin: 0, fontSize: "13px" }}>{stage.description}</p>}
          </li>
        ))}
        {stages.length === 0 && (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Sin etapas registradas todavía.</p>
        )}
      </ol>
    </main>
  );
}
