// El diagnóstico de la empresa: qué le falta para evolucionar, crecer, mejorar y sostener.
//
// Es la pantalla de la que cuelga el resto del producto. Un objetivo existe porque atiende una de
// estas necesidades; el puntaje que vale depende de qué tan grave es; y cuando una necesidad pide a
// alguien de fuera, de aquí sale la derivación a Summum System.
//
// Solo dueño, por la misma razón que la política RLS de 0018: el diagnóstico incluye el juicio sobre
// áreas y, por tanto, sobre el trabajo de personas concretas. 404 y no 403 para todos los demás.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findOwnerMembership, getSessionUserId } from "@/server/auth/guard";
import {
  createNeed,
  listNeeds,
  referNeedToSummum,
  summumBrief,
  updateNeedStatus,
  SEVERITY_LABEL,
} from "@/server/needs/mutations";
import { listAreasByOrg } from "@/server/areas/listAreas.ts";
import { getEvolution } from "@/server/evolution/mutations";

const ESTADO_LABEL: Record<string, string> = {
  abierta: "Abierta",
  en_progreso: "En progreso",
  resuelta: "Resuelta",
  derivada: "Derivada a Summum",
};

export default async function NecesidadesPage({
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

  const [necesidades, areasPorOrg, nivel] = await Promise.all([
    listNeeds(userId, orgId),
    listAreasByOrg([orgId]),
    getEvolution(userId, orgId),
  ]);
  const areas = areasPorOrg.get(orgId) ?? [];
  if (!nivel) notFound();
  const pagina = `/${orgId}/necesidades`;

  async function registrar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const result = await createNeed(actor, orgId, {
      title: formData.get("title")?.toString() ?? "",
      detail: formData.get("detail")?.toString() || null,
      areaId: formData.get("areaId")?.toString() || null,
      severity: formData.get("severity")?.toString() ?? "2",
      source: "dueno",
    });
    if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  async function cambiarEstado(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const result = await updateNeedStatus(
      actor,
      orgId,
      formData.get("needId")?.toString() ?? "",
      formData.get("status")?.toString() ?? "",
    );
    if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  async function derivar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const result = await referNeedToSummum(
      actor,
      orgId,
      formData.get("needId")?.toString() ?? "",
      formData.get("note")?.toString() || null,
    );
    if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Lo que necesita tu empresa</h1>
      <div className="config-card">
        <p className="config-hint">Nivel de tu empresa</p>
        <p className="config-card-title">{nivel.name}</p>
        <p className="config-hint">{nivel.description}</p>
        <p className="config-hint">
          {nivel.nextName
            ? `Te faltan ${nivel.openNeeds} necesidades por cerrar para llegar a ${nivel.nextName}.`
            : "Tu empresa está en el último nivel."}{" "}
          Lo que sigue no es igual para todas las empresas: es esta lista.
        </p>
      </div>

      {error && <p className="invite-error">{error}</p>}

      <ul className="equipo-list">
        {necesidades.map((n) => (
          <li key={n.id} className="config-card">
            <p className="objetivo-title">{n.title}</p>
            <p className="config-hint">
              {n.areaName ?? "Sin área"} · Severidad {SEVERITY_LABEL[n.severity] ?? n.severity} ·{" "}
              {ESTADO_LABEL[n.status] ?? n.status}
            </p>
            {n.detail && <p className="config-hint">{n.detail}</p>}

            {n.status === "derivada" ? (
              <pre className="necesidad-brief">{summumBrief(n)}</pre>
            ) : (
              <div className="permiso-actions">
                <form action={cambiarEstado}>
                  <input type="hidden" name="needId" value={n.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={n.status === "abierta" ? "en_progreso" : "resuelta"}
                  />
                  <button type="submit" className="panel-btn-ghost">
                    {n.status === "abierta" ? "Marcar en progreso" : "Marcar resuelta"}
                  </button>
                </form>
                <form action={derivar} className="config-form">
                  <input type="hidden" name="needId" value={n.id} />
                  <input
                    name="note"
                    placeholder="Qué necesitas de un experto de fuera"
                    className="config-input"
                  />
                  <button type="submit" className="panel-btn-ghost">
                    Derivar a Summum
                  </button>
                </form>
              </div>
            )}
          </li>
        ))}
        {necesidades.length === 0 && (
          <p className="config-hint">
            Todavía no hay diagnóstico. Sin él, cualquier objetivo que emitas vale la mitad.
          </p>
        )}
      </ul>

      <form action={registrar} className="config-card">
        <h2 className="config-card-title">Registrar una necesidad</h2>
        <label className="permiso-field">
          <span>Qué le falta a tu empresa</span>
          <input name="title" required minLength={3} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Los patógenos: qué lo está causando</span>
          <textarea name="detail" rows={3} className="config-input" />
          <span className="config-hint">
            Esto es lo que se le entrega a Summum si un día esta necesidad se deriva.
          </span>
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
          <span>Qué tan grave</span>
          <select name="severity" className="config-input" defaultValue="2">
            <option value="1">Leve</option>
            <option value="2">Moderada</option>
            <option value="3">Crítica</option>
          </select>
        </label>
        <div className="permiso-actions">
          <button type="submit" className="panel-cta">
            Registrar
          </button>
        </div>
      </form>

      <Link href={`/${orgId}/objetivos`}>← Volver a objetivos</Link>
    </main>
  );
}
