// Los tipos de permiso de la empresa. Solo dueño — un empleado que llegue por URL recibe 404, no un
// 403 (mismo criterio que todo el resto del guard).
//
// Sin "use client": son <form> nativos con Server Actions, igual que /[org]/clientes y
// /empresas/configuracion — de ahí saca esta pantalla sus clases (config-page, config-card,
// config-input, panel-cta, panel-btn-ghost): config-btn/config-section/config-input "planos" no
// existen en globals.css, los reales son estos.
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgMembership } from "@/server/auth/guard";
import {
  createPermissionType,
  deletePermissionType,
  listPermissionTypes,
  updatePermissionType,
} from "@/server/permissions/mutations";
import { SECTIONS } from "@/server/permissions/sections";

const SCOPE_LABEL: Record<string, string> = {
  empresa: "Toda la empresa",
  area: "Solo su área",
  propio: "Solo lo suyo",
  ninguno: "No lo ve",
};

function readGrants(formData: FormData): Record<string, string> {
  const grants: Record<string, string> = {};
  for (const section of SECTIONS) {
    grants[section.slug] = formData.get(`grant-${section.slug}`)?.toString() ?? "ninguno";
  }
  return grants;
}

export default async function PermisosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const member = await requireOrgMembership(orgId);
  if (member.role !== "owner") notFound();

  const tipos = await listPermissionTypes(orgId);

  async function agregar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    await createPermissionType(
      row.userId,
      orgId,
      formData.get("name")?.toString() ?? "",
      readGrants(formData),
    );
    revalidatePath(`/${orgId}/equipo/permisos`);
  }

  async function guardar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const typeId = formData.get("typeId")?.toString();
    if (!typeId) return;
    await updatePermissionType(
      row.userId,
      orgId,
      typeId,
      formData.get("name")?.toString() ?? "",
      readGrants(formData),
    );
    revalidatePath(`/${orgId}/equipo/permisos`);
  }

  async function borrar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const typeId = formData.get("typeId")?.toString();
    if (!typeId) return;
    await deletePermissionType(row.userId, orgId, typeId);
    revalidatePath(`/${orgId}/equipo/permisos`);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Tipos de permiso</h1>
      <p className="config-hint">
        Tú decides qué ve cada puesto de tu empresa. Ponles los nombres que usas de verdad. Tú siempre
        ves todo; quien no tenga un tipo asignado no ve nada.
      </p>

      {tipos.map((tipo) => (
        <form key={tipo.id} action={guardar} className="config-card permiso-card">
          <input type="hidden" name="typeId" value={tipo.id} />
          <input
            name="name"
            defaultValue={tipo.name}
            aria-label={`Nombre del tipo ${tipo.name}`}
            className="config-input"
          />
          <div className="permiso-grid">
            {SECTIONS.map((section) => (
              <label key={section.slug} className="permiso-field">
                <span>{section.label}</span>
                <select
                  name={`grant-${section.slug}`}
                  defaultValue={tipo.grants[section.slug] ?? "ninguno"}
                  className="config-input"
                >
                  {[...section.scopes, "ninguno"].map((scope) => (
                    <option key={scope} value={scope}>
                      {SCOPE_LABEL[scope]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="permiso-actions">
            <button type="submit" className="panel-cta">
              Guardar
            </button>
            <button type="submit" formAction={borrar} className="panel-btn-ghost config-btn--danger">
              Borrar
            </button>
          </div>
        </form>
      ))}

      <form action={agregar} className="config-card permiso-card permiso-card--new">
        <input
          name="name"
          placeholder="Nombre del tipo nuevo (ej. Jefe de obra)"
          required
          className="config-input"
        />
        <div className="permiso-grid">
          {SECTIONS.map((section) => (
            <label key={section.slug} className="permiso-field">
              <span>{section.label}</span>
              <select name={`grant-${section.slug}`} defaultValue="ninguno" className="config-input">
                {[...section.scopes, "ninguno"].map((scope) => (
                  <option key={scope} value={scope}>
                    {SCOPE_LABEL[scope]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button type="submit" className="panel-cta">
          Crear tipo
        </button>
      </form>
    </main>
  );
}
