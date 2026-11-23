// Agenda personal: esta semana y la siguiente agrupadas por día, alta de tarea/evento/bloqueo, "Hecho",
// "Reprogramar pendientes", conexión con Google Calendar y la página pública de reservas. Todo es del
// usuario que la abre (server/calendar/events.ts): ni el dueño ve la agenda de otro.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { createEvent, listMyEvents, loadAgendaSettings, markDone, rescheduleMine, upsertBookingPage } from "@/server/calendar/events.ts";
import { disconnectGoogle } from "@/server/calendar/sync.ts";
import { dayKey, dayLabel, field, timeLabel } from "@/lib/format.ts";

// ponytail: offset fijo UTC-6 (sin horario de verano desde 2022), igual que server/calendar/reschedule.ts.
const OFFSET = "-06:00";
const DAY = 86_400_000;
const KIND_LABEL: Record<string, string> = { tarea: "Tarea", evento: "Evento", bloqueo: "Bloqueo" };
const DIAS = [
  { key: "1", label: "Lunes" },
  { key: "2", label: "Martes" },
  { key: "3", label: "Miércoles" },
  { key: "4", label: "Jueves" },
  { key: "5", label: "Viernes" },
  { key: "6", label: "Sábado" },
  { key: "7", label: "Domingo" },
] as const;



// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

