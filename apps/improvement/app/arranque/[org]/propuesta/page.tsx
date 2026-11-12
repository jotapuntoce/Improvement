// Arranque, paso 3 de 4: la propuesta. Las apps sugeridas para su giro, que el dueño elige y renombra
// antes de crear nada.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { finishOnboarding, loadArmado, loadProposal } from "@/server/registro/onboarding.ts";
import { loadAnalysis } from "@/server/owner/diagnostico.ts";
import { ARRANQUE_FORM } from "@/components/arranque/armadoDatos.ts";
import { Pregunta } from "@/components/arranque/Pregunta.tsx";
import { ArranqueShell } from "../../ArranqueShell.tsx";

export default async function ArranquePropuesta({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const [proposal, armado, analisis] = await Promise.all([loadProposal(me.userId, orgId), loadArmado(me.userId, orgId), loadAnalysis(me.userId, orgId)]);
  if (!proposal.ok || !armado.ok) notFound();
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
    redirect(`/arranque/${orgId}/importar`);
  }

  return (
    <ArranqueShell paso={3} armado={armado.data}>
      <form id={ARRANQUE_FORM} action={armar} className="arr-ask" aria-label="Propuesta de aplicaciones">
        <Pregunta why="Lo armé con lo que me contaste: tus pasos, tu proceso y tu giro. Ya traes Clientes, Ventas, Proyectos y Postventa; quita o renombra lo que quieras.">
          Para {armado.data.name} te armé esto.
        </Pregunta>
        {error && <p className="arr-error" role="alert">{error}</p>}
        {analisis && (
          <section className="arr-analisis" aria-label={analisis.resumen ? "Lo que veo de tu negocio" : "Lo que tu empresa necesita por dentro"}>
            <h2>{analisis.resumen ? "Lo que veo de tu negocio" : "Lo que tu empresa necesita por dentro"}</h2>
            {analisis.resumen && <p>{analisis.resumen}</p>}
            {analisis.necesidades.length > 0 && (
              <ul aria-label="Lo que necesita tu negocio">
                {analisis.necesidades.map((n) => <li key={n.title} className={n.severity === 3 ? "is-3" : undefined}>{n.title}</li>)}
              </ul>
            )}
          </section>
        )}
        {apps.map((app, i) => (
          <fieldset key={app.name} className="arr-app">
            <legend className="sr-only">{app.name}</legend>
            <input type="checkbox" name="pick" value={i} defaultChecked aria-label={`Quiero ${app.name}`} />
            <div className="arr-app-body">
              <input name={`name-${i}`} defaultValue={app.name} maxLength={40} className="arr-app-name" aria-label={`Nombre de ${app.name}`} />
              {app.fields.length > 0 && <p className="arr-app-fields">{app.fields.map((f) => f.label).join(", ")}</p>}
              <ul className="arr-stages" aria-label="Etapas">
                {app.stages.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          </fieldset>
        ))}
        <div className="arr-row">
          <Link href={`/arranque/${orgId}/resultado`} className="arr-ghost">← Atrás</Link>
          <button type="submit" className="arr-primary">Así me gusta, ármalo</button>
        </div>
      </form>
    </ArranqueShell>
  );
}
