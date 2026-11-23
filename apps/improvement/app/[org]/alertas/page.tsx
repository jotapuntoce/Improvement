// Todas las alertas de quien las ve: la regla en texto llano, "Explícame" (Improvement redacta el
// porqué y qué hacer) y, para el dueño, "Pedir ayuda a Summum" cuando no se arregla desde adentro.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { alertToSummum, explainAlert, listAlerts } from "@/server/insights/alerts.ts";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

// Fuera del componente: una Server Action solo puede cerrar sobre valores serializables.
async function explicar(formData: FormData) {
  "use server";
  const actor = await getSessionUserId();
  if (!actor) notFound();
  const orgId = formData.get("org")?.toString() ?? "";
  const r = await explainAlert(actor, orgId, formData.get("key")?.toString() ?? "");
  redirect(r.ok ? `/${orgId}/alertas` : `/${orgId}/alertas?error=${encodeURIComponent(r.error.message)}`);
}
async function aSummum(formData: FormData) {
  "use server";
  const actor = await getSessionUserId();
  if (!actor) notFound();
  const orgId = formData.get("org")?.toString() ?? "";
  const note = formData.get("note")?.toString().trim() || null;
  const r = await alertToSummum(actor, orgId, formData.get("key")?.toString() ?? "", note);
  redirect(r.ok ? `/${orgId}/alertas?aviso=${encodeURIComponent("Se la pasamos a Summum.")}` : `/${orgId}/alertas?error=${encodeURIComponent(r.error.message)}`);
}

export default async function Alertas({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string; aviso?: string }> }) {
  const { org: orgId } = await params;
  const { error, aviso } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const alerts = await listAlerts(me.userId, orgId);
  if (!alerts.ok) notFound();
  const owner = me.role === "owner";
  return (
    <main className="config-page">
      <h1 className="config-title">Alertas</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      {aviso && <p className="config-hint" role="status">{aviso}</p>}
      <ul className="equipo-list" role="list">
        {alerts.data.map((a) => (
          <li key={a.key} className="config-card dash-card">
            <h2 className="config-card-title"><Link href={a.href}>{a.title}</Link></h2>
            <p>{a.detail}{a.amountCents ? ` En juego: ${MXN.format(a.amountCents / 100)}.` : ""}</p>
            {a.explained ? (
              <p className="dash-explained">{a.explained}</p>
            ) : (
              <form action={explicar}>
                <input type="hidden" name="org" value={orgId} />
                <input type="hidden" name="key" value={a.key} />
                <button type="submit" className="panel-btn-ghost" aria-label={`Explícame: ${a.title}`}>Explícame</button>
              </form>
            )}
            {owner && (
              <form action={aSummum} className="task-inline" aria-label={`Pedir ayuda a Summum: ${a.title}`}>
                <input type="hidden" name="org" value={orgId} />
                <input type="hidden" name="key" value={a.key} />
                <input name="note" maxLength={2000} placeholder="Qué necesitas (opcional)" aria-label={`Qué necesitas: ${a.title}`} className="config-input" />
                <button type="submit" className="panel-btn-ghost">Pedir ayuda a Summum</button>
              </form>
            )}
          </li>
        ))}
        {alerts.data.length === 0 && <li className="config-hint">Nada se está cayendo.</li>}
      </ul>
    </main>
  );
}
