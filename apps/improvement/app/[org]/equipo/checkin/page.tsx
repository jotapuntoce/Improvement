// Check-in semanal y 1-a-1. Todo miembro hace su check-in; lo ve la persona y el dueño, nadie más.
// El dueño ve, por empleado, sus check-ins y registra sus 1-a-1.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { checkinsFor, myCheckins, myOneOnOnes, oneOnOnesFor, recordOneOnOne, submitCheckin } from "@/server/people/checkins.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

const MOODS = [
  { value: 1, label: "Muy mal" },
  { value: 2, label: "Mal" },
  { value: 3, label: "Regular" },
  { value: 4, label: "Bien" },
  { value: 5, label: "Muy bien" },
] as const;
const moodLabel = (mood: number) => MOODS.find((m) => m.value === mood)?.label ?? String(mood);

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const membership = await requireOrgMembership(orgId);
  const userId = membership.userId;
  const isOwner = membership.role === "owner";
  const pagina = `/${orgId}/equipo/checkin`;

  const [mine, myOnes, teammates] = await Promise.all([
    myCheckins(userId, orgId),
    myOneOnOnes(userId, orgId),
    isOwner ? listTeammates(userId, orgId) : [],
  ]);
  const team = await Promise.all(
    teammates
      .filter((t) => t.userId !== userId)
      .map(async (t) => {
        const [c, o] = await Promise.all([checkinsFor(userId, orgId, t.userId), oneOnOnesFor(userId, orgId, t.userId)]);
        return { ...t, name: t.fullName ?? t.email, checkins: c.ok ? c.data : [], ones: o.ok ? o.data : [] };
      }),
  );

  async function enviar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await submitCheckin(actor, orgId, { mood: field(formData, "mood"), note: field(formData, "note") || null }));
  }

  async function registrar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await recordOneOnOne(actor, orgId, {
        employeeId: field(formData, "employeeId"),
        heldOn: field(formData, "heldOn"),
        sharedNotes: field(formData, "sharedNotes"),
      }),
    );
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Check-in semanal</h1>
      {error && <p className="invite-error">{error}</p>}
      <p className="config-hint">Tu check-in lo ves tú y el dueño de la empresa. Nadie más.</p>

      <form action={enviar} className="config-card" aria-label="Tu check-in de esta semana">
        <fieldset className="permiso-field">
          <legend>¿Cómo te fue esta semana?</legend>
          {MOODS.map((m) => (
            <label key={m.value}>
              <input type="radio" name="mood" value={m.value} required /> {m.label}
            </label>
          ))}
        </fieldset>
        <label className="permiso-field">
          <span>Nota (opcional)</span>
          <textarea name="note" maxLength={500} rows={3} className="config-input" />
        </label>
        <button type="submit" className="panel-cta">
          Enviar check-in
        </button>
      </form>

      <section className="config-card" aria-labelledby="mis-checkins">
        <h2 id="mis-checkins" className="config-card-title">
          Tus últimos check-ins
        </h2>
        <ul className="equipo-list">
          {mine.map((c) => (
            <li key={c.id}>
              Semana del {c.weekStart} · {moodLabel(c.mood)}
              {c.note && ` · ${c.note}`}
            </li>
          ))}
          {mine.length === 0 && <li className="config-hint">Todavía no hay check-ins.</li>}
        </ul>
      </section>

      <section className="config-card" aria-labelledby="mis-1a1">
        <h2 id="mis-1a1" className="config-card-title">
          Tus 1-a-1
        </h2>
        <ul className="equipo-list">
          {myOnes.map((o) => (
            <li key={o.id}>
              {o.heldOn}
              {o.sharedNotes && ` · ${o.sharedNotes}`}
            </li>
          ))}
          {myOnes.length === 0 && <li className="config-hint">Todavía no hay 1-a-1.</li>}
        </ul>
      </section>

      {team.map((t) => (
        <section key={t.userId} className="config-card" aria-label={`Check-ins de ${t.name}`}>
          <h2 className="config-card-title">{t.name}</h2>
          <ul className="equipo-list">
            {t.checkins.map((c) => (
              <li key={c.id}>
                Semana del {c.weekStart} · {moodLabel(c.mood)}
                {c.note && ` · ${c.note}`}
              </li>
            ))}
            {t.checkins.length === 0 && <li className="config-hint">Sin check-ins.</li>}
          </ul>
          <ul className="equipo-list">
            {t.ones.map((o) => (
              <li key={o.id}>
                1-a-1 del {o.heldOn}
                {o.sharedNotes && ` · ${o.sharedNotes}`}
              </li>
            ))}
          </ul>
          <form action={registrar} className="config-form" aria-label={`1-a-1 con ${t.name}`}>
            <input type="hidden" name="employeeId" value={t.userId} />
            <label className="permiso-field">
              <span>Fecha del 1-a-1</span>
              <input name="heldOn" type="date" required className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Notas compartidas</span>
              <textarea name="sharedNotes" maxLength={4000} rows={3} className="config-input" />
            </label>
            <button type="submit" className="panel-btn-ghost">
              Registrar 1-a-1
            </button>
          </form>
        </section>
      ))}
    </main>
  );
}
