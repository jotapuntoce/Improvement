// Mi trabajo: todo lo que esta persona tiene que hacer, en una sola lista.
//
// Nació siendo solo el otro lado de la delegación de Improvement, y esa sigue siendo su primera
// sección — pero un empleado no vive en tres pantallas. Sus objetivos estaban en /[org]/objetivos
// mezclados con los de todos, y sus subtareas de proyecto no estaban en ningún lado. Aquí están
// las tres cosas, en el orden en que le importan: lo que alguien espera que conteste, lo que se
// comprometió a entregar, y lo que cuelga de un proyecto.
//
// Una pantalla y no tres: "¿qué tengo que hacer?" es una pregunta, y contestarla con tres listas
// que hay que sumar mentalmente es no contestarla.
//
// Lo que sigue sin verse aquí: el ciclo de Improvement, la observación, la inferencia. El dueño ve
// el razonamiento completo en /[org]/improvement; aquí solo llega el trabajo — decisión de diseño
// #1 del plan, y la misma razón por la que un empleado no puede leer el nivel de responsabilidad de
// otro (no negociable #4): el razonamiento del Director General sobre un área habla de la gente de
// esa área.
//
// Sin guard de sección: no es una sección de las que el dueño enciende y apaga
// (server/permissions/sections.ts). Tu trabajo es tuyo y lo ves siempre — los tres loaders
// resuelven la tenencia adentro y filtran por tu id, así que quien no pertenece a la empresa
// recibe 404 y quien pertenece solo ve lo suyo.
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/server/auth/guard";
import {
  completeDelegatedTask,
  DELEGATED_STATUS_LABEL,
  listMyDelegatedTasks,
  respondToTask,
  type DelegatedStatus,
} from "@/server/improvement/delegation";
import { listMyObjectives } from "@/server/objectives/mutations";
import {
  listMyProjectTasks,
  moveProjectTask,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  type TaskStatus,
} from "@/server/erp/projects";
import { TaskActions, type TaskAction } from "./TaskActions.tsx";

/** Qué estado deja cada acción. El mismo mapa que la ruta API — las dos entradas al mismo
 *  recorrido no pueden discrepar, y por eso las dos lo escriben igual de corto. */
const ESTADO = {
  aceptar: "aceptada",
  rechazar: "rechazada",
  empezar: "en_progreso",
} as const;

/** Una fecha como la lee una persona, y si ya pasó lo dice en palabras y no solo en color. */
function cuando(d: Date | null): string | null {
  if (!d) return null;
  const texto = d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  return d.getTime() < Date.now() ? `${texto} · ya venció` : texto;
}

export default async function TrabajoPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;

  const userId = await getSessionUserId();
  if (!userId) notFound();

  const pagina = `/${orgId}/tareas`;
  const [tareas, objetivos, subtareas] = await Promise.all([
    listMyDelegatedTasks(userId, orgId, false),
    listMyObjectives(userId, orgId),
    listMyProjectTasks(userId, orgId),
  ]);

  async function actuar(taskId: string, action: TaskAction, note: string): Promise<string | null> {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) return "Tu sesión expiró.";

    const r =
      action === "completar"
        ? await completeDelegatedTask(actor, orgId, taskId, { feedback: note || undefined })
        : await respondToTask(actor, orgId, taskId, { status: ESTADO[action], note: note || undefined });

    if (!r.ok) return r.error.message;
    revalidatePath(pagina);
    return null;
  }

  async function moverSubtarea(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) return;
    const taskId = formData.get("taskId")?.toString() ?? "";
    const status = formData.get("status")?.toString() ?? "";
    await moveProjectTask(actor, orgId, taskId, status as TaskStatus);
    revalidatePath(pagina);
  }

  const abiertas = tareas.filter((t) => t.status !== "completada" && t.status !== "rechazada");
  const cerradas = tareas.filter((t) => t.status === "completada" || t.status === "rechazada");
  const nadaPendiente = abiertas.length === 0 && objetivos.length === 0 && subtareas.length === 0;

  return (
    <main className="config-page">
      <h1 className="config-title">Mi trabajo</h1>
      <p className="config-hint">
        Todo lo que te toca a ti: lo que Improvement te propuso, tus objetivos y tus subtareas de
        proyecto.
      </p>

      {nadaPendiente && (
        <div className="config-card">
          <p className="config-hint">Ahora mismo no tienes nada pendiente.</p>
        </div>
      )}

      {abiertas.length > 0 && (
        <>
          <h2 className="config-card-title">Improvement te propuso ({abiertas.length})</h2>
          <p className="config-hint">
            No son objetivos: son propuestas. Si te toca, la tomas; si no, dilo y se va con quien sí.
          </p>
          <ul className="equipo-list">
            {abiertas.map((t) => (
              <li key={t.id} className="config-card">
                <p className="config-hint">
                  {DELEGATED_STATUS_LABEL[t.status as DelegatedStatus] ?? t.status}
                  {t.areaName && ` · ${t.areaName}`}
                </p>
                <p className="objetivo-title">{t.title}</p>
                {t.description && <p>{t.description}</p>}
                {t.expectedOutcome && <p className="config-hint">Para qué: {t.expectedOutcome}</p>}
                <TaskActions
                  status={t.status}
                  onAction={async (action, note) => {
                    "use server";
                    return actuar(t.id, action, note);
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {objetivos.length > 0 && (
        <>
          <h2 className="config-card-title">Tus objetivos ({objetivos.length})</h2>
          <ul className="equipo-list">
            {objetivos.map((o) => (
              <li key={o.id} className="config-card">
                <p className="objetivo-title">{o.title}</p>
                <p className="config-hint">
                  {cuando(o.dueDate) ?? "Sin fecha"} · {o.impactWeight} de peso
                </p>
                {o.description && <p>{o.description}</p>}
              </li>
            ))}
          </ul>
          {/* La entrega de un objetivo tiene su propio recorrido (evidencia, revisión), así que
              desde aquí se manda allá en vez de duplicarlo con menos validación. */}
          <Link href={`/${orgId}/objetivos`} className="panel-btn-ghost">
            Entregar un objetivo →
          </Link>
        </>
      )}

      {subtareas.length > 0 && (
        <>
          <h2 className="config-card-title">Tus subtareas de proyecto ({subtareas.length})</h2>
          <ul className="equipo-list">
            {subtareas.map((t) => (
              <li key={t.id} className="config-card">
                <p className="objetivo-title">{t.title}</p>
                <p className="config-hint">
                  {t.projectName} · {TASK_STATUS_LABEL[t.status]}
                  {cuando(t.dueAt) && ` · ${cuando(t.dueAt)}`}
                </p>
                <form action={moverSubtarea} className="permiso-actions">
                  <input type="hidden" name="taskId" value={t.id} />
                  <select name="status" defaultValue={t.status} className="config-input">
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {TASK_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="panel-btn-ghost">
                    Mover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}

      {cerradas.length > 0 && (
        <>
          <h2 className="config-card-title">Ya cerradas</h2>
          <ul className="equipo-list">
            {cerradas.map((t) => (
              <li key={t.id} className="config-card">
                <p className="config-hint">
                  {DELEGATED_STATUS_LABEL[t.status as DelegatedStatus] ?? t.status}
                  {t.areaName && ` · ${t.areaName}`}
                </p>
                <p className="equipo-name">{t.title}</p>
                {t.ownerReview && <p className="config-hint">Tu jefe dijo: {t.ownerReview}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      <Link href={`/empresas/${orgId}`}>← Volver a la recepción</Link>
    </main>
  );
}
