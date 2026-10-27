// People Analyzer: valores centrales de la Visión × GWC, por trimestre. El dueño ve y evalúa a su equipo;
// cada empleado ve solo su propia evaluación. Nada se ordena ni se colorea por calificación.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { myReviews, PEOPLE_RATINGS, reviewsForOwner, saveReview } from "@/server/people/reviews.ts";
import { getVision } from "@/server/direccion/vision/vision.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

const GWC = [
  { key: "entiende", label: "Entiende" },
  { key: "quiere", label: "Quiere" },
  { key: "capacidad", label: "Capacidad" },
] as const;

/** Primer día del trimestre en curso (YYYY-MM-DD). */
function currentQuarter(now = new Date()): string {
  const month = Math.floor(now.getUTCMonth() / 3) * 3 + 1;
  return `${now.getUTCFullYear()}-${String(month).padStart(2, "0")}-01`;
}

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

export default async function AnalizadorPage({
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
  const pagina = `/${orgId}/equipo/analizador`;
  const period = currentQuarter();

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const values = formData.getAll("value").map(String);
    finish(
      pagina,
      await saveReview(actor, orgId, formData.get("employeeId")?.toString(), {
        periodStart: period,
        ratings: Object.fromEntries(values.map((v) => [v, formData.get(`rating:${v}`)?.toString()])),
        gwc: Object.fromEntries(GWC.map((g) => [g.key, formData.get(g.key) === "on"])),
        note: formData.get("note")?.toString().trim() || null,
      }),
    );
  }

  if (!isOwner) {
    const mine = await myReviews(userId, orgId);
    return (
      <main className="config-page">
        <h1 className="config-title">People Analyzer</h1>
        <p className="config-hint">Tu evaluación la ves tú y el dueño de la empresa. Nadie más.</p>
        {mine.map((r) => (
          <section key={r.id} className="config-card" aria-label={`Evaluación del trimestre ${r.periodStart}`}>
            <h2 className="config-card-title">Trimestre que empieza el {r.periodStart}</h2>
            <ul className="equipo-list">
              {Object.entries(r.ratings).map(([value, rating]) => (
                <li key={value}>
                  {value}: {rating}
                </li>
              ))}
              {GWC.map((g) => (
                <li key={g.key}>
                  {g.label}: {r.gwc[g.key] ? "Sí" : "No"}
                </li>
              ))}
            </ul>
            {r.note && <p>{r.note}</p>}
          </section>
        ))}
        {mine.length === 0 && <p className="config-hint">Todavía no tienes evaluación.</p>}
      </main>
    );
  }

  const [vision, teammates, reviews] = await Promise.all([getVision(userId, orgId), listTeammates(userId, orgId), reviewsForOwner(userId, orgId, period)]);
  const values = vision?.coreValues ?? [];
  const byEmployee = new Map((reviews.ok ? reviews.data : []).map((r) => [r.employeeId, r]));
  const people = teammates
    .filter((t) => t.userId !== userId)
    .map((t) => ({ id: t.userId, name: t.fullName ?? t.email }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return (
    <main className="config-page">
      <h1 className="config-title">People Analyzer</h1>
      {error && <p className="invite-error">{error}</p>}
      <p className="config-hint">Trimestre que empieza el {period}. Solo tú ves este cuadro.</p>
      {values.length === 0 && <p className="config-hint">Primero escribe los valores en la Visión.</p>}

      {values.length > 0 && (
        <table className="config-card">
          <caption>Valores centrales y GWC por persona</caption>
          <thead>
            <tr>
              <th scope="col">Persona</th>
              {values.map((v) => (
                <th key={v} scope="col">
                  {v}
                </th>
              ))}
              {GWC.map((g) => (
                <th key={g.key} scope="col">
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const r = byEmployee.get(p.id);
              return (
                <tr key={p.id}>
                  <th scope="row">{p.name}</th>
                  {values.map((v) => (
                    <td key={v}>{r?.ratings[v] ?? "—"}</td>
                  ))}
                  {GWC.map((g) => (
                    <td key={g.key}>{r ? (r.gwc[g.key] ? "Sí" : "No") : "—"}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {values.length > 0 &&
        people.map((p) => {
          const r = byEmployee.get(p.id);
          return (
            <form key={p.id} action={guardar} className="config-card" aria-label={`Evaluar a ${p.name}`}>
              <h2 className="config-card-title">{p.name}</h2>
              <input type="hidden" name="employeeId" value={p.id} />
              {values.map((v) => (
                <label key={v} className="permiso-field">
                  <span>
                    {v} ({p.name})
                  </span>
                  <input type="hidden" name="value" value={v} />
                  <select name={`rating:${v}`} required className="config-input" defaultValue={r?.ratings[v] ?? ""}>
                    <option value="" disabled>
                      Elige
                    </option>
                    {PEOPLE_RATINGS.map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {GWC.map((g) => (
                <label key={g.key}>
                  <input type="checkbox" name={g.key} defaultChecked={r?.gwc[g.key] ?? false} /> {g.label}
                </label>
              ))}
              <label className="permiso-field">
                <span>Nota</span>
                <textarea name="note" maxLength={2000} rows={2} className="config-input" defaultValue={r?.note ?? ""} />
              </label>
              <button type="submit" className="panel-btn-ghost">
                Guardar evaluación
              </button>
            </form>
          );
        })}
    </main>
  );
}
