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
import { ImprovementBubble } from "@/components/shell/ImprovementBubble.tsx";
import { ask, jot, listMessages } from "@/server/conversation/agent.ts";

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

  const owner = (await findMembership(userId, org))?.role === "owner";
  const recent = await listMessages(userId, org, 6);

  // La burbuja: quien llama es siempre la sesión, nunca un id que mande el navegador.
  async function apuntar(text: string) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await jot(actor, org, text);
    if (r.ok) revalidatePath(`/${org}`, "layout");
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error.message };
  }
  async function preguntar(text: string) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await ask(actor, org, text);
    return r.ok ? { ok: true as const, message: { id: r.data.id, role: r.data.role, body: r.data.body } } : { ok: false as const, error: r.error.message };
  }

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
      <ImprovementBubble
        orgId={org}
        who={owner ? "Improvement" : "Tu agente"}
        recent={recent.map((m) => ({ id: m.id, role: m.role, body: m.body }))}
        jot={apuntar}
        ask={preguntar}
      />
    </AppShell>
  );
}
