// Agregar aplicación: el dueño nombra su app, su grupo en la barra y sus etapas. Los campos se agregan
// después, igual que en las apps base.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findOwnerMembership, getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { createCustomApp } from "@/server/apps/custom.ts";

export default async function NuevaAppPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  if (!(await findOwnerMembership(me.userId, orgId))) notFound();
  const pagina = `/${orgId}/aplicaciones/nueva`;

  async function crear(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await createCustomApp(actor, orgId, {
      name: formData.get("name")?.toString() ?? "",
      groupName: formData.get("groupName")?.toString() ?? "",
      stages: (formData.get("stages")?.toString() ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    });
    if (!r.ok) redirect(`${pagina}?error=${encodeURIComponent(r.error.message)}`);
    revalidatePath(`/${orgId}`, "layout");
    redirect(`/${orgId}/a/${r.data.key}`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Agregar aplicación</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form action={crear} className="config-form config-form-stack config-card" aria-label="Aplicación nueva">
        <label className="permiso-field">
          <span>Nombre</span>
          <input name="name" required maxLength={40} className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Grupo</span>
          <input name="groupName" required maxLength={30} defaultValue="Operación" className="config-input" />
        </label>
        <label className="permiso-field">
          <span>Etapas (una por renglón)</span>
          <textarea name="stages" required rows={4} defaultValue={"Nuevo\nEn proceso\nTerminado"} className="config-input" />
        </label>
        <button type="submit" className="panel-cta">Crear aplicación</button>
      </form>
    </main>
  );
}
