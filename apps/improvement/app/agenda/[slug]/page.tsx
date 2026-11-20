// Portal público de reservas, sin sesión: un día a la vez (?d=YYYY-MM-DD), un botón por horario, nombre y
// correo, confirmación con enlace de cancelación (?cancelar=<token>). Solo columnas públicas
// (server/calendar/booking.ts); nunca el dueño ni ids internos.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cancelBooking, createBooking, loadPublicBookingPage } from "@/server/calendar/booking.ts";
import { dayKey, dayLabel, field, timeLabel } from "@/lib/format.ts";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export default async function ReservasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ d?: string; h?: string; error?: string; confirmada?: string; t?: string; cancelar?: string; cancelada?: string }>;
}) {
  const { slug } = await params;
  const q = await searchParams;
  const now = new Date();
  const date = q.d && /^\d{4}-\d{2}-\d{2}$/.test(q.d) ? q.d : dayKey.format(now);
  const data = await loadPublicBookingPage(slug, date, now);
  if (!data) notFound();
  const base = `/agenda/${slug}`;
  const chosen = q.h && data.slots.includes(q.h) ? q.h : null;

  async function reservar(formData: FormData) {
    "use server";
    const r = await createBooking(
      slug,
      { startsAt: field(formData, "startsAt"), guestName: field(formData, "guestName"), guestEmail: field(formData, "guestEmail") },
      new Date(),
    );
    if (!r.ok) redirect(`${base}?d=${date}&error=${encodeURIComponent(r.error.message)}`);
    redirect(`${base}?confirmada=${encodeURIComponent(r.data.startsAt)}&t=${r.data.cancelToken}`);
  }

  async function cancelar(formData: FormData) {
    "use server";
    const r = await cancelBooking(field(formData, "token"));
    redirect(r.ok ? `${base}?cancelada=1` : `${base}?error=${encodeURIComponent("La reserva ya no existe.")}`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">{data.title}</h1>
      <p className="config-hint">Citas de {data.durationMinutes} minutos. Horario de la Ciudad de México.</p>
      {q.error && <p className="invite-error">{q.error}</p>}

      {q.confirmada && q.t ? (
        <section className="config-card" aria-labelledby="confirmada" role="status">
          <h2 id="confirmada" className="config-card-title">
            Reserva confirmada
          </h2>
          <p>
            {dayLabel.format(new Date(q.confirmada))}, {timeLabel.format(new Date(q.confirmada))}.
          </p>
          <p className="config-hint">
            Guarda este enlace por si necesitas cancelar: <a href={`${base}?cancelar=${q.t}`}>cancelar mi reserva</a>
          </p>
        </section>
      ) : q.cancelar ? (
        <form action={cancelar} className="config-form config-card" aria-label="Cancelar reserva">
          <input type="hidden" name="token" value={q.cancelar} />
          <p>¿Quieres cancelar tu reserva?</p>
          <button type="submit" className="panel-cta">
            Cancelar reserva
          </button>
        </form>
      ) : (
        <>
          {q.cancelada && (
            <p role="status" className="config-hint">
              Tu reserva quedó cancelada.
            </p>
          )}
          <section className="config-card" aria-labelledby="dia">
            <h2 id="dia" className="config-card-title">
              {dayLabel.format(new Date(`${date}T12:00:00Z`))}
            </h2>
            <nav aria-label="Cambiar de día" className="flex gap-3">
              <Link href={`${base}?d=${shift(date, -1)}`} className="panel-btn-ghost">
                Día anterior
              </Link>
              <Link href={`${base}?d=${shift(date, 1)}`} className="panel-btn-ghost">
                Día siguiente
              </Link>
            </nav>
            {data.slots.length === 0 ? (
              <p className="config-hint">No hay horarios libres este día.</p>
            ) : (
              <ul className="flex flex-wrap gap-2" aria-label="Horarios libres">
                {data.slots.map((s) => (
                  <li key={s}>
                    <Link
                      href={`${base}?d=${date}&h=${encodeURIComponent(s)}`}
                      className={s === chosen ? "panel-cta" : "panel-btn-ghost"}
                      aria-current={s === chosen ? "true" : undefined}
                    >
                      {timeLabel.format(new Date(s))}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {chosen && (
            <form action={reservar} className="config-form config-card" aria-label="Tus datos">
              <h2 className="config-card-title">Reservar a las {timeLabel.format(new Date(chosen))}</h2>
              <input type="hidden" name="startsAt" value={chosen} />
              <label className="permiso-field">
                <span>Tu nombre</span>
                <input name="guestName" required maxLength={80} autoComplete="name" className="config-input" />
              </label>
              <label className="permiso-field">
                <span>Tu correo</span>
                <input name="guestEmail" type="email" required autoComplete="email" className="config-input" />
              </label>
              <button type="submit" className="panel-cta">
                Reservar
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
