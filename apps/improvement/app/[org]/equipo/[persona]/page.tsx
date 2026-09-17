// La ficha de una persona del equipo: dónde el dueño le cambia el acceso o la da de baja.
//
// Solo dueño. Quien no lo sea recibe 404 — findTeamMemberForOwner devuelve null tanto si quien
// pregunta no es el dueño como si esa persona no es de su equipo, así que la pantalla no distingue
// los dos casos y no delata que ese id exista en otra empresa.
//
// Sin "use client": <form> nativos con Server Actions, y las clases reales de globals.css que ya usa
// /[org]/equipo/permisos (config-page, config-card, config-input, panel-cta, panel-btn-ghost).
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgMembership } from "@/server/auth/guard";
import { findTeamMemberForOwner } from "@/server/employees/responsibility";
import { removeMembership, updateMembership } from "@/server/employees/mutations";
import { listPermissionTypes } from "@/server/permissions/mutations";
import { listAreasByOrg } from "@/server/areas/listAreas.ts";
import { redirect } from "next/navigation";

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ org: string; persona: string }>;
}) {
  const { org: orgId, persona: targetUserId } = await params;
  const member = await requireOrgMembership(orgId);
  const ficha = await findTeamMemberForOwner(member.userId, orgId, targetUserId);
  if (!ficha) notFound();

  const [tipos, areasPorOrg] = await Promise.all([
    listPermissionTypes(orgId),
    listAreasByOrg([orgId]),
  ]);
  const areas = areasPorOrg.get(orgId) ?? [];
  const esDueno = ficha.role === "owner";

  async function guardar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    await updateMembership(row.userId, orgId, targetUserId, {
      permissionTypeId: formData.get("permissionTypeId")?.toString() || null,
      areaId: formData.get("areaId")?.toString() || null,
      jobTitle: formData.get("jobTitle")?.toString() ?? "",
    });
    revalidatePath(`/${orgId}/equipo/${targetUserId}`);
    revalidatePath(`/${orgId}/equipo`);
  }

  async function darDeBaja() {
    "use server";
    const row = await requireOrgMembership(orgId);
    const result = await removeMembership(row.userId, orgId, targetUserId);
    if (!result.ok) return;
    revalidatePath(`/${orgId}/equipo`);
    redirect(`/${orgId}/equipo`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">{ficha.fullName ?? ficha.email}</h1>
      <p className="config-hint">
        {ficha.email}
        {ficha.responsibilities ? ` · ${ficha.responsibilities}` : ""}
      </p>

      {esDueno ? (
        <div className="config-card">
          <p className="config-hint">
            Es el dueño de la empresa: ve todo por regla y no se le puede cambiar el acceso ni dar de
            baja.
          </p>
        </div>
      ) : (
        <>
          <form action={guardar} className="config-card">
            <label className="permiso-field">
              <span>Qué puede ver</span>
              <select name="permissionTypeId" defaultValue={ficha.permissionTypeId ?? ""} className="config-input">
                <option value="">Sin tipo — no ve nada</option>
                {tipos.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="permiso-field">
              <span>Su área</span>
              <select name="areaId" defaultValue={ficha.areaId ?? ""} className="config-input">
                <option value="">Sin área</option>
                {areas.map((areaOption) => (
                  <option key={areaOption.id} value={areaOption.id}>
                    {areaOption.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="permiso-field">
              <span>Su puesto</span>
              <input name="jobTitle" defaultValue={ficha.jobTitle ?? ""} required className="config-input" />
            </label>

            <p className="config-hint">
              El cambio aplica de inmediato: en su siguiente clic verá lo que le acabas de dar.
            </p>

            <div className="permiso-actions">
              <button type="submit" className="panel-cta">
                Guardar
              </button>
            </div>
          </form>

          <form action={darDeBaja} className="config-card">
            <h2 className="config-card-title">Dar de baja</h2>
            <p className="config-hint">
              Sale de esta empresa y deja de ver todo. Los objetivos que tenga asignados no se borran:
              quedan sin responsable para que se los pases a alguien más. Si también trabaja en otra
              de tus empresas, allá no cambia nada.
            </p>
            <div className="permiso-actions">
              <button type="submit" className="panel-btn-ghost config-btn--danger">
                Dar de baja a {ficha.fullName ?? ficha.email}
              </button>
            </div>
          </form>
        </>
      )}

      <Link href={`/${orgId}/equipo`}>← Volver al equipo</Link>
    </main>
  );
}
