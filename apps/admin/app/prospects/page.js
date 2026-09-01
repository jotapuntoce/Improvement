// Backlog de prospectos: prospecto -> en_construcción -> live. Mover a en_construcción dispara
// provisionOrganizationAction (E1-T5), idempotente. Marcar como live es solo un cambio de status —
// la provisión real ya ocurrió en el paso anterior.
import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { prospectCompany } from "@jotapuntoce/db/schema";
import { markProspectLiveAction, provisionOrganizationAction } from "./actions.js";

const STATUS_LABEL = {
  prospecto: "Prospecto",
  "en_construcción": "En construcción",
  live: "Live",
};

async function createProspect(formData) {
  "use server";
  await requirePlatformAdmin();
  const name = formData.get("name")?.toString().trim();
  if (!name) return;
  const notes = formData.get("notes")?.toString().trim() || null;
  const priority = Number(formData.get("priority"));

  await db.insert(prospectCompany).values({
    name,
    notes,
    priority: Number.isFinite(priority) ? priority : 0,
  });
  revalidatePath("/prospects");
}

export default async function ProspectsPage() {
  await requirePlatformAdmin();
  const prospects = await db.select().from(prospectCompany).orderBy(asc(prospectCompany.priority));

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <h2>Backlog de prospectos</h2>
          <p className="topbar-subtitle">Prospecto → en construcción → live.</p>
        </div>
      </section>

      <form action={createProspect} className="toolbar" style={{ flexWrap: "wrap" }}>
        <input className="input" name="name" placeholder="Nombre de la empresa" required />
        <input className="input" name="notes" placeholder="Notas (opcional)" style={{ flex: 1, minWidth: "160px" }} />
        <input className="input" name="priority" type="number" placeholder="Prioridad" style={{ maxWidth: "120px" }} />
        <button type="submit" className="btn btn-primary">
          + Nuevo prospecto
        </button>
      </form>

      {prospects.length === 0 ? (
        <p className="empty-hint">Sin prospectos todavía.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {prospects.map((prospect) => {
            async function moveToConstruction(formData) {
              "use server";
              const ownerEmail = formData.get("ownerEmail")?.toString().trim();
              if (!ownerEmail) return;
              await provisionOrganizationAction(prospect.id, ownerEmail);
              revalidatePath("/prospects");
            }

            async function markLive() {
              "use server";
              await markProspectLiveAction(prospect.id);
              revalidatePath("/prospects");
            }

            return (
              <li
                key={prospect.id}
                className="product-card"
                style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}
              >
                <div>
                  <p style={{ fontWeight: 600, margin: 0 }}>{prospect.name}</p>
                  {prospect.notes && <p className="product-desc" style={{ margin: "4px 0 0" }}>{prospect.notes}</p>}
                  <span className="category-chip" style={{ "--chip-color": "var(--accent-2)", marginTop: "6px" }}>
                    {STATUS_LABEL[prospect.status] ?? prospect.status}
                  </span>
                </div>

                {prospect.status === "prospecto" && (
                  <form action={moveToConstruction} style={{ display: "flex", gap: "6px" }}>
                    <input className="input" name="ownerEmail" type="email" placeholder="Email del dueño" required />
                    <button type="submit" className="btn btn-primary">
                      Provisionar
                    </button>
                  </form>
                )}
                {prospect.status === "en_construcción" && (
                  <form action={markLive}>
                    <button type="submit" className="btn btn-ghost">
                      Marcar como live
                    </button>
                  </form>
                )}
                {prospect.orgId && (
                  <a href={`/organizations/${prospect.orgId}`} style={{ fontSize: "13px", color: "var(--accent-2)" }}>
                    Ver organización →
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
