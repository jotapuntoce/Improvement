// Pipeline de ventas como tablero (lenguaje Flozzy): una columna por etapa con conteo y monto, tarjetas
// compactas y la tasa de cierre arriba. Lo ve quien tenga la sección `clientes`; crear y mover lo valida
// el server (server/crm/deals.ts, sin cambios): dueño o `clientes: empresa`.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { createDeal, listPipeline, moveDeal } from "@/server/crm/deals.ts";
import { pipelineSummary } from "@/server/crm/pipeline.ts";
import { listClients } from "@/server/clients/mutations.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

const STAGE_LABEL: Record<string, string> = {
  prospecto: "Prospecto",
  propuesta: "Propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const { membership, scope } = await requireSection(orgId, "clientes");
  const userId = membership.userId;
  const canWrite = scope === "empresa";
  const [pipeline, teammates, clients] = await Promise.all([
    listPipeline(userId, orgId),
    listTeammates(userId, orgId),
    canWrite ? listClients(userId, orgId, { limit: 100 }).then((r) => r.data.clients) : Promise.resolve([]),
  ]);
  const nombres = new Map(teammates.map((t) => [t.userId, t.fullName]));
  const resumen = pipelineSummary(pipeline.flatMap((g) => g.deals.map((d) => ({ stage: g.stage, amountCents: d.amountCents }))));
  const pagina = `/${orgId}/clientes/pipeline`;

  async function nuevo(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const pesos = Number(field(formData, "amount") || "0");
    finish(
      pagina,
      await createDeal(actor, orgId, {
        clientId: field(formData, "clientId"),
        title: field(formData, "title"),
        amountCents: Math.round(pesos * 100),
        ownerProfileId: null,
      }),
    );
  }

  async function mover(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await moveDeal(actor, orgId, field(formData, "dealId"), field(formData, "stage")));
  }

  return (
    <main className="config-page" style={{ maxWidth: "80rem" }}>
      <h1 className="config-title">Pipeline de ventas</h1>
      <p className="config-hint">
        <a href={`/${orgId}/clientes`}>Volver a clientes</a>
      </p>
      {error && <p className="invite-error">{error}</p>}

      <section className="config-card" aria-label="Resumen del pipeline">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {resumen.stages.map((s) => (
            <div key={s.stage}>
              <dt className="config-hint">{STAGE_LABEL[s.stage] ?? s.stage}</dt>
              <dd className="config-amount m-0">
                {s.count} · {MXN.format(s.amountCents / 100)}
              </dd>
            </div>
          ))}
          <div>
            <dt className="config-hint">Tasa de cierre</dt>
            <dd className="config-amount m-0">{resumen.winRate === null ? "—" : `${Math.round(resumen.winRate * 100)}%`}</dd>
          </div>
        </dl>
      </section>

      {canWrite && (
        <form action={nuevo} className="config-form config-card" aria-label="Nuevo trato">
          <h2 className="config-card-title">Nuevo trato</h2>
          <label className="permiso-field">
            <span>Cliente</span>
            <select name="clientId" required className="config-input" defaultValue="">
              <option value="" disabled>
                Elige un cliente
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="permiso-field">
            <span>Título</span>
            <input name="title" required minLength={3} maxLength={160} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Monto (MXN)</span>
            <input name="amount" type="number" min={0} step="0.01" defaultValue={0} className="config-input" />
          </label>
          <button type="submit" className="panel-cta">
            Abrir trato
          </button>
        </form>
      )}

      {/* Una columna por etapa; en móvil se apilan. */}
      <div className="grid gap-3 md:grid-cols-5">
        {pipeline.map((group) => {
          const total = group.deals.reduce((s, d) => s + d.amountCents, 0);
          return (
            <section key={group.stage} className="config-card" aria-labelledby={`etapa-${group.stage}`}>
              <h2 id={`etapa-${group.stage}`} className="config-card-title">
                {STAGE_LABEL[group.stage] ?? group.stage}
              </h2>
              <p className="config-hint config-amount m-0">
                {group.deals.length} · {MXN.format(total / 100)}
              </p>
              {group.deals.length === 0 && <p className="config-hint">Sin tratos.</p>}
              <ul className="equipo-list">
                {group.deals.map((d) => (
                  <li key={d.id} className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                    <p className="m-0 font-semibold">{d.title}</p>
                    <p className="m-0">
                      <a href={`/${orgId}/clientes/${d.clientId}`}>{d.clientName}</a>
                    </p>
                    <p className="config-amount m-0">{MXN.format(d.amountCents / 100)}</p>
                    <p className="config-hint m-0">
                      {d.ownerProfileId ? (nombres.get(d.ownerProfileId) ?? "Con responsable") : "Sin responsable"}
                    </p>
                    {canWrite && (
                      <form action={mover} className="permiso-actions">
                        <input type="hidden" name="dealId" value={d.id} />
                        <select name="stage" defaultValue={group.stage} className="config-input" aria-label={`Etapa de ${d.title}`}>
                          {Object.entries(STAGE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="panel-btn-ghost">
                          Mover
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
