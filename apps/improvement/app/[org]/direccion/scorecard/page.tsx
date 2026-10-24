// El Scorecard semanal: cada medible contra su meta en las últimas 13 semanas, la actual primero.
// "En meta" / "Fuera de meta" van en texto además del color — nunca solo color (.claude/rules/direccion.md).
// No es "Indicadores" (org_kpi): aquí todo se captura a mano.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import {
  archiveMeasurable,
  createMeasurable,
  enterValue,
  listScorecard,
  type ScorecardRow,
} from "@/server/direccion/scorecard/measurables.ts";
import { listTeammates } from "@/server/employees/teammates.ts";

const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

function format(value: number, unit: ScorecardRow["unit"]): string {
  const n = NUMBER.format(value);
  if (unit === "dinero") return `$${n}`;
  if (unit === "porcentaje") return `${n}%`;
  return n;
}

// A nivel de módulo y no dentro de la página: una Server Action no puede cerrar sobre una función.
function done(pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath(pagina);
  redirect(pagina);
}

export default async function ScorecardPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const { membership } = await requireSection(orgId, "scorecard");
  const userId = membership.userId;
  const view = await listScorecard(userId, orgId);
  const teammates = view.canDefine ? await listTeammates(userId, orgId) : [];
  const pagina = `/${orgId}/direccion/scorecard`;

  async function capturar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    done(pagina,
      await enterValue(actor, orgId, formData.get("measurableId")?.toString() ?? "", {
        weekStart: formData.get("weekStart")?.toString() ?? "",
        value: formData.get("value")?.toString() ?? "",
      }),
    );
  }

  async function definir(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    done(pagina,
      await createMeasurable(actor, orgId, {
        title: formData.get("title")?.toString() ?? "",
        ownerProfileId: formData.get("ownerProfileId")?.toString() ?? "",
        goal: formData.get("goal")?.toString() ?? "",
        goalDirection: formData.get("goalDirection")?.toString() ?? "",
        unit: formData.get("unit")?.toString() ?? "",
      }),
    );
  }

  async function archivar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    done(pagina, await archiveMeasurable(actor, orgId, formData.get("measurableId")?.toString() ?? ""));
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Scorecard semanal</h1>
      {error && <p className="invite-error">{error}</p>}

      <div className="scorecard-scroll" tabIndex={0} role="region" aria-label="Scorecard, 13 semanas">
        <table className="config-table">
          <caption className="config-table-caption">Cada medible contra su meta, la semana actual primero</caption>
          <thead>
            <tr>
              <th scope="col">Medible</th>
              <th scope="col">Responsable</th>
              <th scope="col">Meta</th>
              {view.weeks.map((ws) => (
                <th key={ws} scope="col" data-week={ws}>
                  {ws}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.title}</th>
                <td>{row.ownerName}</td>
                <td>
                  {row.goalDirection === "gte" ? "≥" : "≤"} {format(row.goal, row.unit)}
                </td>
                {view.weeks.map((ws) => {
                  const cell = row.values[ws];
                  return (
                    <td key={ws} data-week={ws}>
                      {cell ? (
                        <>
                          {format(cell.value, row.unit)}{" "}
                          {cell.onTrack ? (
                            <span className="scorecard-ok">En meta</span>
                          ) : (
                            <span className="scorecard-off">Fuera de meta</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.rows.length === 0 && <p className="config-hint">Todavía no hay medibles en el scorecard.</p>}

      {view.rows
        .filter((row) => row.canEnter)
        .map((row) => (
          <form key={row.id} action={capturar} className="config-card" aria-label={`Capturar valor de ${row.title}`}>
            <h2 className="config-card-title">Capturar valor — {row.title}</h2>
            <input type="hidden" name="measurableId" value={row.id} />
            <label className="permiso-field">
              <span>Semana</span>
              <select name="weekStart" className="config-input" defaultValue={view.currentWeek}>
                {view.weeks.map((ws) => (
                  <option key={ws} value={ws}>
                    {ws}
                  </option>
                ))}
              </select>
            </label>
            <label className="permiso-field">
              <span>Valor</span>
              <input name="value" type="number" step="0.01" required className="config-input" />
            </label>
            <div className="permiso-actions">
              <button type="submit" className="panel-cta">
                Capturar
              </button>
            </div>
          </form>
        ))}

      {view.canDefine && (
        <>
          {view.rows.map((row) => (
            <form key={row.id} action={archivar} className="permiso-actions">
              <input type="hidden" name="measurableId" value={row.id} />
              <button type="submit" className="panel-btn-ghost">
                Archivar {row.title}
              </button>
            </form>
          ))}

          <form action={definir} className="config-card" aria-label="Nuevo medible">
            <h2 className="config-card-title">Nuevo medible</h2>
            <label className="permiso-field">
              <span>Qué se mide</span>
              <input name="title" required minLength={3} maxLength={120} className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Responsable</span>
              <select name="ownerProfileId" className="config-input" defaultValue={userId}>
                {teammates.map((t) => (
                  <option key={t.userId} value={t.userId}>
                    {t.fullName ?? t.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="permiso-field">
              <span>Meta</span>
              <input name="goal" type="number" step="0.01" required className="config-input" />
            </label>
            <label className="permiso-field">
              <span>Dirección</span>
              <select name="goalDirection" className="config-input" defaultValue="gte">
                <option value="gte">Al menos la meta</option>
                <option value="lte">Cuando mucho la meta</option>
              </select>
            </label>
            <label className="permiso-field">
              <span>Unidad</span>
              <select name="unit" className="config-input" defaultValue="numero">
                <option value="numero">Número</option>
                <option value="porcentaje">Porcentaje</option>
                <option value="dinero">Dinero</option>
              </select>
            </label>
            <div className="permiso-actions">
              <button type="submit" className="panel-cta">
                Agregar medible
              </button>
            </div>
          </form>
        </>
      )}

      <Link href={`/${orgId}/objetivos`}>← Volver a objetivos</Link>
    </main>
  );
}
