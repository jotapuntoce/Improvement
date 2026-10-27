// Ficha del cliente: su hiperpersonalización (server/crm/preferences.ts), la sugerencia de atención
// de la IA (server/crm/attention.ts) y sus tratos. Cliente de otro org → 404.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { listClients } from "@/server/clients/mutations.ts";
import { HIPER_QUESTIONS, getClientPreference, saveClientPreference } from "@/server/crm/preferences.ts";
import { latestAttention, suggestAttention } from "@/server/crm/attention.ts";
import { listPipeline } from "@/server/crm/deals.ts";

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

// ponytail: recorre las páginas de listClients (sin getter por id en server/clients); un getClient si pesa.
async function findClient(userId: string, orgId: string, clientId: string) {
  let cursor: string | null = null;
  do {
    const { data } = await listClients(userId, orgId, { cursor, limit: 100 });
    const hit = data.clients.find((c) => c.id === clientId);
    if (hit) return hit;
    cursor = data.nextCursor;
  } while (cursor);
  return null;
}

export default async function FichaClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; clienteId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId, clienteId } = await params;
  const { error } = await searchParams;

  const { membership, scope } = await requireSection(orgId, "clientes");
  const userId = membership.userId;
  const cliente = await findClient(userId, orgId, clienteId);
  if (!cliente) notFound();

  const [preference, attention, pipeline] = await Promise.all([
    getClientPreference(userId, orgId, clienteId),
    latestAttention(userId, orgId, clienteId),
    listPipeline(userId, orgId),
  ]);
  const answers = (preference?.answers ?? {}) as Record<string, string>;
  const deals = pipeline.flatMap((g) => g.deals.filter((d) => d.clientId === clienteId).map((d) => ({ ...d, stage: g.stage })));
  const canWrite = scope === "empresa";
  const pagina = `/${orgId}/clientes/${clienteId}`;

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
    <main className="config-page">
      <h1 className="config-title">{cliente.name}</h1>
      <p className="config-hint">
        <a href={`/${orgId}/clientes`}>Volver a clientes</a> · <a href={`/${orgId}/clientes/pipeline`}>Pipeline de ventas</a>
      </p>
      {error && <p className="invite-error">{error}</p>}
      {preference?.unmetFlaggedAt && (
        <p className="invite-error" role="alert">
          Expectativa en riesgo: {preference.unmetNote}
        </p>
      )}

      <form action={guardar} className="config-form config-card" aria-label="Hiperpersonalización">
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

      <section className="config-card" aria-labelledby="tratos">
        <h2 id="tratos" className="config-card-title">
          Tratos
        </h2>
        {deals.length === 0 && <p className="config-hint">Sin tratos.</p>}
        <ul className="equipo-list">
          {deals.map((d) => (
            <li key={d.id}>
              {d.title} · {STAGE_LABEL[d.stage] ?? d.stage} · {MXN.format(d.amountCents / 100)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
