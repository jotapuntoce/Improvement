// La junta semanal L10. Sin `id`: la lista de juntas y "Nueva junta". Con `id`: la agenda de siete
// bloques con el actual marcado, lo que toca en ese bloque y los formularios para llevarla.
// Un solo dispositivo maneja la pantalla: todo el estado vive en la base, sin tiempo real.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import {
  addMeetingTodo,
  advanceBlock,
  closeMeeting,
  createMeeting,
  listMeetings,
  loadMeetingView,
  rateMeeting,
  saveBlockNotes,
  startMeeting,
} from "@/server/direccion/meetings/meetings.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

const WHEN = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(back: string, result: { ok: true } | { ok: false; error: { message: string } }, next = back): never {
  if (!result.ok) {
    const sep = back.includes("?") ? "&" : "?";
    redirect(`${back}${sep}error=${encodeURIComponent(result.error.message)}`);
  }
  revalidatePath(back.split("?")[0] ?? back);
  redirect(next);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

export default async function JuntaPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { id, error } = await searchParams;

  const { membership } = await requireSection(orgId, "junta");
  const userId = membership.userId;
  const base = `/${orgId}/direccion/junta`;

  if (!id) {
    const meetings = await listMeetings(userId, orgId);

    async function nueva(formData: FormData) {
      "use server";
      const actor = await getSessionUserId();
      if (!actor) notFound();
      const result = await createMeeting(actor, orgId, { scheduledFor: field(formData, "scheduledFor") });
      finish(base, result, result.ok ? `${base}?id=${result.data.id}` : base);
    }

    return (
      <main className="config-page">
        <h1 className="config-title">Junta semanal</h1>
        {error && <p className="invite-error">{error}</p>}

        <ul className="equipo-list">
          {meetings.map((m) => (
            <li key={m.id} className="config-card">
              <Link href={`${base}?id=${m.id}`}>{WHEN.format(m.scheduledFor)}</Link>
              <p className="config-hint">
                {m.endedAt ? `Terminada · Promedio ${m.averageRating?.toFixed(1) ?? "—"}` : m.startedAt ? "En curso" : "Por empezar"}
              </p>
            </li>
          ))}
          {meetings.length === 0 && <p className="config-hint">Todavía no hay juntas.</p>}
        </ul>

        <form action={nueva} className="config-card" aria-label="Nueva junta">
          <h2 className="config-card-title">Nueva junta</h2>
          <label className="permiso-field">
            <span>Fecha y hora</span>
            <input name="scheduledFor" type="datetime-local" required className="config-input" />
          </label>
          <div className="permiso-actions">
            <button type="submit" className="panel-cta">
              Crear junta
            </button>
          </div>
        </form>

        <Link href={`/${orgId}/objetivos`}>← Volver a objetivos</Link>
      </main>
    );
  }

  const view = await loadMeetingView(userId, orgId, id);
  if (!view) notFound();
  const teammates = await listTeammates(userId, orgId);
  const { meeting } = view;
  const pagina = `${base}?id=${meeting.id}`;
  const current = view.agenda.find((b) => b.block === meeting.currentBlock);
  const notes = (meeting.notes ?? {}) as Record<string, string>;
  // Quien califica: el equipo visible más la propia persona (aunque no tenga la sección Equipo).
  const people = new Map<string, string>([[userId, "Yo"]]);
  for (const t of teammates) if (t.userId !== userId) people.set(t.userId, t.fullName ?? t.email);

  async function iniciar() {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await startMeeting(actor, orgId, id ?? ""));
  }

  async function siguiente() {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await advanceBlock(actor, orgId, id ?? ""));
  }

  async function guardarNotas(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await saveBlockNotes(actor, orgId, id ?? "", field(formData, "block"), field(formData, "text")));
  }

  async function pendiente(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await addMeetingTodo(actor, orgId, id ?? "", {
        title: field(formData, "title"),
        assignedEmployeeId: field(formData, "assignedEmployeeId") || null,
        dueDate: field(formData, "dueDate"),
        impactWeight: field(formData, "impactWeight"),
        issueId: field(formData, "issueId") || null,
      }),
    );
  }

  async function calificar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await rateMeeting(actor, orgId, id ?? "", field(formData, "profileId"), field(formData, "rating")));
  }

  async function cerrar() {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await closeMeeting(actor, orgId, id ?? ""));
  }

  const ended = Boolean(meeting.endedAt);

  return (
    <main className="config-page">
      <h1 className="config-title">Junta del {WHEN.format(meeting.scheduledFor)}</h1>
      {error && <p className="invite-error">{error}</p>}

      <nav aria-label="Agenda de la junta" className="config-card">
        <ol>
          {view.agenda.map((b) => (
            <li key={b.block} aria-current={b.block === meeting.currentBlock ? "step" : undefined}>
              {b.label} · {b.minutes} min
            </li>
          ))}
        </ol>
      </nav>

      {ended && <p className="config-card-title">Promedio {view.averageRating?.toFixed(1) ?? "—"}</p>}

      {!meeting.startedAt && (
        <form action={iniciar} className="permiso-actions">
          <button type="submit" className="panel-cta">
            Iniciar junta
          </button>
        </form>
      )}

      {current && !ended && (
        <section aria-labelledby="bloque-actual" className="config-card">
          <h2 id="bloque-actual" className="config-card-title">
            {current.label}
          </h2>

          {current.block === "scorecard" && (
            <ul>
              {view.scorecard.rows.map((r) => {
                const cell = r.values[view.scorecard.currentWeek];
                return (
                  <li key={r.id}>
                    {r.title}: {cell ? `${cell.value} · ${cell.onTrack ? "En meta" : "Fuera de meta"}` : "sin capturar"}
                  </li>
                );
              })}
            </ul>
          )}
          {current.block === "rocks" && (
            <ul>
              {view.rocks.map((o) => (
                <li key={o.id}>{o.title}</li>
              ))}
            </ul>
          )}
          {current.block === "todos" && (
            <ul>
              {view.todos.map((o) => (
                <li key={o.id}>{o.title}</li>
              ))}
            </ul>
          )}
          {current.block === "ids" && (
            <ul>
              {view.issues.map((i) => (
                <li key={i.id}>{i.title}</li>
              ))}
            </ul>
          )}

          <form action={guardarNotas} className="config-form">
            <input type="hidden" name="block" value={current.block} />
            <label className="permiso-field">
              <span>Notas de {current.label}</span>
              <textarea name="text" rows={3} maxLength={4000} className="config-input" defaultValue={notes[current.block] ?? ""} />
            </label>
            <button type="submit" className="panel-btn-ghost">
              Guardar notas
            </button>
          </form>

          {current.block !== "conclude" && (
            <form action={siguiente} className="permiso-actions">
              <button type="submit" className="panel-cta">
                Siguiente bloque
              </button>
            </form>
          )}
        </section>
      )}

      {meeting.startedAt && !ended && (
        <>
          <form action={pendiente} className="config-card" aria-label="Pendiente nuevo">
            <h2 className="config-card-title">Pendiente nuevo</h2>
            <label className="permiso-field">
              <span>Título del pendiente</span>
              <input name="title" required minLength={3} className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Quién lo hace</span>
              <select name="assignedEmployeeId" className="config-input" defaultValue="">
                <option value="">Sin responsable</option>
                {[...people].map(([pid, name]) => (
                  <option key={pid} value={pid}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="permiso-field">
              <span>Issue de origen</span>
              <select name="issueId" className="config-input" defaultValue="">
                <option value="">Ninguno</option>
                {view.issues.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
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
            <button type="submit" className="panel-btn-ghost">
              Crear pendiente
            </button>
          </form>

          <form action={calificar} className="config-card" aria-label="Calificar la junta">
            <h2 className="config-card-title">Calificar</h2>
            <label className="permiso-field">
              <span>Persona</span>
              <select name="profileId" className="config-input" defaultValue={userId}>
                {[...people].map(([pid, name]) => (
                  <option key={pid} value={pid}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="permiso-field">
              <span>Calificación (1-10)</span>
              <input name="rating" type="number" min={1} max={10} required className="config-input" />
            </label>
            <button type="submit" className="panel-btn-ghost">
              Calificar
            </button>
            {view.ratings.length > 0 && (
              <ul>
                {view.ratings.map((r) => (
                  <li key={r.profileId}>
                    {r.name}: {r.rating}
                  </li>
                ))}
              </ul>
            )}
          </form>

          {meeting.currentBlock === "conclude" && (
            <form action={cerrar} className="permiso-actions">
              <button type="submit" className="panel-cta">
                Cerrar junta
              </button>
            </form>
          )}
        </>
      )}

      <Link href={base}>← Todas las juntas</Link>
    </main>
  );
}
