// Lista de objetivos y entrega de evidencia (§9.6 del blueprint). Server Component: resuelve
// tenencia con requireSection antes de tocar cualquier dato (un 404, nunca un 403, para un org al
// que el usuario no pertenece). La paginación vive en la URL (`?cursor=`), sin estado de cliente.
//
// Completar es un <form action={serverAction}> nativo y ya no un botón "use client": el objetivo
// que pide evidencia necesita un campo, y un formulario de verdad lo resuelve sin JavaScript de por
// medio. Por eso CompleteObjectiveButton dejó de existir.
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgMembership, requireSection } from "@/server/auth/guard";
import { completeObjective, listObjectives } from "@/server/objectives/mutations";
import { basePoints } from "@/server/objectives/points";
import { evidenceKind } from "@/server/objectives/evidence";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completado",
};

const REVIEW_LABEL: Record<string, string> = {
  sin_revisar: "Sin revisar",
  aprobada: "Revisado ✓",
  rechazada: "Necesita corrección",
};

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" });

export default async function ObjetivosPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ cursor?: string; error?: string }>;
}) {
  const { org: orgId } = await params;
  const { cursor, error } = await searchParams;

  const { membership } = await requireSection(orgId, "objetivos");
  const { data } = await listObjectives(membership.userId, orgId, { cursor: cursor ?? null });
  const esDueno = membership.role === "owner";
  const listaUrl = `/${orgId}/objetivos`;

  return (
    <main className="config-page">
      <h1 className="config-title">Objetivos</h1>

      {esDueno && (
        <div className="permiso-actions">
          <Link href={`${listaUrl}/nuevo`} className="panel-cta">
            Emitir un objetivo
          </Link>
          <Link href={`/${orgId}/necesidades`} className="panel-btn-ghost">
            Lo que necesita tu empresa
          </Link>
        </div>
      )}

      {error && <p className="invite-error">{error}</p>}

      <ul className="equipo-list">
        {data.objectives.map((objetivo) => {
          const completado = objetivo.status === "completed";
          const kind = evidenceKind(objetivo.evidenceType);

          async function completar(formData: FormData) {
            "use server";
            const row = await requireOrgMembership(orgId);
            const result = await completeObjective(
              row.userId,
              orgId,
              objetivo.id,
              formData.get("evidencia")?.toString() ?? null,
            );
            if (!result.ok) {
              redirect(`${listaUrl}?error=${encodeURIComponent(result.error.message)}`);
            }
            revalidatePath(listaUrl);
            redirect(listaUrl);
          }

          return (
            <li key={objetivo.id} className="config-card">
              <p className="objetivo-title">{objetivo.title}</p>
              {objetivo.description && <p className="config-hint">{objetivo.description}</p>}
              <p className="config-hint">
                {basePoints(objetivo.impactWeight)} pts · vence el {fecha.format(objetivo.dueDate)} ·{" "}
                {STATUS_LABEL[objetivo.status] ?? objetivo.status}
                {completado && ` · ${REVIEW_LABEL[objetivo.reviewStatus] ?? objetivo.reviewStatus}`}
              </p>

              {completado ? (
                <>
                  {objetivo.evidenceValue && (
                    <p className="config-hint">Evidencia: {objetivo.evidenceValue}</p>
                  )}
                  {objetivo.reviewNote && <p className="config-hint">{objetivo.reviewNote}</p>}
                </>
              ) : (
                <form action={completar} className="objetivo-entrega">
                  {kind && kind.type !== "ninguna" && (
                    <label className="permiso-field">
                      <span>{kind.label}</span>
                      {kind.type === "nota" ? (
                        <textarea name="evidencia" required rows={3} className="config-input" />
                      ) : (
                        <input
                          name="evidencia"
                          type={kind.type === "numero" ? "number" : "text"}
                          min={kind.type === "numero" ? 0 : undefined}
                          required
                          className="config-input"
                        />
                      )}
                      <span className="config-hint">{kind.hint}</span>
                    </label>
                  )}
                  <div className="permiso-actions">
                    <button type="submit" className="panel-cta">
                      Dar por terminado
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
        {data.objectives.length === 0 && (
          <p className="config-hint">
            {esDueno
              ? "Todavía no has emitido ningún objetivo. Tu empresa no puede avanzar sin trabajo que hacer."
              : "Sin objetivos asignados todavía."}
          </p>
        )}
      </ul>

      {data.nextCursor && (
        <Link href={`${listaUrl}?cursor=${encodeURIComponent(data.nextCursor)}`}>
          Siguiente página →
        </Link>
      )}
    </main>
  );
}
