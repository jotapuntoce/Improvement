// Arranque, paso 3 de 3: la propuesta. Las apps sugeridas para su giro, que el dueño elige y renombra
// antes de crear nada.
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { finishOnboarding, loadProposal } from "@/server/registro/onboarding.ts";

export default async function ArranquePropuesta({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const proposal = await loadProposal(me.userId, orgId);
  if (!proposal.ok) notFound();
  const { apps } = proposal.data;

  async function armar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const fresh = await loadProposal(actor, orgId);
    if (!fresh.ok) notFound();
    // Los índices y nombres vienen del formulario; las apps salen de la plantilla del servidor.
    const picks = formData
      .getAll("pick")
      .map((v) => Number(v))
      .filter((i) => Number.isInteger(i) && fresh.data.apps[i])
      .map((i) => ({ ...fresh.data.apps[i]!, name: formData.get(`name-${i}`)?.toString().trim().slice(0, 40) || fresh.data.apps[i]!.name }));
    const r = await finishOnboarding(actor, orgId, picks);
    if (!r.ok) redirect(`/arranque/${orgId}/propuesta?error=${encodeURIComponent(r.error.message)}`);
    redirect(`/${orgId}`);
  }

  return (
    <main className="config-page auth-page">
      <p className="config-hint">Paso 3 de 3</p>
      <h1 className="config-title">Así armamos tu Improvement</h1>
      <p className="config-hint">Ya traes Clientes, Ventas, Proyectos y Postventa. Para tu giro te sugerimos además:</p>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form action={armar} className="config-form config-form-stack" aria-label="Propuesta de aplicaciones">
        {apps.map((app, i) => (
          <fieldset key={app.name} className="config-card">
            <legend className="sr-only">{app.name}</legend>
            <label className="check-field">
              <input type="checkbox" name="pick" value={i} defaultChecked /> Quiero esta app
            </label>
            <label className="permiso-field">
              <span>Nombre</span>
              <input name={`name-${i}`} defaultValue={app.name} maxLength={40} className="config-input" />
            </label>
            <p className="config-hint">Etapas: {app.stages.join(" → ")}</p>
            {app.fields.length > 0 && <p className="config-hint">Campos: {app.fields.map((f) => f.label).join(", ")}</p>}
          </fieldset>
        ))}
        <button type="submit" className="panel-cta">Armar mi Improvement</button>
      </form>
    </main>
  );
}
