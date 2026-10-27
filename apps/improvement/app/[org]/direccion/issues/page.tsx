// Issues: el flujo IDS en tres columnas — Identificar (abierta), Discutir (en_progreso), Resolver
// (resuelta). Cada issue es una fila de org_need; lo derivado a Summum no aparece aquí.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import {
  ISSUE_TRANSITIONS,
  createIssue,
  createTodoFromIssue,
  listIssues,
  moveIssue,
  setIssueOwner,
  setIssuePriority,
} from "@/server/direccion/issues/issues.ts";
import { SEVERITY_LABEL } from "@/server/needs/mutations.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

const COLUMNS = [
  { status: "abierta", title: "Identificar" },
  { status: "en_progreso", title: "Discutir" },
  { status: "resuelta", title: "Resolver" },
] as const;

/** El texto del botón para pasar de un estado a otro (ISSUE_TRANSITIONS decide cuáles hay). */
const MOVE_LABEL: Record<string, string> = {
  en_progreso: "Pasar a discutir",
  resuelta: "Marcar resuelto",
  abierta: "Volver a identificar",
};

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const { membership } = await requireSection(orgId, "issues");
  const userId = membership.userId;
  const view = await listIssues(userId, orgId);
  const teammates = view.canManage || view.canCreate ? await listTeammates(userId, orgId) : [];
  const pagina = `/${orgId}/direccion/issues`;

  async function mover(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await moveIssue(actor, orgId, field(formData, "issueId"), field(formData, "to")));
  }

  async function asignar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await setIssueOwner(actor, orgId, field(formData, "issueId"), field(formData, "ownerProfileId") || null));
  }

  async function priorizar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await setIssuePriority(actor, orgId, field(formData, "issueId"), field(formData, "onList") === "1"));
  }

  async function crear(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await createIssue(actor, orgId, {
        title: field(formData, "title"),
        detail: field(formData, "detail") || null,
        areaId: null,
        severity: field(formData, "severity") || "2",
        ownerProfileId: field(formData, "ownerProfileId") || null,
      }),
    );
  }

  async function pendiente(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await createTodoFromIssue(actor, orgId, field(formData, "issueId"), {
        title: field(formData, "title"),
        assignedEmployeeId: field(formData, "assignedEmployeeId") || null,
        dueDate: field(formData, "dueDate"),
        impactWeight: field(formData, "impactWeight"),
      }),
    );
  }

  const people = teammates.map((t) => ({ id: t.userId, name: t.fullName ?? t.email }));

  return (
    <main className="config-page">
      <h1 className="config-title">Issues</h1>
      {error && <p className="invite-error">{error}</p>}

      {COLUMNS.map((col) => {
        const issues = view.issues.filter((i) => i.status === col.status);
        const headingId = `issues-${col.status}`;
        return (
          <section key={col.status} aria-labelledby={headingId}>
            <h2 id={headingId} className="config-card-title">
              {col.title}
            </h2>
            {issues.length === 0 && <p className="config-hint">Nada aquí.</p>}
            <ul className="equipo-list">
              {issues.map((issue) => (
                <li key={issue.id} className="config-card">
                  <p className="objetivo-title">{issue.title}</p>
                  <p className="config-hint">
                    Severidad {SEVERITY_LABEL[issue.severity] ?? issue.severity} · {issue.areaName ?? "Sin área"} ·{" "}
                    {issue.ownerName ?? "Sin responsable"}
                    {issue.onPriorityList && " · En la lista de la semana"}
                  </p>

                  <div className="permiso-actions">
                    {(ISSUE_TRANSITIONS[issue.status] ?? []).map((to) => (
                      <form key={to} action={mover}>
                        <input type="hidden" name="issueId" value={issue.id} />
                        <input type="hidden" name="to" value={to} />
                        <button type="submit" className="panel-btn-ghost">
                          {MOVE_LABEL[to]}
                        </button>
                      </form>
                    ))}

                    {view.canManage && (
                      <form action={priorizar}>
                        <input type="hidden" name="issueId" value={issue.id} />
                        <input type="hidden" name="onList" value={issue.onPriorityList ? "0" : "1"} />
                        <button type="submit" className="panel-btn-ghost">
                          {issue.onPriorityList ? "Quitar de la lista" : "Agregar a la lista de la semana"}
                        </button>
                      </form>
                    )}
                  </div>

                  {view.canManage && (
                    <form action={asignar} className="config-form" aria-label={`Responsable de ${issue.title}`}>
                      <input type="hidden" name="issueId" value={issue.id} />
                      <label className="permiso-field">
                        <span>Responsable</span>
                        <select name="ownerProfileId" className="config-input" defaultValue={issue.ownerProfileId ?? ""}>
                          <option value="">Sin responsable</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="panel-btn-ghost">
                        Asignar
                      </button>
                    </form>
                  )}

                  {view.canCreate && (
                    <form action={pendiente} className="config-form" aria-label={`Pendiente nuevo para ${issue.title}`}>
                      <input type="hidden" name="issueId" value={issue.id} />
                      <label className="permiso-field">
                        <span>Título del pendiente</span>
                        <input name="title" required minLength={3} className="config-input" />
                      </label>
                      <label className="permiso-field">
                        <span>Quién lo hace</span>
                        <select name="assignedEmployeeId" className="config-input" defaultValue="">
                          <option value="">Sin responsable</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="permiso-field">
                        <span>Fecha</span>
                        <input name="dueDate" type="date" required className="config-input" />
                      </label>
                      <label className="permiso-field">
                        <span>Peso (0-100)</span>
                        <input name="impactWeight" type="number" min={0} max={100} defaultValue={10} required className="config-input" />
                      </label>
                      <button type="submit" className="panel-cta">
                        Pendiente nuevo
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {view.canCreate && (
        <form action={crear} className="config-card" aria-label="Nuevo issue">
          <h2 className="config-card-title">Nuevo issue</h2>
          <label className="permiso-field">
            <span>Qué está estorbando</span>
            <input name="title" required minLength={3} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Detalle</span>
            <textarea name="detail" rows={2} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Qué tan grave</span>
            <select name="severity" className="config-input" defaultValue="2">
              <option value="1">Leve</option>
              <option value="2">Moderada</option>
              <option value="3">Crítica</option>
            </select>
          </label>
          <label className="permiso-field">
            <span>Responsable</span>
            <select name="ownerProfileId" className="config-input" defaultValue="">
              <option value="">Sin responsable</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="permiso-actions">
            <button type="submit" className="panel-cta">
              Crear issue
            </button>
          </div>
        </form>
      )}

      <Link href={`/${orgId}/objetivos`}>← Volver a objetivos</Link>
    </main>
  );
}
