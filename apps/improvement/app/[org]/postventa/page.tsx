// Postventa: los tickets por estado (server/erp/tickets.ts). Se mueven con botones, nunca arrastrando;
// un ticket resuelto se califica del 1 al 5.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { listTickets, moveTicket, openTicket, rateTicket, type TicketStatus } from "@/server/erp/tickets.ts";
import { listClients } from "@/server/clients/mutations.ts";
import { loadProjectBoard } from "@/server/erp/projects.ts";

const COLUMNS: { status: TicketStatus; title: string; action: string }[] = [
  { status: "abierto", title: "Abiertos", action: "Reabrir" },
  { status: "en_proceso", title: "En proceso", action: "Pasar a en proceso" },
  { status: "resuelto", title: "Resueltos", action: "Resolver" },
];

const SEVERITY_LABEL: Record<number, string> = { 1: "Severidad baja", 2: "Severidad media", 3: "Severidad alta" };

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

export default async function PostventaPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const { membership, scope } = await requireSection(orgId, "postventa");
  const userId = membership.userId;
  const canWrite = scope === "empresa";
  const tickets = await listTickets(userId, orgId);
  const [clients, board] = canWrite
    ? await Promise.all([listClients(userId, orgId, { limit: 100 }), loadProjectBoard(userId, orgId)])
    : [null, null];
  const pagina = `/${orgId}/postventa`;

  async function nuevo(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await openTicket(actor, orgId, {
        clientId: field(formData, "clientId"),
        projectId: field(formData, "projectId") || null,
        title: field(formData, "title"),
        detail: field(formData, "detail") || null,
        severity: field(formData, "severity") || "2",
      }),
    );
  }

  async function mover(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await moveTicket(actor, orgId, field(formData, "ticketId"), field(formData, "status")));
  }

  async function calificar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await rateTicket(actor, orgId, field(formData, "ticketId"), field(formData, "satisfaction")));
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Postventa</h1>
      {error && <p className="invite-error">{error}</p>}

      {canWrite && (
        <form action={nuevo} className="config-form config-card" aria-label="Nuevo ticket">
          <h2 className="config-card-title">Nuevo ticket</h2>
          <label className="permiso-field">
            <span>Cliente</span>
            <select name="clientId" required className="config-input" defaultValue="">
              <option value="" disabled>
                Elige un cliente
              </option>
              {clients?.data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="permiso-field">
            <span>Proyecto (opcional)</span>
            <select name="projectId" className="config-input" defaultValue="">
              <option value="">Sin proyecto</option>
              {board?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="permiso-field">
            <span>Título</span>
            <input name="title" required minLength={3} maxLength={160} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Detalle</span>
            <textarea name="detail" maxLength={2000} rows={2} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Severidad</span>
            <select name="severity" defaultValue="2" className="config-input">
              {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="panel-cta">
            Abrir ticket
          </button>
        </form>
      )}

      {COLUMNS.map((col) => {
        const items = tickets.filter((t) => t.status === col.status);
        return (
          <section key={col.status} className="config-card" aria-labelledby={`col-${col.status}`}>
            <h2 id={`col-${col.status}`} className="config-card-title">
              {col.title}
            </h2>
            {items.length === 0 && <p className="config-hint">Sin tickets.</p>}
            <ul className="equipo-list">
              {items.map((t) => (
                <li key={t.id}>
                  <p>
                    <strong>{t.title}</strong> · {t.clientName} · {SEVERITY_LABEL[t.severity] ?? t.severity}
                    {t.satisfaction !== null && ` · Satisfacción ${t.satisfaction}/5`}
                  </p>
                  {canWrite && (
                    <div className="permiso-actions">
                      {COLUMNS.filter((target) => target.status !== t.status).map((target) => (
                        <form key={target.status} action={mover}>
                          <input type="hidden" name="ticketId" value={t.id} />
                          <input type="hidden" name="status" value={target.status} />
                          <button type="submit" className="panel-btn-ghost" aria-label={`${target.action}: ${t.title}`}>
                            {target.action}
                          </button>
                        </form>
                      ))}
                      {t.status === "resuelto" && (
                        <form action={calificar} className="permiso-actions">
                          <input type="hidden" name="ticketId" value={t.id} />
                          <select
                            name="satisfaction"
                            defaultValue={t.satisfaction ?? 5}
                            className="config-input"
                            aria-label={`Satisfacción de ${t.title}`}
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="panel-btn-ghost">
                            Calificar
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
