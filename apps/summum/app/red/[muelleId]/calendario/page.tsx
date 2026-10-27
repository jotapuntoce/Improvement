// Calendario de la red: los eventos que vienen; los dueños del muelle crean eventos.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUserId, listMyDocks, requireDockOwnership } from "@/server/auth/guard.ts";
import { createEvent, listUpcoming } from "@/server/community/events.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";

const fecha = (d: Date) => d.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "full", timeStyle: "short" });

// <input type="datetime-local"> no trae zona: se interpreta como hora de Ciudad de México (UTC-6, sin horario de verano).
const mxLocal = (v: FormDataEntryValue | null) => (v ? `${v.toString()}:00-06:00` : null);

export default async function CalendarioPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/red/${muelleId}/calendario`;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(base)}`);
  const [events, docks] = await Promise.all([listUpcoming(userId, muelleId), listMyDocks(userId)]);
  const isDockOwner = docks.some((d) => d.id === muelleId);

  async function nuevoEvento(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    const r = await createEvent(actor, muelleId, {
      title: formData.get("title")?.toString(),
      startsAt: mxLocal(formData.get("startsAt")),
      endsAt: mxLocal(formData.get("endsAt")),
      liveUrl: formData.get("liveUrl")?.toString().trim() || null,
      description: formData.get("description")?.toString() ?? "",
    });
    if (!r.ok) redirect(`${base}?error=${errorCode(r.error)}`);
    revalidatePath(base);
    redirect(base);
  }

  return (
    <main style={{ padding: "24px" }}>
      <h1>Calendario</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
      <ul>
        {events.map((e) => (
          <li key={e.id}>
            <strong>{e.title}</strong> · {fecha(e.startsAt)}
            {e.liveUrl && (
              <>
                {" "}
                · <a href={e.liveUrl} target="_blank" rel="noreferrer">Entrar en vivo</a>
              </>
            )}
            {e.description && <p>{e.description}</p>}
          </li>
        ))}
        {events.length === 0 && <li>No hay eventos próximos.</li>}
      </ul>
      {isDockOwner && (
        <form action={nuevoEvento}>
          <h2>Nuevo evento</h2>
          <label>Título <input name="title" required minLength={3} maxLength={160} /></label>
          <label>Empieza <input name="startsAt" type="datetime-local" required /></label>
          <label>Termina <input name="endsAt" type="datetime-local" /></label>
          <label>Enlace en vivo (https) <input name="liveUrl" type="url" pattern="https://.*" /></label>
          <label>Descripción <textarea name="description" maxLength={2000} /></label>
          <button type="submit">Crear evento</button>
        </form>
      )}
    </main>
  );
}
