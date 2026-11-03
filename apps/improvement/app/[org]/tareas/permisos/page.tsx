// Qué hace Improvement sin preguntar. Cada quien decide los suyos.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { ACTION_LABELS, getModes, setMode } from "@/server/tasks/actions.ts";

const MODOS = {
  siempre: "Pregúntame siempre",
  primera_vez: "Pregúntame la primera vez",
  solo: "Hazlo solo",
};
const ACCIONES = Object.keys(ACTION_LABELS) as (keyof typeof ACTION_LABELS)[];

export default async function Permisos({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await requireOrgMembership(orgId);
  const modes = await getModes(me.userId, orgId);
  const pagina = `/${orgId}/tareas/permisos`;

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    for (const action of ACCIONES) {
      const mode = formData.get(action)?.toString();
      if (mode) await setMode(actor, orgId, action, mode);
    }
    revalidatePath(pagina);
    redirect(pagina);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Qué hace Improvement solo</h1>
      <p className="config-hint">Nada de esto sale hacia tus clientes ni mueve dinero.</p>
      <form action={guardar} className="config-form config-form-stack config-card" aria-label="Permisos de Improvement">
        {ACCIONES.map((a) => (
          <label key={a} className="permiso-field">
            <span>{ACTION_LABELS[a]}</span>
            <select name={a} defaultValue={modes[a]} className="config-input">
              {Object.entries(MODOS).map(([m, label]) => <option key={m} value={m}>{label}</option>)}
            </select>
          </label>
        ))}
        <button type="submit" className="panel-cta">Guardar</button>
      </form>
    </main>
  );
}
