// La marca del negocio: logo, portada y colores que pintan todo su Improvement. Solo el dueño la cambia.
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findOwnerMembership, getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { DEFAULT_PICKER, getBrand, saveBrand } from "@/server/brand/brand.ts";

// A nivel de módulo: una Server Action no puede cerrar sobre una función.
function finish(orgId: string, pagina: string, result: { ok: true } | { ok: false; error: { message: string } }): never {
  if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
  // La marca pinta todo el shell del org, no solo esta página.
  revalidatePath(`/${orgId}`, "layout");
  redirect(pagina);
}

const field = (formData: FormData, name: string) => formData.get(name)?.toString().trim() || null;

export default async function MarcaPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const membership = await requireOrgMembership(orgId);
  const isOwner = Boolean(await findOwnerMembership(membership.userId, orgId));
  const brand = await getBrand(membership.userId, orgId);
  const pagina = `/${orgId}/configuracion/marca`;

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    finish(
      orgId,
      pagina,
      await saveBrand(actor, orgId, {
        logoUrl: field(formData, "logoUrl"),
        coverUrl: field(formData, "coverUrl"),
        primaryColor: field(formData, "primaryColor"),
        secondaryColor: field(formData, "secondaryColor"),
      }),
    );
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Tu marca</h1>
      {error && <p className="invite-error" role="alert">{error}</p>}
      {!isOwner && <p className="config-hint">Solo el dueño cambia la marca.</p>}
      {isOwner && (
        <form action={guardar} className="config-form config-form-stack config-card" aria-label="Marca del negocio">
          <label className="permiso-field">
            <span>Logo (dirección de la imagen)</span>
            <input name="logoUrl" type="url" defaultValue={brand.logoUrl ?? ""} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Portada (dirección de la imagen)</span>
            <input name="coverUrl" type="url" defaultValue={brand.coverUrl ?? ""} className="config-input" />
          </label>
          <label className="permiso-field">
            <span>Color principal</span>
            <input name="primaryColor" type="color" defaultValue={brand.primaryColor ?? DEFAULT_PICKER.primary} />
          </label>
          <label className="permiso-field">
            <span>Color secundario</span>
            <input name="secondaryColor" type="color" defaultValue={brand.secondaryColor ?? DEFAULT_PICKER.secondary} />
          </label>
          <button type="submit" className="panel-cta">Guardar marca</button>
        </form>
      )}
    </main>
  );
}
