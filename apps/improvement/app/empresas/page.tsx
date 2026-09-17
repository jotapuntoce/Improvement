// El panel del dueño: quién es, en qué fase va su empresa digital y cómo va cada una de sus
// empresas. Para un platform admin la misma ruta muestra su cartera de clientes — son dos vistas
// distintas del mismo lugar, no dos rutas.
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, isPlatformAdmin } from "@/server/auth/guard.ts";
import { logout } from "@/server/auth/logout.ts";
import { LogoutButton } from "@/components/LogoutButton.tsx";
import { loadClients } from "@/server/companies/loadClients.ts";
import { defaultSelection, loadOwnerPanel } from "@/server/companies/loadOwnerPanel.ts";
import { loadOwnerTasks } from "@/server/tasks/loadOwnerTasks.ts";
import { createCompanyRequest } from "@/server/companyRequests/mutations.ts";
import { CONSTRUCTION_PRICE, formatMoney } from "@/server/billing/payments.ts";
import { ClientPicker } from "./ClientPicker.tsx";
import { OwnerHeader } from "./OwnerHeader.tsx";
import { BuildTracker } from "./BuildTracker.tsx";
import { TrackerDialog } from "./TrackerDialog.tsx";
import { PendingList } from "./PendingList.tsx";
import { CompanyCard } from "./CompanyCard.tsx";
import { RequestCompanyDialog } from "./RequestCompanyDialog.tsx";

async function solicitarEmpresa(formData: FormData) {
  "use server";
  const id = await getSessionUserId();
  if (!id) return;
  const companyName = formData.get("companyName")?.toString().trim();
  if (!companyName) return;
  await createCompanyRequest(id, {
    companyName,
    industry: formData.get("industry")?.toString() || null,
  });
  revalidatePath("/empresas");
}

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const admin = await isPlatformAdmin(userId);

  if (admin) {
    const clients = await loadClients(userId);
    return (
      <main className="empresas-page">
        <LogoutButton action={logout} />
        <h1 className="empresas-title">Mis clientes</h1>
        {clients.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
            Todavía no tienes ningún cliente con empresas activas.
          </p>
        ) : (
          <ClientPicker clients={clients} />
        )}
      </main>
    );
  }

  const [{ profile, companies }, tasks, { empresa }] = await Promise.all([
    loadOwnerPanel(userId),
    loadOwnerTasks(userId),
    searchParams,
  ]);

  // La empresa del tracker: la que el dueño eligió en el selector, y si ese id ya no existe (un
  // enlace viejo, una solicitud aprobada desde entonces) la que toque por default — nunca una
  // pantalla vacía por un parámetro obsoleto.
  const selected = companies.find((c) => c.key === empresa) ?? defaultSelection(companies);

  // El paso actual va escrito en el botón para que el dueño no tenga que abrirlo solo para saber en
  // qué fase va — abrir es para ver el camino completo.
  const stepLabel =
    selected && selected.currentIndex >= 0 && selected.stages.length > 0
      ? `${selected.currentIndex + 1}/${selected.stages.length}`
      : "—";

  return (
    <main className="owner-panel">
      <div className="owner-panel-top">
        {profile && <OwnerHeader profile={profile} />}
        <div className="owner-panel-actions">
          {selected && (
            <TrackerDialog stepLabel={stepLabel}>
              <BuildTracker companies={companies} selected={selected} />
            </TrackerDialog>
          )}
          <LogoutButton action={logout} />
        </div>
      </div>

      <PendingList tasks={tasks} />

      {!selected && (
        <p className="owner-panel-empty">
          Todavía no tienes ninguna empresa. Pide la primera y empezamos a construirla.
        </p>
      )}

      <div className="company-cards">
        {companies.map((c) => (
          <CompanyCard key={c.key} company={c} />
        ))}
      </div>

      <RequestCompanyDialog
        action={solicitarEmpresa}
        priceLabel={formatMoney(CONSTRUCTION_PRICE.amount, CONSTRUCTION_PRICE.currency)}
      />

      <Link href="/empresas/configuracion" className="panel-settings">
        ⚙ Configuración
      </Link>
    </main>
  );
}
