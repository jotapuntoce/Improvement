// Una automatización: la regla en frases, probarla con los registros de hoy, activarla o pausarla, y
// lo que ha hecho.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { describe as describeAction } from "@/server/automations/engine.ts";
import { describeCondition, describeTrigger, getRule, setRuleStatus, testRule } from "@/server/automations/rules.ts";

const ESTADO: Record<string, string> = { prueba: "En prueba", activa: "Activa", pausada: "Pausada" };
const RESULTADO: Record<string, string> = { hecho: "Hecho", prueba: "Prueba", error: "Error", tope: "Detenida" };
const fecha = (d: Date) => d.toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Automatizacion({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ probar?: string; error?: string }>;
}) {
  const { org: orgId, id } = await params;
  const { probar, error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  if (me.role !== "owner") notFound();
  const r = await getRule(me.userId, orgId, id);
  if (!r.ok) notFound();
  const rule = r.data;
  const prueba = probar ? await testRule(me.userId, orgId, id) : null;
  const pagina = `/${orgId}/automatizaciones/${id}`;

  async function cambiar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const res = await setRuleStatus(actor, orgId, id, formData.get("status")?.toString());
    if (!res.ok) redirect(`${pagina}?error=${encodeURIComponent(res.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  return (
    <main className="config-page">
      <p className="config-hint"><Link href={`/${orgId}/automatizaciones`}>Volver a automatizaciones</Link></p>
      <h1 className="config-title">{rule.name}</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <section className="config-card" aria-labelledby="regla">
        <h2 id="regla" className="config-card-title">{ESTADO[rule.status]}</h2>
        <p>{describeTrigger(rule.trigger)} en {rule.appKey}</p>
        {rule.conditions.length > 0 && <p>Y si {rule.conditions.map(describeCondition).join(" y ")}</p>}
        <p>Entonces: {rule.actions.map(describeAction).join("; ")}</p>
        <div className="task-inline">
          <Link href={`${pagina}?probar=1`} className="panel-btn-ghost">Probar con lo que ya tengo</Link>
          {rule.status !== "activa" && (
            <form action={cambiar}><input type="hidden" name="status" value="activa" /><button type="submit" className="panel-cta">Activar</button></form>
          )}
          {rule.status !== "pausada" && (
            <form action={cambiar}><input type="hidden" name="status" value="pausada" /><button type="submit" className="panel-btn-ghost">Pausar</button></form>
          )}
        </div>
      </section>
      {prueba && (
        <section className="config-card" aria-labelledby="coincidencias">
          <h2 id="coincidencias" className="config-card-title">Hoy cumplen las condiciones</h2>
          <ul className="equipo-list">
            {prueba.ok && prueba.data.matches.map((m) => (
              <li key={m.id}><Link href={`/${orgId}/a/${rule.appKey}/${m.id}`}>{m.title}</Link></li>
            ))}
            {(!prueba.ok || prueba.data.matches.length === 0) && <li className="config-hint">Ningún registro las cumple ahora.</li>}
          </ul>
        </section>
      )}
      <section className="config-card" aria-labelledby="corridas">
        <h2 id="corridas" className="config-card-title">Lo que ha hecho</h2>
        <table className="view-table">
          <thead>
            <tr><th scope="col">Fecha</th><th scope="col">Registro</th><th scope="col">Resultado</th><th scope="col">Detalle</th></tr>
          </thead>
          <tbody>
            {rule.runs.map((run) => (
              <tr key={run.id}>
                <td>{fecha(run.createdAt)}</td>
                <td><Link href={`/${orgId}/a/${rule.appKey}/${run.recordId}`}>Ver registro</Link></td>
                <td>{RESULTADO[run.outcome]}</td>
                <td>{run.detail}</td>
              </tr>
            ))}
            {rule.runs.length === 0 && (
              <tr><td colSpan={4} className="config-hint">Aún no corre.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
