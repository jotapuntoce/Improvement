// Apuntar una tarea. El dueño puede asignarla a alguien de su equipo; si viene de una ficha, queda
// ligada a ese registro.
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { listTeammates } from "@/server/employees/teammates.ts";
import { createTask } from "@/server/tasks/inbox.ts";

export default async function NuevaTarea({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ app?: string; record?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { app, record, error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const team = me.role === "owner" ? await listTeammates(me.userId, orgId) : [];

  async function crear(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const field = (k: string) => formData.get(k)?.toString() ?? "";
    const r = await createTask(actor, orgId, {
      title: field("title"),
      notes: field("notes"),
      dueAt: field("dueAt"),
      assigneeId: field("assigneeId"),
      appKey: field("app"),
      recordId: field("record"),
    });
    if (!r.ok) {
      const back = new URLSearchParams({ error: r.error.message, ...(app && record ? { app, record } : {}) });
      redirect(`/${orgId}/tareas/nueva?${back}`);
    }
    redirect(`/${orgId}/tareas/${r.data.id}`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Apuntar una tarea</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form action={crear} className="config-form config-form-stack config-card" aria-label="Tarea nueva">
        {app && record && (
          <>
            <input type="hidden" name="app" value={app} />
            <input type="hidden" name="record" value={record} />
          </>
        )}
        <label className="permiso-field">
          <span>¿Qué hay que hacer?</span>
          <input name="title" required maxLength={160} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Notas</span>
          <textarea name="notes" rows={3} maxLength={2000} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Fecha</span>
          <input name="dueAt" type="date" className="config-input" />
        </label>
        {team.length > 0 && (
          <label className="permiso-field">
            <span>¿Para quién?</span>
            <select name="assigneeId" defaultValue={me.userId} className="config-input">
              {team.map((t) => (
                <option key={t.userId} value={t.userId}>{t.userId === me.userId ? "Para mí" : t.fullName ?? t.email}</option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="panel-cta">Apuntar</button>
      </form>
    </main>
  );
}
