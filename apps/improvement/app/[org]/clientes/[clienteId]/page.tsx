// Ficha 360 del cliente (lenguaje Flozzy, dos columnas): resumen y sugerencia de atención a la izquierda;
// pestañas Tratos, Órdenes, Tickets y Preferencias a la derecha (server/crm/client360.ts). Preferencias abre
// por defecto: la hiperpersonalización es lo primero que se mira. Cliente de otro org → 404.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { HIPER_QUESTIONS, saveClientPreference } from "@/server/crm/preferences.ts";
import { latestAttention, suggestAttention } from "@/server/crm/attention.ts";
import { loadClient360 } from "@/server/crm/client360.ts";

const STAGE_LABEL: Record<string, string> = {
  prospecto: "Prospecto",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};
const ORDER_LABEL: Record<string, string> = { borrador: "Borrador", confirmada: "Confirmada", entregada: "Entregada", cancelada: "Cancelada" };
const TICKET_LABEL: Record<string, string> = { abierto: "Abierto", en_proceso: "En proceso", resuelto: "Resuelto" };
const TABS = [
  { key: "tratos", label: "Tratos" },
  { key: "ordenes", label: "Órdenes" },
  { key: "tickets", label: "Tickets" },
  { key: "preferencias", label: "Preferencias" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

export default async function FichaClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; clienteId: string }>;
  searchParams: Promise<{ error?: string; tab?: string }>;
}) {
  const { org: orgId, clienteId } = await params;
  const { error, tab: tabParam } = await searchParams;

  const { membership, scope } = await requireSection(orgId, "clientes");
  const userId = membership.userId;
  const [ficha, attention] = await Promise.all([loadClient360(userId, orgId, clienteId), latestAttention(userId, orgId, clienteId)]);
  if (!ficha.ok) notFound();
  const { client: cliente, deals, saleOrders, tickets, preference } = ficha.data;
  const answers = (preference?.answers ?? {}) as Record<string, string>;
  const canWrite = scope === "empresa";
  const pagina = `/${orgId}/clientes/${clienteId}`;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "preferencias";

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const input = Object.fromEntries(HIPER_QUESTIONS.map((q) => [q.key, formData.get(q.key)?.toString() ?? ""]));
    finish(pagina, await saveClientPreference(actor, orgId, clienteId, input));
  }

  async function sugerir() {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await suggestAttention(actor, orgId, clienteId));
  }

  return (
    <main className="config-page" style={{ maxWidth: "72rem" }}>
      <h1 className="config-title">{cliente.name}</h1>
      <p className="config-hint">
        <Link href={`/${orgId}/clientes`}>Volver a clientes</Link> · <Link href={`/${orgId}/clientes/pipeline`}>Pipeline de ventas</Link>
      </p>
      {error && <p className="invite-error">{error}</p>}
      {preference?.unmetFlaggedAt && (
        <p className="invite-error" role="alert">
          Expectativa en riesgo: {preference.unmetNote}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-4">
          <section className="config-card" aria-label="Resumen del cliente">
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="config-hint">Tratos</dt>
                <dd className="config-amount m-0">{deals.length}</dd>
              </div>
              <div>
                <dt className="config-hint">Órdenes</dt>
                <dd className="config-amount m-0">{saleOrders.length}</dd>
              </div>
              <div>
                <dt className="config-hint">Tickets abiertos</dt>
                <dd className="config-amount m-0">{tickets.filter((t) => t.status !== "resuelto").length}</dd>
              </div>
            </dl>
          </section>

          <section className="config-card" aria-labelledby="atencion">
            <h2 id="atencion" className="config-card-title">
              Sugerencia de atención
            </h2>
            {attention ? <p>{attention.suggestionText}</p> : <p className="config-hint">Todavía no hay sugerencia.</p>}
            {canWrite && (
              <form action={sugerir}>
                <button type="submit" className="panel-btn-ghost">
                  Sugerir cómo atenderlo
                </button>
              </form>
            )}
          </section>
        </div>

        <div className="config-card">
          <div role="tablist" aria-label="Ficha del cliente" className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Link
                key={t.key}
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={t.key === tab}
                aria-controls={`panel-${t.key}`}
                href={`${pagina}?tab=${t.key}`}
                className={t.key === tab ? "panel-cta" : "panel-btn-ghost"}
              >
                {t.label}
              </Link>
            ))}
          </div>

          <section role="tabpanel" id="panel-tratos" aria-labelledby="tab-tratos" hidden={tab !== "tratos"}>
            {deals.length === 0 && <p className="config-hint">Sin tratos.</p>}
            <ul className="equipo-list">
              {deals.map((d) => (
                <li key={d.id}>
                  {d.title} · {STAGE_LABEL[d.stage] ?? d.stage} · <span className="config-amount">{MXN.format(d.amountCents / 100)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section role="tabpanel" id="panel-ordenes" aria-labelledby="tab-ordenes" hidden={tab !== "ordenes"}>
            {saleOrders.length === 0 && <p className="config-hint">Sin órdenes.</p>}
            <ul className="equipo-list">
              {saleOrders.map((o) => (
                <li key={o.id}>
                  Orden {o.number} · {ORDER_LABEL[o.status] ?? o.status} · <span className="config-amount">{MXN.format(o.totalCents / 100)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section role="tabpanel" id="panel-tickets" aria-labelledby="tab-tickets" hidden={tab !== "tickets"}>
            {tickets.length === 0 && <p className="config-hint">Sin tickets.</p>}
            <ul className="equipo-list">
              {tickets.map((t) => (
                <li key={t.id}>
                  {t.title} · {TICKET_LABEL[t.status] ?? t.status}
                </li>
              ))}
            </ul>
          </section>

          <section role="tabpanel" id="panel-preferencias" aria-labelledby="tab-preferencias" hidden={tab !== "preferencias"}>
            <form action={guardar} className="config-form" aria-label="Hiperpersonalización">
              <h2 className="config-card-title">Cómo quiere que lo atiendan</h2>
              {HIPER_QUESTIONS.map((q) => (
                <label key={q.key} className="permiso-field">
                  <span>{q.question}</span>
                  <textarea
                    name={q.key}
                    defaultValue={answers[q.key] ?? ""}
                    maxLength={1000}
                    rows={2}
                    readOnly={!canWrite}
                    className="config-input"
                  />
                </label>
              ))}
              {canWrite && (
                <button type="submit" className="panel-cta">
                  Guardar
                </button>
              )}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