async function actor() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return userId;
}

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string; google?: string }>;
}) {
  const { org: orgId } = await params;
  const { error, google } = await searchParams;
  const { membership } = await requireSection(orgId, "agenda");
  const userId = membership.userId;
  const pagina = `/${orgId}/agenda`;

  // Lunes de esta semana (local) y dos semanas hacia adelante: lo reprogramado puede caer en la siguiente.
  const now = new Date();
  const todayLocal = Date.parse(`${dayKey.format(now)}T00:00:00${OFFSET}`);
  const isoDow = ((new Date(todayLocal + 6 * 3_600_000).getUTCDay() + 6) % 7) + 1;
  const from = new Date(todayLocal - (isoDow - 1) * DAY);
  const to = new Date(from.getTime() + 14 * DAY);
  const [events, settings] = await Promise.all([listMyEvents(userId, orgId, { from, to }), loadAgendaSettings(userId, orgId)]);
  if (!events.ok || !settings.ok) notFound();
  const { connection, bookingPage } = settings.data;
  const hours = (bookingPage?.weeklyHours ?? {}) as Record<string, [string, string][]>;

  const byDay = new Map<string, typeof events.data>();
  for (const e of events.data) {
    const k = dayKey.format(e.startsAt);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  async function nuevo(formData: FormData) {
    "use server";
    const userId = await actor();
    const startsAt = new Date(`${field(formData, "date")}T${field(formData, "time")}:00${OFFSET}`);
    const minutes = Number(field(formData, "minutes") || "30");
    finish(
      pagina,
      await createEvent(userId, orgId, {
        kind: field(formData, "kind"),
        title: field(formData, "title"),
        startsAt,
        endsAt: new Date(startsAt.getTime() + minutes * 60_000),
      }),
    );
  }

  async function hecho(formData: FormData) {
    "use server";
    finish(pagina, await markDone(await actor(), orgId, field(formData, "eventId")));
  }

  async function reprogramar() {
    "use server";
    finish(pagina, await rescheduleMine(await actor(), orgId, new Date()));
  }

  async function desconectar() {
    "use server";
    finish(pagina, await disconnectGoogle(await actor(), orgId));
  }

  async function guardarReservas(formData: FormData) {
    "use server";
    const userId = await actor();
    const weeklyHours = Object.fromEntries(
      DIAS.flatMap((d) => {
        const a = field(formData, `from-${d.key}`);
        const b = field(formData, `to-${d.key}`);
        return a && b ? [[d.key, [[a, b]]]] : [];
      }),
    );
    finish(
      pagina,
      await upsertBookingPage(userId, orgId, {
        slug: field(formData, "slug"),
        title: field(formData, "title"),
        durationMinutes: field(formData, "duration"),
        weeklyHours,
      }),
    );
  }

  return (
    <main className="config-page" style={{ maxWidth: "64rem" }}>
      <h1 className="config-title">Agenda</h1>
      {error && <p className="invite-error">{error}</p>}
      {google && (
        <p role="status" className="config-hint">
          {google === "ok" ? "Google Calendar quedó conectado." : "No se pudo conectar Google Calendar. Inténtalo de nuevo."}
        </p>
      )}

      <section className="config-card" aria-labelledby="semana">
        <h2 id="semana" className="config-card-title">
          Esta semana y la siguiente
        </h2>
        <form action={reprogramar}>
          <button type="submit" className="panel-btn-ghost">
            Reprogramar pendientes
          </button>
        </form>
        {byDay.size === 0 && <p className="config-hint">Nada en la agenda.</p>}
        {[...byDay.entries()].map(([k, list]) => (
          <section key={k} aria-label={dayLabel.format(list[0]!.startsAt)}>
            <h3 className="config-hint">{dayLabel.format(list[0]!.startsAt)}</h3>
            <ul className="equipo-list">
              {list.map((e) => (
                <li key={e.id} data-event={e.title}>
                  <time dateTime={e.startsAt.toISOString()} className="config-amount">
                    {timeLabel.format(e.startsAt)}–{timeLabel.format(e.endsAt)}
                  </time>{" "}
                  {e.title} · {KIND_LABEL[e.kind] ?? e.kind}
                  {e.source === "google" && " · Google"}
                  {e.status === "hecho" ? (
                    " · Hecho"
                  ) : e.kind === "tarea" ? (
                    <form action={hecho} className="inline">
                      <input type="hidden" name="eventId" value={e.id} />{" "}
                      <button type="submit" className="panel-btn-ghost" aria-label={`Marcar hecho: ${e.title}`}>
                        Hecho
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>

      <form action={nuevo} className="config-form config-card" aria-label="Nuevo en la agenda">
        <h2 className="config-card-title">Agregar</h2>
        <label className="permiso-field">
          <span>Tipo</span>
          <select name="kind" className="config-input" defaultValue="tarea">
            <option value="tarea">Tarea</option>
            <option value="evento">Evento</option>
            <option value="bloqueo">Bloqueo</option>
          </select>
        </label>
        <label className="permiso-field">
          <span>Título</span>
          <input name="title" required maxLength={200} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Fecha</span>
          <input name="date" type="date" required className="config-input" defaultValue={dayKey.format(now)} />
        </label>
        <label className="permiso-field">
          <span>Hora</span>
          <input name="time" type="time" required className="config-input" defaultValue="09:00" />
        </label>
        <label className="permiso-field">
          <span>Duración (minutos)</span>
          <input name="minutes" type="number" min={15} max={480} step={15} defaultValue={30} className="config-input" />
        </label>
        <button type="submit" className="panel-cta">
          Agregar a la agenda
        </button>
      </form>

      <section className="config-card" aria-labelledby="google">
        <h2 id="google" className="config-card-title">
          Google Calendar
        </h2>
        {connection?.status === "activa" ? (
          <>
            <p className="config-hint">
              Conectado{connection.lastSyncedAt ? ` · última sincronización ${timeLabel.format(connection.lastSyncedAt)}` : ""}.
            </p>
            <form action={desconectar}>
              <button type="submit" className="panel-btn-ghost">
                Desconectar
              </button>
            </form>
          </>
        ) : (
          <>
            {connection && <p className="invite-error">Google dejó de responder a tu conexión; vuelve a conectar.</p>}
            <a className="panel-cta" href={`/api/calendar/google/connect?org=${orgId}`}>
              Conectar Google Calendar
            </a>
          </>
        )}
      </section>

      <form action={guardarReservas} className="config-form config-card" aria-label="Página de reservas">
        <h2 className="config-card-title">Página de reservas</h2>
        {bookingPage && (
          <p>
            Tu enlace público: <a href={`/agenda/${bookingPage.slug}`}>/agenda/{bookingPage.slug}</a>
          </p>
        )}
        <label className="permiso-field">
          <span>Enlace (minúsculas, números y guiones)</span>
          <input name="slug" required pattern="[a-z0-9\-]{3,40}" defaultValue={bookingPage?.slug ?? ""} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Título de la página</span>
          <input name="title" required maxLength={120} defaultValue={bookingPage?.title ?? ""} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Duración de cada cita (minutos)</span>
          <input name="duration" type="number" min={15} max={240} step={15} defaultValue={bookingPage?.durationMinutes ?? 30} className="config-input" />
        </label>
        {DIAS.map((d) => (
          <fieldset key={d.key} className="flex flex-wrap gap-3">
            <legend>{d.label}</legend>
            <label>
              {d.label} desde
              <input name={`from-${d.key}`} type="time" defaultValue={hours[d.key]?.[0]?.[0] ?? ""} className="config-input" />
            </label>
            <label>
              {d.label} hasta
              <input name={`to-${d.key}`} type="time" defaultValue={hours[d.key]?.[0]?.[1] ?? ""} className="config-input" />
            </label>
          </fieldset>
        ))}
        <button type="submit" className="panel-cta">
          Guardar página de reservas
        </button>
      </form>
    </main>
  );
}
