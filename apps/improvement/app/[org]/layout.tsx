// El shell de todo el negocio: barra izquierda con empresas, apps visibles, Dirección y vista previa,
// y el centro con la marca del negocio. No autentica: cada página sigue llamando su guard. Sin
// sesión o sin membresía (un platform admin en /planos) se dibuja solo el contenido.
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findMembership, getPreviewGrants, getSessionUserId } from "@/server/auth/guard.ts";
import { setPreview } from "@/server/auth/preview.ts";
import { loadSidebar } from "@/server/apps/sidebar.ts";
import { brandStyle, getBrand } from "@/server/brand/brand.ts";
import { loadDireccionNav } from "@/server/direccion/nav.ts";
import { AppShell } from "@/components/shell/AppShell.tsx";
import { Sidebar } from "@/components/shell/Sidebar.tsx";
import { OrgSwitcher } from "@/components/shell/OrgSwitcher.tsx";
import { PreviewAs } from "@/components/shell/PreviewAs.tsx";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const userId = await getSessionUserId();
  if (!userId || !UUID.test(org) || !(await findMembership(userId, org))) return <>{children}</>;

  const [sidebar, brand, direccion] = await Promise.all([
    loadSidebar(userId, org, await getPreviewGrants(org)),
    getBrand(userId, org),
    loadDireccionNav(userId, org),
  ]);

  async function verComo(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    await setPreview(actor, org, formData.get("permissionTypeId")?.toString() || null);
    revalidatePath(`/${org}`, "layout");
  }

  return (
    <AppShell
      style={brandStyle(brand)}
      sidebar={
        <Sidebar
          data={{ orgId: org, direccion: direccion.length > 0, canAddApps: sidebar.permissionTypes !== null, groups: sidebar.groups }}
          header={<OrgSwitcher current={org} orgs={sidebar.orgs} logoUrl={brand.logoUrl} />}
          footer={sidebar.permissionTypes && sidebar.permissionTypes.length > 0 ? <PreviewAs types={sidebar.permissionTypes} action={verComo} /> : undefined}
        />
      }
    >
      {children}
    </AppShell>
  );
}
