// La conversación completa de la persona: el dueño con Improvement, un empleado con el agente de su
// rol. Solo la suya. La burbuja muestra las últimas; aquí está todo y se puede seguir.
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { ask, listMessages } from "@/server/conversation/agent.ts";

const HORA = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" });

// Fuera del componente: una Server Action solo puede cerrar sobre valores serializables.
async function preguntar(formData: FormData) {
  "use server";
  const actor = await getSessionUserId();
  if (!actor) notFound();
  const orgId = formData.get("org")?.toString() ?? "";
  const r = await ask(actor, orgId, formData.get("text")?.toString() ?? "");
  redirect(r.ok ? `/${orgId}/conversacion` : `/${orgId}/conversacion?error=${encodeURIComponent(r.error.message)}`);
}

export default async function Conversacion({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const who = me.role === "owner" ? "Improvement" : "Tu agente";
  const messages = await listMessages(me.userId, orgId, 200);
  return (
    <main className="config-page">
      <h1 className="config-title">Conversar con {who}</h1>
      <p className="config-hint">Esta conversación es solo tuya.</p>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <ol className="bubble-messages bubble-page">
        {messages.map((m) => (
          <li key={m.id} className={m.role === "persona" ? "bubble-me" : "bubble-them"}>
            <span className="config-hint">{m.role === "persona" ? "Tú" : who} · {HORA.format(m.createdAt)}</span>
            <p>{m.body}</p>
          </li>
        ))}
        {messages.length === 0 && <li className="config-hint">Pregunta lo que necesites: qué sigue, cómo hacer algo, qué preparar.</li>}
      </ol>
      <form action={preguntar} className="config-form config-form-stack config-card">
        <input type="hidden" name="org" value={orgId} />
        <label className="permiso-field">
          <span>Tu pregunta</span>
          <textarea name="text" rows={3} maxLength={2000} required className="config-input" />
        </label>
        <button type="submit" className="panel-cta">Preguntar</button>
      </form>
    </main>
  );
}
