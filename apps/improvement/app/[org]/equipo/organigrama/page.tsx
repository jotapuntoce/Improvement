// Accountability Chart: asientos (no personas) en árbol, con roles y responsable. Lo ve quien tenga la
// sección `equipo`; arma y borra asientos solo el dueño.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { createSeat, listSeats, removeSeat, type SeatNode } from "@/server/people/seats.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

function flatten(nodes: SeatNode[], depth = 0): { id: string; title: string; depth: number }[] {
  return nodes.flatMap((n) => [{ id: n.id, title: n.title, depth }, ...flatten(n.children, depth + 1)]);
}

function SeatTree({ seats, quitar }: { seats: SeatNode[]; quitar?: (formData: FormData) => Promise<void> }) {
  return (
    <ul className="equipo-list">
      {seats.map((s) => (
        <li key={s.id} className="config-card">
          <p className="objetivo-title">{s.title}</p>
          <p className="config-hint">Responsable: {s.holderName ?? "Sin responsable"}</p>
          <ul>
            {s.roles.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {quitar && (
            <form action={quitar}>
              <input type="hidden" name="seatId" value={s.id} />
              <button type="submit" className="panel-btn-ghost" aria-label={`Quitar el asiento ${s.title}`}>
                Quitar asiento
              </button>
            </form>
          )}
          {s.children.length > 0 && <SeatTree seats={s.children} quitar={quitar} />}
        </li>
      ))}
    </ul>
  );
}

export default async function OrganigramaPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const { membership } = await requireSection(orgId, "equipo");
  const userId = membership.userId;
  const isOwner = membership.role === "owner";
  const [seats, teammates] = await Promise.all([listSeats(userId, orgId), isOwner ? listTeammates(userId, orgId) : []]);
  const pagina = `/${orgId}/equipo/organigrama`;

  async function crear(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      pagina,
      await createSeat(actor, orgId, {
        title: field(formData, "title"),
        roles: field(formData, "roles").split("\n").map((r) => r.trim()).filter(Boolean),
        parentSeatId: field(formData, "parentSeatId") || null,
        holderProfileId: field(formData, "holderProfileId") || null,
        position: field(formData, "position") || "0",
      }),
    );
  }

  async function quitar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(pagina, await removeSeat(actor, orgId, field(formData, "seatId")));
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Accountability Chart</h1>
      {error && <p className="invite-error">{error}</p>}
      {seats.length === 0 ? <p className="config-hint">Todavía no hay asientos.</p> : <SeatTree seats={seats} quitar={isOwner ? quitar : undefined} />}

      {isOwner && (
        <form action={crear} className="config-card" aria-label="Nuevo asiento">
          <h2 className="config-card-title">Nuevo asiento</h2>
          <label className="permiso-field">
            <span>Asiento</span>
            <input name="title" required minLength={2} maxLength={120} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Roles (uno por línea, máximo 5)</span>
            <textarea name="roles" required rows={5} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Cuelga de</span>
            <select name="parentSeatId" className="config-input" defaultValue="">
              <option value="">Ninguno (raíz)</option>
              {flatten(seats).map((s) => (
                <option key={s.id} value={s.id}>
                  {"— ".repeat(s.depth)}
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label className="permiso-field">
            <span>Responsable</span>
            <select name="holderProfileId" className="config-input" defaultValue="">
              <option value="">Sin responsable</option>
              {teammates.map((t) => (
                <option key={t.userId} value={t.userId}>
                  {t.fullName ?? t.email}
                </option>
              ))}
            </select>
          </label>
          <label className="permiso-field">
            <span>Orden</span>
            <input name="position" type="number" min={0} max={1000} defaultValue={0} className="config-input" />
          </label>
          <button type="submit" className="panel-cta">
            Crear asiento
          </button>
        </form>
      )}
    </main>
  );
}
