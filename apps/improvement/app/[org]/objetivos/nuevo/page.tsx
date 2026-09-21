// Donde el dueño emite trabajo. Solo dueño: createObjective devuelve FORBIDDEN a cualquier otro, y
// esta pantalla ni siquiera se dibuja — findOwnerMembership → notFound(), 404 y no 403.
//
// El formulario pide tres cosas que antes no existían y que son las que le dan sentido al puntaje:
// a qué necesidad de la empresa responde, si toca el ingreso de forma directa, y qué se va a tener
// que entregar para darlo por terminado.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findOwnerMembership, getSessionUserId } from "@/server/auth/guard";
import { createObjective } from "@/server/objectives/mutations";
import { EVIDENCE_KINDS } from "@/server/objectives/evidence";
import { listNeeds, SEVERITY_LABEL } from "@/server/needs/mutations";
import { listAreasByOrg } from "@/server/areas/listAreas.ts";
import { listTeamForOwner } from "@/server/employees/responsibility";

export default async function NuevoObjetivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const userId = await getSessionUserId();
  if (!userId) notFound();
  if (!(await findOwnerMembership(userId, orgId))) notFound();

  const [areasPorOrg, equipo, necesidades] = await Promise.all([
    listAreasByOrg([orgId]),
    listTeamForOwner(orgId),
    listNeeds(userId, orgId),
  ]);
  const areas = areasPorOrg.get(orgId) ?? [];
  const abiertas = necesidades.filter((n) => n.status === "abierta" || n.status === "en_progreso");
  const listaUrl = `/${orgId}/objetivos`;
  const nuevoUrl = `${listaUrl}/nuevo`;

  async function emitir(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();

    const result = await createObjective(actor, orgId, {
      title: formData.get("title")?.toString() ?? "",
      description: formData.get("description")?.toString() || null,
      impactWeight: formData.get("impactWeight")?.toString() ?? "",
      dueDate: formData.get("dueDate")?.toString() ?? "",
      areaId: formData.get("areaId")?.toString() || null,
      assignedEmployeeId: formData.get("assignedEmployeeId")?.toString() || null,
      needId: formData.get("needId")?.toString() || null,
      kind: formData.get("kind")?.toString() ?? "non_ipa",
      evidenceType: formData.get("evidenceType")?.toString() ?? "ninguna",
    });

    if (!result.ok) redirect(`${nuevoUrl}?error=${encodeURIComponent(result.error.message)}`);
    revalidatePath(listaUrl);
    redirect(listaUrl);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Emitir un objetivo</h1>
      {error && <p className="invite-error">{error}</p>}

      <form action={emitir} className="config-card">
        <label className="permiso-field">
          <span>Qué hay que lograr</span>
          <input name="title" required minLength={3} className="config-input" />
        </label>

        <label className="permiso-field">
          <span>Detalle (opcional)</span>
          <textarea name="description" rows={3} className="config-input" />
        </label>

        <label className="permiso-field">
          <span>A qué necesidad de tu empresa responde</span>
          <select name="needId" className="config-input" defaultValue="">
            <option value="">A ninguna todavía</option>
            {abiertas.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} · {SEVERITY_LABEL[n.severity] ?? n.severity}
              </option>
            ))}
          </select>
          <span className="config-hint">
            Un objetivo que no atiende ninguna necesidad cuenta a la mitad. No es un castigo: es lo
            que evita que el equipo llene el día de tareas chicas que no mueven a la empresa.
            {abiertas.length === 0 && " Todavía no has registrado ninguna."}
          </span>
        </label>

        <label className="permiso-field">
          <span>¿Toca el ingreso de forma directa?</span>
          <select name="kind" className="config-input" defaultValue="non_ipa">
            <option value="non_ipa">No directamente</option>
            <option value="ipa">Sí — prospección, venta, marketing, cliente</option>
          </select>
          <span className="config-hint">
            Esto no se le muestra a quien lo ejecuta y no hace que valga menos. Solo cambia cuándo se
            realiza su impacto: el directo cobra al terminar, el indirecto cobra otra vez cuando
            habilita un ingreso.
          </span>
        </label>

        <label className="permiso-field">
          <span>Qué se entrega para darlo por terminado</span>
          <select name="evidenceType" className="config-input" defaultValue="ninguna">
            {EVIDENCE_KINDS.map((k) => (
              <option key={k.type} value={k.type}>
                {k.label} — {k.hint}
              </option>
            ))}
          </select>
        </label>

        <label className="permiso-field">
          <span>Quién lo hace</span>
          <select name="assignedEmployeeId" className="config-input" defaultValue="">
            <option value="">Sin responsable todavía</option>
            {equipo.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.fullName ?? p.email}
              </option>
            ))}
          </select>
        </label>

        <label className="permiso-field">
          <span>Área</span>
          <select name="areaId" className="config-input" defaultValue="">
            <option value="">Sin área</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="permiso-field">
          <span>Peso (0 a 100)</span>
          <input
            name="impactWeight"
            type="number"
            min={0}
            max={100}
            defaultValue={20}
            required
            className="config-input"
          />
          <span className="config-hint">Cuánto mueve a tu empresa. Cada punto de peso son 10 pts.</span>
        </label>

        <label className="permiso-field">
          <span>Para cuándo</span>
          <input name="dueDate" type="date" required className="config-input" />
        </label>

        <div className="permiso-actions">
          <button type="submit" className="panel-cta">
            Emitir
          </button>
        </div>
      </form>

      <Link href={listaUrl}>← Volver a objetivos</Link>
    </main>
  );
}
