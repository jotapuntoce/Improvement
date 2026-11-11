// Arranque, paso 2 de 4: la marca. El logo se sube a Storage y sus colores pintan todo su Improvement.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findOwnerMembership, getSessionAccessToken, getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { DEFAULT_PICKER, saveBrand } from "@/server/brand/brand.ts";
import { uploadBrandLogo } from "@/server/storage/brand.ts";
import { loadArmado } from "@/server/registro/onboarding.ts";
import { LogoColors } from "@/components/brand/LogoColors.tsx";
import { ARRANQUE_FORM } from "@/components/arranque/armadoDatos.ts";
import { Pregunta } from "@/components/arranque/Pregunta.tsx";
import { ArranqueShell } from "../../ArranqueShell.tsx";

export default async function ArranqueMarca({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  if (!(await findOwnerMembership(me.userId, orgId))) notFound();
  const armado = await loadArmado(me.userId, orgId);
  if (!armado.ok) notFound();
  const siguiente = `/arranque/${orgId}/resultado`;

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

  const { primaryColor, secondaryColor } = armado.data;
  return (
    <ArranqueShell paso={2} armado={armado.data}>
      <form id={ARRANQUE_FORM} action={guardar} className="arr-ask" aria-label="Marca del negocio">
        <Pregunta why="Lo uso para pintar tu Improvement con tus colores.">¿Tienes logo?</Pregunta>
        {error && <p className="arr-error" role="alert">{error}</p>}
        <LogoColors primary={primaryColor ?? DEFAULT_PICKER.primary} secondary={secondaryColor ?? DEFAULT_PICKER.secondary} />
        <div className="arr-row">
          <Link href={siguiente} className="arr-ghost">Todavía no tengo</Link>
          <button type="submit" className="arr-primary">Seguir</button>
        </div>
      </form>
    </ArranqueShell>
  );
}
