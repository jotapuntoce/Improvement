// CRM — lista cursor-paginada con filtro por health_status, ahora con el contexto comercial que
// el Director General ya sabía leer y ninguna pantalla enseñaba: etapa, valor, silencio y riesgo.
//
// Sin ningún "use client": los forms nativos con Server Action ya funcionan sin JS (crear, cambiar
// health_status, eliminar, registrar contacto, mover etapa), así que no hay hoja interactiva que
// envolver — a diferencia de /[org]/objetivos y /[org]/powerups.
//
// La paginación por cursor se queda tal cual. El contexto no obligó a cambiar el loader: listClients
// hace `.select()` sin columnas, así que las filas YA traen deal_stage, last_contact_at y compañía —
// y `motivosDeRiesgo` es una función pura que se puede llamar aquí sobre esas mismas filas. Enseñar
// el riesgo no costó ni una consulta más.
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireOrgMembership, requireSection } from "@/server/auth/guard";
import { loadAreaBoard } from "@/server/areas/loadAreaBoard";
import {
  createClient as createClientRow,
  deleteClient,
  listClients,
  updateClient,
  type HealthStatus,
} from "@/server/clients/mutations";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  motivosDeRiesgo,
  registerContact,
  RISK_FACTORS,
  RISK_FACTOR_LABEL,
  updateClientContext,
  type DealStage,
} from "@/server/crm/client-extensions";

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Saludable",
  neutral: "Neutral",
  at_risk: "En riesgo",
};

const HEALTH_OPTIONS: HealthStatus[] = ["healthy", "neutral", "at_risk"];

function isHealthStatus(value: string | undefined): value is HealthStatus {
  return value === "healthy" || value === "neutral" || value === "at_risk";
}

function isDealStage(value: string | null): value is DealStage {
  return DEAL_STAGES.includes(value as DealStage);
}

/** Una fecha como la lee una persona. `null` cuando nunca se registró — no se inventa un "hoy". */
function fecha(d: Date | null): string | null {
  return d ? d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : null;
}

