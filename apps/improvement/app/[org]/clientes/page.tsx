// CRM ligero — lista cursor-paginada con filtro por health_status. Sin ningún "use client": los
// forms nativos con Server Action ya funcionan sin JS (crear, cambiar health_status, eliminar), así
// que no hay hoja interactiva que envolver — a diferencia de /[org]/objetivos y /[org]/powerups.
import { revalidatePath } from "next/cache";
import { requireOrgMembership } from "@/server/auth/guard";
import {
  createClient as createClientRow,
  deleteClient,
  listClients,
  updateClient,
  type HealthStatus,
} from "@/server/clients/mutations";

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Saludable",
  neutral: "Neutral",
  at_risk: "En riesgo",
};

const HEALTH_OPTIONS: HealthStatus[] = ["healthy", "neutral", "at_risk"];

function isHealthStatus(value: string | undefined): value is HealthStatus {
  return value === "healthy" || value === "neutral" || value === "at_risk";
}

const inputStyle = {
  padding: "9px 12px",
  borderRadius: "10px",
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  fontSize: "13px",
};

export default async function ClientesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ cursor?: string; health?: string }>;
}) {
  const { org: orgId } = await params;
  const { cursor, health } = await searchParams;
  const memberRow = await requireOrgMembership(orgId);

  const healthFilter = isHealthStatus(health) ? health : undefined;
  const { data } = await listClients(memberRow.userId, orgId, {
    cursor: cursor ?? null,
    healthStatus: healthFilter,
  });

  async function create(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const name = formData.get("name")?.toString().trim();
    if (!name) return;
    const rawHealth = formData.get("healthStatus")?.toString();
    const notes = formData.get("notes")?.toString().trim() || null;
    await createClientRow(row.userId, orgId, {
      name,
      healthStatus: isHealthStatus(rawHealth) ? rawHealth : undefined,
      notes,
    });
    revalidatePath(`/${orgId}/clientes`);
  }

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
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>Clientes</h1>

      <form action={create} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input name="name" placeholder="Nombre del cliente" required style={inputStyle} />
        <select name="healthStatus" defaultValue="neutral" style={inputStyle}>
          {HEALTH_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {HEALTH_LABEL[h]}
            </option>
          ))}
        </select>
        <input name="notes" placeholder="Notas (opcional)" style={{ ...inputStyle, flex: 1, minWidth: "160px" }} />
        <button
          type="submit"
          style={{
            padding: "9px 16px",
            borderRadius: "10px",
            border: "none",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            background: "linear-gradient(135deg, var(--accent-1), var(--accent-2))",
            color: "#05060b",
          }}
        >
          + Nuevo cliente
        </button>
      </form>

      <nav style={{ display: "flex", gap: "8px", fontSize: "13px" }}>
        <a href={`/${orgId}/clientes`} style={{ color: healthFilter ? "var(--text-muted)" : "var(--accent-2)" }}>
          Todos
        </a>
        {HEALTH_OPTIONS.map((h) => (
          <a
            key={h}
            href={`/${orgId}/clientes?health=${h}`}
            style={{ color: healthFilter === h ? "var(--accent-2)" : "var(--text-muted)" }}
          >
            {HEALTH_LABEL[h]}
          </a>
        ))}
      </nav>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        {data.clients.map((c) => {
          async function updateHealth(formData: FormData) {
            "use server";
            const row = await requireOrgMembership(orgId);
            const raw = formData.get("healthStatus")?.toString();
            if (!isHealthStatus(raw)) return;
            await updateClient(row.userId, orgId, c.id, { healthStatus: raw });
            revalidatePath(`/${orgId}/clientes`);
          }

          async function remove() {
            "use server";
            const row = await requireOrgMembership(orgId);
            await deleteClient(row.userId, orgId, c.id);
            revalidatePath(`/${orgId}/clientes`);
          }

          return (
            <li
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "16px",
                borderRadius: "var(--radius-md, 16px)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ fontWeight: 600, margin: 0 }}>{c.name}</p>
                {c.notes && (
                  <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "4px 0 0" }}>{c.notes}</p>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <form action={updateHealth} style={{ display: "flex", gap: "6px" }}>
                  <select name="healthStatus" defaultValue={c.healthStatus} style={inputStyle}>
                    {HEALTH_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {HEALTH_LABEL[h]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={{ ...inputStyle, cursor: "pointer" }}>
                    Actualizar
                  </button>
                </form>
                <form action={remove}>
                  <button type="submit" style={{ ...inputStyle, cursor: "pointer", color: "var(--danger)" }}>
                    Eliminar
                  </button>
                </form>
              </div>
            </li>
          );
        })}
        {data.clients.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Sin clientes todavía.</p>
        )}
      </ul>

      {data.nextCursor && (
        <a
          href={`/${orgId}/clientes?cursor=${encodeURIComponent(data.nextCursor)}${healthFilter ? `&health=${healthFilter}` : ""}`}
          style={{ color: "var(--accent-2)", fontSize: "13px", textDecoration: "none" }}
        >
          Siguiente página →
        </a>
      )}
    </main>
  );
}
