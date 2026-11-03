// Qué falta en tu proceso: lo que la plantilla de tu giro trae y tú todavía no. "Agregar" lo crea;
// "Pedir ayuda a Summum" lo deriva. Solo el dueño; a un empleado le responde 404.
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { applyGap, gapToSummum, processGaps } from "@/server/insights/gaps.ts";

// Fuera del componente: una Server Action solo puede cerrar sobre valores serializables.
async function agregar(formData: FormData) {
  "use server";
  const actor = await getSessionUserId();
  if (!actor) notFound();
  const orgId = formData.get("org")?.toString() ?? "";
  const r = await applyGap(actor, orgId, formData.get("gap")?.toString() ?? "");
  redirect(r.ok ? `/${orgId}/proceso?aviso=${encodeURIComponent("Listo, ya está en tu Improvement.")}` : `/${orgId}/proceso?error=${encodeURIComponent(r.error.message)}`);
}
async function aSummum(formData: FormData) {
  "use server";
  const actor = await getSessionUserId();
  if (!actor) notFound();
  const orgId = formData.get("org")?.toString() ?? "";
  const note = formData.get("note")?.toString().trim() || null;
  const r = await gapToSummum(actor, orgId, formData.get("gap")?.toString() ?? "", note);
  redirect(r.ok ? `/${orgId}/proceso?aviso=${encodeURIComponent("Se lo pasamos a Summum.")}` : `/${orgId}/proceso?error=${encodeURIComponent(r.error.message)}`);
}

export default async function Proceso({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string; aviso?: string }> }) {
  const { org: orgId } = await params;
  const { error, aviso } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const gaps = await processGaps(me.userId, orgId);
  if (!gaps.ok) notFound();
  return (
    <main className="config-page">
      <h1 className="config-title">Qué falta en tu proceso</h1>
      <p className="config-hint">Comparado con lo que suele usar un negocio de tu giro.</p>
      {error && <p className="invite-error" role="alert">{error}</p>}
      {aviso && <p className="config-hint" role="status">{aviso}</p>}
      <ul className="equipo-list" role="list">
        {gaps.data.map((g) => (
          <li key={g.id} className="config-card dash-card">
            <h2 className="config-card-title">{g.title}</h2>
            <form action={agregar}>
              <input type="hidden" name="org" value={orgId} />
              <input type="hidden" name="gap" value={g.id} />
              <button type="submit" className="panel-cta" aria-label={`Agregar: ${g.title}`}>Agregar</button>
            </form>
            <form action={aSummum} className="task-inline" aria-label={`Pedir ayuda a Summum: ${g.title}`}>
              <input type="hidden" name="org" value={orgId} />
              <input type="hidden" name="gap" value={g.id} />
              <input name="note" maxLength={2000} placeholder="Qué necesitas (opcional)" aria-label={`Qué necesitas: ${g.title}`} className="config-input" />
              <button type="submit" className="panel-btn-ghost">Pedir ayuda a Summum</button>
            </form>
          </li>
        ))}
        {gaps.data.length === 0 && <li className="config-hint">Tu proceso ya tiene todo lo que trae tu giro.</li>}
      </ul>
    </main>
  );
}
