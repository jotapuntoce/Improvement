// Arranque, paso 2 de 4: la marca. El logo se sube a Storage y sus colores pintan todo su Improvement.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findOwnerMembership, getSessionAccessToken, getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { DEFAULT_PICKER, getBrand, saveBrand } from "@/server/brand/brand.ts";
import { uploadBrandLogo } from "@/server/storage/brand.ts";
import { LogoColors } from "@/components/brand/LogoColors.tsx";

export default async function ArranqueMarca({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  if (!(await findOwnerMembership(me.userId, orgId))) notFound();
  const brand = await getBrand(me.userId, orgId);
  const siguiente = `/arranque/${orgId}/propuesta`;

  async function guardar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    const token = await getSessionAccessToken();
    if (!actor || !token) notFound();
    const back = (message: string) => redirect(`/arranque/${orgId}/marca?error=${encodeURIComponent(message)}`);
    const input: Record<string, string> = {
      primaryColor: formData.get("primaryColor")?.toString() ?? "",
      secondaryColor: formData.get("secondaryColor")?.toString() ?? "",
    };
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      const up = await uploadBrandLogo(actor, orgId, token, logo);
      if (!up.ok) back(up.error.message);
      else input.logoUrl = up.data;
    }
    const r = await saveBrand(actor, orgId, input);
    if (!r.ok) back(r.error.message);
    redirect(siguiente);
  }

  return (
    <main className="config-page auth-page">
      <p className="config-hint">Paso 2 de 4</p>
      <h1 className="config-title">Tu marca</h1>
      <p className="config-hint">Sube tu logo y tomamos sus colores para pintar tu Improvement.</p>
      {error && <p className="invite-error" role="alert">{error}</p>}
      <form action={guardar} className="config-form config-form-stack config-card" aria-label="Marca del negocio">
        <LogoColors primary={brand.primaryColor ?? DEFAULT_PICKER.primary} secondary={brand.secondaryColor ?? DEFAULT_PICKER.secondary} />
        <button type="submit" className="panel-cta">Seguir</button>
      </form>
      <p className="config-hint"><Link href={siguiente}>Saltar este paso</Link></p>
    </main>
  );
}
