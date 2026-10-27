// Panel del Pacto de los socios: pilares, escuadras y retos. Los registros de las personas no aparecen
// aquí: son de cada quien (RLS y servidor).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDockOwnership } from "@/server/auth/guard.ts";
import { listPillars, upsertPillar } from "@/server/pacto/pacto.ts";
import { addSquadMember, createChallenge, createSquad, listChallenges, listSquads } from "@/server/pacto/squads.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

function done(base: string, r: Result<unknown>): never {
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

export default async function PactoPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/muelle/${muelleId}/pacto`;
  const { userId } = await requireDockOwnership(muelleId, base);
  const [pillars, squads, challenges] = await Promise.all([
    listPillars(userId, muelleId),
    listSquads(userId, muelleId),
    listChallenges(userId, muelleId),
  ]);

  async function guardarPilar(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(
      base,
      await upsertPillar(actor, muelleId, {
        id: formData.get("id")?.toString() || undefined,
        name: formData.get("name")?.toString(),
        position: Number(formData.get("position") ?? 0),
        active: formData.get("active") !== "false",
      }),
    );
  }

  async function nuevaEscuadra(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(base, await createSquad(actor, muelleId, formData.get("name")?.toString()));
  }

  async function agregarMiembro(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(base, await addSquadMember(actor, formData.get("squadId")?.toString() ?? "", formData.get("email")?.toString()));
  }

  async function nuevoReto(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(
      base,
      await createChallenge(actor, muelleId, {
        title: formData.get("title")?.toString(),
        pillarId: formData.get("pillarId")?.toString() || null,
        squadId: formData.get("squadId")?.toString() || null,
        startsOn: formData.get("startsOn")?.toString(),
        endsOn: formData.get("endsOn")?.toString(),
      }),
    );
  }

  return (
    <main>
      <h1>Pacto</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}

      <section aria-labelledby="pilares">
        <h2 id="pilares">Pilares</h2>
        <ul>
          {pillars.map((p) => (
            <li key={p.id}>
              {p.name} · orden {p.position} · {p.active ? "Activo" : "Inactivo"}
              <form action={guardarPilar} style={{ display: "inline-flex" }}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="name" value={p.name} />
                <label>
                  Orden de {p.name} <input name="position" type="number" min={0} max={1000} defaultValue={p.position} />
                </label>
                <input type="hidden" name="active" value={String(p.active)} />
                <button type="submit">Guardar orden</button>
              </form>
              <form action={guardarPilar} style={{ display: "inline-flex" }}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="name" value={p.name} />
                <input type="hidden" name="position" value={p.position} />
                <input type="hidden" name="active" value={String(!p.active)} />
                <button type="submit">{p.active ? "Desactivar" : "Activar"}</button>
              </form>
            </li>
          ))}
          {pillars.length === 0 && <li>Sin pilares todavía.</li>}
        </ul>
        <form action={guardarPilar}>
          <label>Nombre del pilar <input name="name" required minLength={2} maxLength={60} /></label>
          <label>Orden <input name="position" type="number" min={0} max={1000} defaultValue={pillars.length} /></label>
          <button type="submit">Crear pilar</button>
        </form>
      </section>

      <section aria-labelledby="escuadras">
        <h2 id="escuadras">Escuadras</h2>
        <ul>
          {squads.map((s) => (
            <li key={s.id}>
              {s.name} · {s.members} integrantes
              <form action={agregarMiembro} style={{ display: "inline-flex" }}>
                <input type="hidden" name="squadId" value={s.id} />
                <label>
                  Correo para {s.name} <input name="email" type="email" required />
                </label>
                <button type="submit">Agregar</button>
              </form>
            </li>
          ))}
          {squads.length === 0 && <li>Sin escuadras todavía.</li>}
        </ul>
        <form action={nuevaEscuadra}>
          <label>Nombre de la escuadra <input name="name" required minLength={2} maxLength={60} /></label>
          <button type="submit">Crear escuadra</button>
        </form>
      </section>

      <section aria-labelledby="retos">
        <h2 id="retos">Retos</h2>
        <ul>
          {challenges.map((c) => (
            <li key={c.id}>
              {c.title} · {c.startsOn} a {c.endsOn}
            </li>
          ))}
          {challenges.length === 0 && <li>Sin retos activos.</li>}
        </ul>
        <form action={nuevoReto}>
          <label>Reto <input name="title" required minLength={3} maxLength={120} /></label>
          <label>
            Pilar
            <select name="pillarId" defaultValue="">
              <option value="">Todos</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Escuadra
            <select name="squadId" defaultValue="">
              <option value="">Toda la red</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>Desde <input type="date" name="startsOn" required /></label>
          <label>Hasta <input type="date" name="endsOn" required /></label>
          <button type="submit">Crear reto</button>
        </form>
      </section>
    </main>
  );
}
