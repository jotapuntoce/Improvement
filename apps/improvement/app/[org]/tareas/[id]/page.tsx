// El espacio de trabajo de una tarea: a la izquierda los pasos de la persona, a la derecha lo que
// Improvement prepara o ya hizo. Solo quien tiene la tarea la mueve; el dueño la ve.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { ACTION_LABELS } from "@/server/tasks/actions.ts";
import { planTask } from "@/server/tasks/copilot.ts";
import { closeTask, discardTask, getTask } from "@/server/tasks/inbox.ts";
import { addStep, approveStep, completeStep, rejectStep } from "@/server/tasks/steps.ts";

const ESTADO: Record<string, string> = { pendiente: "Pendiente", propuesto: "Esperando tu visto bueno", hecho: "Hecho", rechazado: "No se hizo" };
type Outcome = { ok: true } | { ok: false; error: { message: string } };

// Fuera del componente: una Server Action solo puede cerrar sobre valores serializables, no sobre
// funciones del render.
/** Corre la acción como quien está en sesión y vuelve, con el error si lo hubo. */
async function act(pagina: string, fn: (actor: string) => Promise<Outcome>, next = pagina) {
  const actor = await getSessionUserId();
  if (!actor) notFound();
  const r = await fn(actor);
  if (!r.ok) redirect(`${pagina}?error=${encodeURIComponent(r.error.message)}`);
  revalidatePath(pagina);
  redirect(next);
}
const field = (f: FormData, k: string) => f.get(k)?.toString() ?? "";

export default async function Tarea({ params, searchParams }: { params: Promise<{ org: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId, id } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const t = await getTask(me.userId, orgId, id);
  if (!t.ok) notFound();
  const task = t.data;
  const mine = task.assigneeId === me.userId && task.status === "abierta";
  const persona = task.steps.filter((s) => s.kind === "persona");
  const ia = task.steps.filter((s) => s.kind === "improvement");
  const pagina = `/${orgId}/tareas/${id}`;
  const bandeja = `/${orgId}/tareas`;


  async function listo(f: FormData) {
    "use server";
    await act(pagina, (a) => completeStep(a, orgId, field(f, "step"), field(f, "result")));
  }
  async function agregar(f: FormData) {
    "use server";
    await act(pagina, (a) => addStep(a, orgId, id, { title: field(f, "title") }));
  }
  async function hazlo(f: FormData) {
    "use server";
    await act(pagina, (a) => approveStep(a, orgId, field(f, "step")));
  }
  async function no(f: FormData) {
    "use server";
    await act(pagina, (a) => rejectStep(a, orgId, field(f, "step")));
  }
  async function preparar() {
    "use server";
    await act(pagina, (a) => planTask(a, orgId, id));
  }
  async function cerrar(f: FormData) {
    "use server";
    await act(pagina, (a) => closeTask(a, orgId, id, field(f, "evidence") || undefined), bandeja);
  }
  async function descartar() {
    "use server";
    await act(pagina, (a) => discardTask(a, orgId, id), bandeja);
  }

  const pideEvidencia = task.objective && task.objective.evidenceType !== "ninguna";
  return (
    <main className="config-page">
      <p className="config-hint"><Link href={bandeja}>Volver a tu bandeja</Link></p>
      <h1 className="config-title">{task.title}</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <div className="task-workspace">
        <section className="config-card" aria-labelledby="pasos">
          {task.record && <p>Sobre <Link href={task.record.href}>{task.record.title}</Link> ({task.record.appName})</p>}
          {task.objective && <p>Objetivo: {task.objective.title}</p>}
          {task.notes && <p className="config-hint">{task.notes}</p>}
          <h2 id="pasos" className="config-card-title">Pasos</h2>
          <ol className="task-steps">
            {persona.map((s) => (
              <li key={s.id}>
                <span>{s.title}</span>
                {s.status === "hecho" ? (
                  <span className="config-hint">Listo{s.result ? ` — ${s.result}` : ""}</span>
                ) : (
                  mine && (
                    <form action={listo} className="task-inline">
                      <input type="hidden" name="step" value={s.id} />
                      <input name="result" maxLength={2000} placeholder="¿Qué quedó?" aria-label={`Qué quedó: ${s.title}`} className="config-input" />
                      <button type="submit" className="panel-btn-ghost">Listo</button>
                    </form>
                  )
                )}
              </li>
            ))}
            {persona.length === 0 && <li className="config-hint">Sin pasos todavía.</li>}
          </ol>
          {mine && (
            <form action={agregar} className="task-inline" aria-label="Agregar paso">
              <input name="title" required maxLength={160} aria-label="Paso nuevo" className="config-input" />
              <button type="submit" className="panel-btn-ghost">Agregar paso</button>
            </form>
          )}
        </section>
        <aside className="config-card" aria-label="Improvement">
          <h2 className="config-card-title">Improvement</h2>
          {mine && !ia.some((s) => s.status === "propuesto") && (
            <form action={preparar}>
              <button type="submit" className="panel-cta">Que Improvement lo prepare</button>
            </form>
          )}
          <ol className="task-steps">
            {ia.map((s) => (
              <li key={s.id}>
                <span>{s.title}</span>
                <span className="config-hint">{s.action ? `${ACTION_LABELS[s.action]} · ` : ""}{ESTADO[s.status]}</span>
                {s.status === "propuesto" && mine && (
                  <span className="task-inline">
                    <form action={hazlo}>
                      <input type="hidden" name="step" value={s.id} />
                      <button type="submit" className="panel-cta">Hazlo</button>
                    </form>
                    <form action={no}>
                      <input type="hidden" name="step" value={s.id} />
                      <button type="submit" className="panel-btn-ghost">No</button>
                    </form>
                  </span>
                )}
                {s.status === "hecho" && s.action === "borrador_mensaje" && s.result && (
                  <textarea readOnly rows={4} defaultValue={s.result} aria-label={`Borrador: ${s.title}`} className="config-input" />
                )}
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {mine && (
        <div className="task-inline">
          <form action={cerrar} className="task-inline">
            {pideEvidencia && <input name="evidence" required maxLength={2000} aria-label="Evidencia" placeholder="Evidencia" className="config-input" />}
            <button type="submit" className="panel-cta">Cerrar tarea</button>
          </form>
          <form action={descartar}>
            <button type="submit" className="panel-btn-ghost">Descartar</button>
          </form>
        </div>
      )}
    </main>
  );
}