function dinero(v: string | null): string | null {
  if (v === null) return null;
  return Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
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
  const { membership: memberRow } = await requireSection(orgId, "clientes");
  const isOwner = memberRow.role === "owner";

  const healthFilter = isHealthStatus(health) ? health : undefined;
  const [{ data }, areas] = await Promise.all([
    listClients(memberRow.userId, orgId, { cursor: cursor ?? null, healthStatus: healthFilter }),
    loadAreaBoard(memberRow.userId, orgId),
  ]);

  // El nombre del área se resuelve contra el tablero que ya se cargó para el desplegable, en vez
  // de con un join nuevo en el loader: son cinco o seis áreas, no una tabla que valga una consulta.
  const areaPorId = new Map(areas.map((a) => [a.id, a.name]));

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

  const clientesEnRiesgo = data.clients.filter((c) => motivosDeRiesgo(c).length > 0);

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

      {/* El aviso cuenta solo lo de esta página, y lo dice: con paginación por cursor, prometer
          "toda la cartera" sería mentir a partir de la segunda página. */}
      {clientesEnRiesgo.length > 0 && (
        <p className="config-hint">
          {clientesEnRiesgo.length} de estas cuentas necesitan que alguien haga algo:{" "}
          {clientesEnRiesgo.map((c) => c.name).join(", ")}.
        </p>
      )}

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
        <a href={`/${orgId}/clientes`} style={{ color: healthFilter ? "var(--text-secondary)" : "var(--accent-2)" }}>
          Todos
        </a>
        {HEALTH_OPTIONS.map((h) => (
          <a
            key={h}
            href={`/${orgId}/clientes?health=${h}`}
            style={{ color: healthFilter === h ? "var(--accent-2)" : "var(--text-secondary)" }}
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

          // Registrar un contacto es de cualquiera del equipo: quien habló con el cliente es quien
          // sabe qué se dijo, y obligarlo a pedírselo al dueño garantiza que no se capture.
          async function contactar(formData: FormData) {
            "use server";
            const row = await requireOrgMembership(orgId);
            const seguimiento = formData.get("nextFollowUpAt")?.toString();
            await registerContact(row.userId, orgId, c.id, {
              note: formData.get("note")?.toString().trim() ?? "",
              nextFollowUpAt: seguimiento ? new Date(seguimiento) : null,
            });
            revalidatePath(`/${orgId}/clientes`);
          }

          // Mover la etapa o el valor sí es del dueño: es una decisión comercial, no el registro
          // de una llamada. El servidor lo vuelve a verificar — esto solo evita ofrecer el form.
          async function contexto(formData: FormData) {
            "use server";
            const row = await requireOrgMembership(orgId);
            const valor = formData.get("dealValue")?.toString();
            await updateClientContext(row.userId, orgId, c.id, {
              areaId: formData.get("areaId")?.toString() || null,
              dealStage: formData.get("dealStage")?.toString(),
              dealValue: valor === "" || valor === undefined ? null : Number(valor),
              riskFactors: formData.getAll("riskFactors").map((v) => v.toString()),
            });
            revalidatePath(`/${orgId}/clientes`);
          }

          const motivos = motivosDeRiesgo(c);
          const etapa = isDealStage(c.dealStage) ? DEAL_STAGE_LABEL[c.dealStage] : null;
          const valor = dinero(c.dealValue);
          const ultimo = fecha(c.lastContactAt);
          const proximo = fecha(c.nextFollowUpAt);
          const areaNombre = c.areaId ? areaPorId.get(c.areaId) : null;

          return (
            <li
              key={c.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "16px",
                borderRadius: "var(--radius-md, 16px)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p style={{ fontWeight: 600, margin: 0 }}>{c.name}</p>
                  <p className="config-hint" style={{ margin: "4px 0 0" }}>
                    {etapa ?? "Sin etapa"}
                    {valor && ` · ${valor}`}
                    {areaNombre && ` · ${areaNombre}`}
                    {ultimo ? ` · último contacto ${ultimo}` : " · nunca contactado"}
                    {proximo && ` · seguimiento ${proximo}`}
                  </p>
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
              </div>

              {motivos.length > 0 && (
                <p className="invite-error" role="status" style={{ margin: 0 }}>
                  {motivos.join(" · ")}
                </p>
              )}

              {c.notes && (
                <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0, whiteSpace: "pre-wrap" }}>
                  {c.notes}
                </p>
              )}

              <details>
                <summary className="config-hint">Registrar un contacto</summary>
                <form action={contactar} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                  <input
                    name="note"
                    placeholder="Qué se habló"
                    required
                    style={{ ...inputStyle, flex: 1, minWidth: "180px" }}
                  />
                  <label className="config-hint" htmlFor={`seg-${c.id}`}>
                    Siguiente seguimiento
                  </label>
                  <input id={`seg-${c.id}`} type="date" name="nextFollowUpAt" style={inputStyle} />
                  <button type="submit" style={{ ...inputStyle, cursor: "pointer" }}>
                    Guardar
                  </button>
                </form>
              </details>

              {isOwner && (
                <details>
                  <summary className="config-hint">Contexto comercial</summary>
                  <form action={contexto} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                    <select name="dealStage" defaultValue={c.dealStage ?? "prospecto"} style={inputStyle}>
                      {DEAL_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {DEAL_STAGE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      name="dealValue"
                      min={0}
                      step="0.01"
                      placeholder="Valor del trato"
                      defaultValue={c.dealValue ?? ""}
                      style={inputStyle}
                    />
                    <select name="areaId" defaultValue={c.areaId ?? ""} style={inputStyle}>
                      <option value="">Sin área responsable</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <label className="config-hint" htmlFor={`rf-${c.id}`}>
                      Qué preocupa (ctrl+clic para varios)
                    </label>
                    <select
                      id={`rf-${c.id}`}
                      name="riskFactors"
                      multiple
                      defaultValue={Array.isArray(c.riskFactors) ? (c.riskFactors as string[]) : []}
                      style={inputStyle}
                    >
                      {RISK_FACTORS.map((f) => (
                        <option key={f} value={f}>
                          {RISK_FACTOR_LABEL[f]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" style={{ ...inputStyle, cursor: "pointer" }}>
                      Guardar
                    </button>
                  </form>
                </details>
              )}
            </li>
          );
        })}
        {data.clients.length === 0 && (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Sin clientes todavía.</p>
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

      <Link href={`/empresas/${orgId}`}>← Volver a la recepción</Link>
    </main>
  );
}
