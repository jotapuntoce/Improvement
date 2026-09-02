// Detalle de un org: CRUD de org_build_stage (Mapa de Construcción) + vista de solo lectura de
// áreas y objetivos. Escribir aquí es lo que criterio #3 de E3-T3 espera ver reflejado de inmediato
// en /[org]/mapa de apps/improvement — misma tabla, sin caché intermedia.
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "../../../lib/auth.js";
import { db } from "../../../lib/db.js";
import { organization, orgBuildStage, area, objective } from "@jotapuntoce/db/schema";

const STAGE_STATUS_OPTIONS = ["bloqueada", "en_progreso", "completada"];
const STAGE_STATUS_LABEL = {
  bloqueada: "Bloqueada",
  en_progreso: "En progreso",
  completada: "Completada",
};

export default async function OrganizationDetailPage({ params }) {
  await requirePlatformAdmin();
  const { orgId } = await params;

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1);
  if (!org) notFound();

  const stages = await db
    .select()
    .from(orgBuildStage)
    .where(eq(orgBuildStage.orgId, orgId))
    .orderBy(asc(orgBuildStage.stageOrder));
  const areas = await db.select().from(area).where(eq(area.orgId, orgId));
  const objectives = await db.select().from(objective).where(eq(objective.orgId, orgId));

  async function createStage(formData) {
    "use server";
    await requirePlatformAdmin();
    const stageName = formData.get("stageName")?.toString().trim();
    if (!stageName) return;
    const description = formData.get("description")?.toString().trim() || null;
    const nextOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.stageOrder)) + 1 : 1;

    await db.insert(orgBuildStage).values({ orgId, stageOrder: nextOrder, stageName, description, status: "bloqueada" });
    revalidatePath(`/organizations/${orgId}`);
  }

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          {/* Esta página cuelga de /improvement (la lista de organizaciones la enlaza aquí), así
              que regresa un nivel — no hasta el Dashboard — para no perder el punto de partida. */}
          <Link href="/improvement" className="page-back-link">
            ← Cuentas Improvement
          </Link>
          <h2>{org.name}</h2>
          <p className="topbar-subtitle">{org.slug}</p>
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: "10px" }}>Mapa de Construcción</h3>

        <form action={createStage} className="toolbar" style={{ flexWrap: "wrap", marginBottom: "14px" }}>
          <input className="input" name="stageName" placeholder="Nombre de la etapa" required />
          <input className="input" name="description" placeholder="Descripción (opcional)" style={{ flex: 1, minWidth: "160px" }} />
          <button type="submit" className="btn btn-primary">
            + Agregar etapa
          </button>
        </form>

        {stages.length === 0 ? (
          <p className="empty-hint">Sin etapas todavía.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            {stages.map((stage) => {
              async function updateStatus(formData) {
                "use server";
                await requirePlatformAdmin();
                const status = formData.get("status")?.toString();
                if (!STAGE_STATUS_OPTIONS.includes(status)) return;
                await db
                  .update(orgBuildStage)
                  .set({ status, completedAt: status === "completada" ? new Date() : null })
                  .where(eq(orgBuildStage.id, stage.id));
                revalidatePath(`/organizations/${orgId}`);
              }

              async function removeStage() {
                "use server";
                await requirePlatformAdmin();
                await db.delete(orgBuildStage).where(eq(orgBuildStage.id, stage.id));
                revalidatePath(`/organizations/${orgId}`);
              }

              return (
                <li
                  key={stage.id}
                  className="product-card"
                  style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}
                >
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>
                      {stage.stageOrder}. {stage.stageName}
                    </p>
                    {stage.description && <p className="product-desc" style={{ margin: "4px 0 0" }}>{stage.description}</p>}
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <form action={updateStatus} style={{ display: "flex", gap: "6px" }}>
                      <select className="input" name="status" defaultValue={stage.status}>
                        {STAGE_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn btn-ghost">
                        Actualizar
                      </button>
                    </form>
                    <form action={removeStage}>
                      <button type="submit" className="btn btn-danger">
                        Eliminar
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 style={{ marginBottom: "10px" }}>Áreas (solo lectura)</h3>
        {areas.length === 0 ? (
          <p className="empty-hint">Sin áreas todavía.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
            {areas.map((a) => (
              <li key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: a.color }} />
                {a.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 style={{ marginBottom: "10px" }}>Objetivos (solo lectura)</h3>
        {objectives.length === 0 ? (
          <p className="empty-hint">Sin objetivos todavía.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
            {objectives.map((o) => (
              <li key={o.id} style={{ fontSize: "14px" }}>
                {o.title} — {o.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
