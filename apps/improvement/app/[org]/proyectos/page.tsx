// Proyectos/obra: la autorización del dueño, el responsable y el avance por etapas de cada proyecto.
// El avance de un proyecto con etapas lo calcula server/erp/projects.ts (ponderado por peso).
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import {
  addStage,
  authorizeProject,
  loadProjectBoard,
  removeStage,
  setProjectOwner,
  updateStage,
} from "@/server/erp/projects.ts";
import { STATUS_LABEL, type ProjectStatus } from "@/server/projects/mutations.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

const AUTHORIZATION_LABEL: Record<string, string> = {
  pendiente: "Por autorizar",
  autorizado: "Autorizado",
  rechazado: "Rechazado",
};

const STAGE_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  terminada: "Terminada",
};

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

export default async function ProyectosPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const { membership } = await requireSection(orgId, "proyectos");
  const userId = membership.userId;
  const board = await loadProjectBoard(userId, orgId);
  const teammates = board.canManage ? await listTeammates(userId, orgId) : [];
  const pagina = `/${orgId}/proyectos`;

  async function decidir(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await authorizeProject(actor, orgId, field(formData, "projectId"), field(formData, "decision")));
  }

  async function asignar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await setProjectOwner(actor, orgId, field(formData, "projectId"), field(formData, "ownerProfileId") || null));
  }

  async function nuevaEtapa(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await addStage(actor, orgId, field(formData, "projectId"), {
        name: field(formData, "name"),
        weight: field(formData, "weight") || "1",
      }),
    );
  }

  async function moverEtapa(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await updateStage(actor, orgId, field(formData, "stageId"), {
        progress: field(formData, "progress"),
        status: field(formData, "status"),
      }),
    );
  }

  async function quitarEtapa(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await removeStage(actor, orgId, field(formData, "stageId")));
  }

  const people = teammates.map((t) => ({ id: t.userId, name: t.fullName ?? t.email }));

  return (
    <main className="config-page">
      <h1 className="config-title">Proyectos</h1>
      {error && <p className="invite-error">{error}</p>}
      {board.projects.length === 0 && <p className="config-hint">Todavía no hay proyectos.</p>}

      <ul className="equipo-list">
        {board.projects.map((p) => (
          <li key={p.id} className="config-card">
            <h2 className="config-card-title">{p.name}</h2>
            <p className="config-hint">
              {p.clientName ?? "Sin cliente"} · {STATUS_LABEL[p.status as ProjectStatus] ?? p.status} ·{" "}
              {AUTHORIZATION_LABEL[p.authorizationStatus] ?? p.authorizationStatus} · {p.ownerName ?? "Sin responsable"}
            </p>
            <progress max={100} value={p.progress} aria-label={`Avance de ${p.name}`} />
            <p className="config-hint">Avance {p.progress}%</p>

            {board.canManage && p.authorizationStatus === "pendiente" && (
              <div className="permiso-actions">
                <form action={decidir}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <input type="hidden" name="decision" value="autorizado" />
                  <button type="submit" className="panel-cta">
                    Autorizar
                  </button>
                </form>
                <form action={decidir}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <input type="hidden" name="decision" value="rechazado" />
                  <button type="submit" className="panel-btn-ghost">
                    Rechazar
                  </button>
                </form>
              </div>
            )}

            {board.canManage && (
              <form action={asignar} className="config-form" aria-label={`Responsable de ${p.name}`}>
                <input type="hidden" name="projectId" value={p.id} />
                <label className="permiso-field">
                  <span>Responsable</span>
                  <select name="ownerProfileId" className="config-input" defaultValue={p.ownerProfileId ?? ""}>
                    <option value="">Sin responsable</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="panel-btn-ghost">
                  Asignar
                </button>
              </form>
            )}

            {p.stages.length > 0 && (
              <table className="config-table">
                <caption className="config-table-caption">Etapas de {p.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Etapa</th>
                    <th scope="col">Peso</th>
                    <th scope="col">Avance</th>
                    <th scope="col">Estado</th>
                    {board.canManage && <th scope="col">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {p.stages.map((s) => (
                    <tr key={s.id}>
                      <th scope="row">{s.name}</th>
                      <td>{s.weight}</td>
                      <td>{s.progress}%</td>
                      <td>{STAGE_LABEL[s.status] ?? s.status}</td>
                      {board.canManage && (
                        <td>
                          <form action={moverEtapa} className="permiso-actions">
                            <input type="hidden" name="stageId" value={s.id} />
                            <input
                              name="progress"
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={s.progress}
                              required
                              className="config-input"
                              aria-label={`Avance de ${s.name}`}
                            />
                            <select
                              name="status"
                              className="config-input"
                              defaultValue={s.status}
                              aria-label={`Estado de ${s.name}`}
                            >
                              {Object.entries(STAGE_LABEL).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="panel-btn-ghost">
                              Guardar
                            </button>
                          </form>
                          <form action={quitarEtapa}>
                            <input type="hidden" name="stageId" value={s.id} />
                            <button type="submit" className="panel-btn-ghost" aria-label={`Quitar ${s.name}`}>
                              Quitar
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {board.canManage && (
              <form action={nuevaEtapa} className="config-form" aria-label={`Nueva etapa de ${p.name}`}>
                <input type="hidden" name="projectId" value={p.id} />
                <label className="permiso-field">
                  <span>Nueva etapa</span>
                  <input name="name" required minLength={2} maxLength={120} className="config-input" />
                </label>
                <label className="permiso-field">
                  <span>Peso (1-100)</span>
                  <input name="weight" type="number" min={1} max={100} defaultValue={1} required className="config-input" />
                </label>
                <button type="submit" className="panel-cta">
                  Agregar etapa
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
