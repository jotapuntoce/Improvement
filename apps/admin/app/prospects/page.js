// Backlog de prospectos, agrupado por cliente (la persona) -> empresas (una o más). Caso real que
// forzó este modelo: Jaime Salinas es dueño de dos empresas, Camibel y Afianza — antes de este cambio
// prospectCompany no tenía forma de expresar "estas dos filas son la misma persona".
// Flujo por empresa: prospecto -> en_construcción -> live. Mover a en_construcción dispara
// provisionOrganizationAction (idempotente por persona real, ver actions.js), que también manda la
// invitación de WhatsApp la primera vez que se crea la cuenta del cliente.
import Link from "next/link";
import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { prospectClient, prospectCompany } from "@jotapuntoce/db/schema";
import { whatsappConfigured } from "../../lib/whatsapp.js";
import {
  createProspectClientAction,
  addProspectCompanyAction,
  markProspectLiveAction,
  provisionOrganizationAction,
} from "./actions.js";

const STATUS_LABEL = {
  prospecto: "Prospecto",
  "en_construcción": "En construcción",
  live: "Live",
};

export default async function ProspectsPage() {
  await requirePlatformAdmin();

  const [clients, companies] = await Promise.all([
    db.select().from(prospectClient).orderBy(asc(prospectClient.createdAt)),
    db.select().from(prospectCompany).orderBy(asc(prospectCompany.priority)),
  ]);

  const companiesByClient = new Map();
  for (const company of companies) {
    const list = companiesByClient.get(company.prospectClientId) ?? [];
    list.push(company);
    companiesByClient.set(company.prospectClientId, list);
  }

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div>
          <Link href="/" className="page-back-link">
            ← Dashboard
          </Link>
          <h2>Backlog de prospectos</h2>
          <p className="topbar-subtitle">Cliente → empresa(s) → prospecto → en construcción → live.</p>
        </div>
      </section>

      {!whatsappConfigured() && (
        <p className="empty-hint" style={{ color: "var(--danger)" }}>
          ⚠ WhatsApp (Twilio) no está configurado — agrega TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y
          TWILIO_WHATSAPP_FROM en .env.local para que la invitación se envíe de verdad. Por ahora
          &ldquo;Provisionar&rdquo; sigue creando la cuenta y la organización, solo no manda el WhatsApp.
        </p>
      )}

      <form action={createProspectClientAction} className="product-card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ fontWeight: 600, margin: 0 }}>+ Nuevo cliente</p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input className="input" name="fullName" placeholder="Nombre del cliente (ej. Jaime Salinas)" required style={{ flex: 1, minWidth: "200px" }} />
          <input className="input" name="email" type="email" placeholder="Email del cliente" required style={{ flex: 1, minWidth: "200px" }} />
          <input className="input" name="whatsappPhone" type="tel" placeholder="WhatsApp (+52...)" required style={{ minWidth: "160px" }} />
          <input className="input" name="companyCount" type="number" min="1" defaultValue="1" placeholder="Cuántas empresas tiene" style={{ maxWidth: "170px" }} />
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input className="input" name="companyName" placeholder="Nombre de la primera empresa (ej. Camibel)" required style={{ flex: 1, minWidth: "200px" }} />
          <input className="input" name="industry" placeholder="Giro de la empresa" style={{ flex: 1, minWidth: "160px" }} />
          <input className="input" name="priority" type="number" placeholder="Prioridad" style={{ maxWidth: "120px" }} />
        </div>
        <input className="input" name="notes" placeholder="Notas (opcional)" />
        <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
          + Agregar cliente
        </button>
      </form>

      {clients.length === 0 ? (
        <p className="empty-hint">Sin clientes todavía.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
          {clients.map((client) => {
            const clientCompanies = companiesByClient.get(client.id) ?? [];

            async function addCompany(formData) {
              "use server";
              formData.set("prospectClientId", client.id);
              await addProspectCompanyAction(formData);
              revalidatePath("/prospects");
            }

            return (
              <li key={client.id} className="product-card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: "16px" }}>{client.fullName}</p>
                    <p className="product-desc" style={{ margin: "4px 0 0" }}>
                      {client.email} · {client.whatsappPhone}
                    </p>
                  </div>
                  <span className="category-chip" style={{ "--chip-color": "var(--accent-1)" }}>
                    {clientCompanies.length} de {client.companyCount} empresa(s)
                  </span>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {clientCompanies.map((prospect) => {
                    async function provision() {
                      "use server";
                      await provisionOrganizationAction(prospect.id);
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
                        style={{
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <p style={{ fontWeight: 600, margin: 0 }}>
                            {prospect.name}
                            {prospect.industry && (
                              <span className="product-desc" style={{ fontWeight: 400 }}> · {prospect.industry}</span>
                            )}
                          </p>
                          {prospect.notes && <p className="product-desc" style={{ margin: "4px 0 0" }}>{prospect.notes}</p>}
                          <span className="category-chip" style={{ "--chip-color": "var(--accent-2)", marginTop: "6px" }}>
                            {STATUS_LABEL[prospect.status] ?? prospect.status}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          {prospect.status === "prospecto" && (
                            <form action={provision}>
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
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <form action={addCompany} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <input className="input" name="name" placeholder="Nombre de otra empresa (ej. Afianza)" required style={{ flex: 1, minWidth: "160px" }} />
                  <input className="input" name="industry" placeholder="Giro" style={{ minWidth: "140px" }} />
                  <input className="input" name="priority" type="number" placeholder="Prioridad" style={{ maxWidth: "110px" }} />
                  <button type="submit" className="btn btn-ghost">
                    + Agregar empresa
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
