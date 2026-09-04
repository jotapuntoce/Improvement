import { redirect } from "next/navigation";
import { getSessionUserId, isPlatformAdmin } from "@/server/auth/guard.ts";
import { loadCompanies } from "@/server/companies/loadCompanies.ts";
import { loadClients } from "@/server/companies/loadClients.ts";
import { CompanyPicker } from "./CompanyPicker.tsx";
import { ClientPicker } from "./ClientPicker.tsx";
import { PersonalizeAvatar } from "./PersonalizeAvatar.tsx";

export default async function EmpresasPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const admin = await isPlatformAdmin(userId);

  if (admin) {
    const clients = await loadClients(userId);
    return (
      <main className="empresas-page">
        <PersonalizeAvatar />
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

  const companies = await loadCompanies(userId);
  return (
    <main className="empresas-page">
      <PersonalizeAvatar />
      {companies.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Todavía no tienes ninguna empresa asignada.
        </p>
      ) : (
        <CompanyPicker companies={companies} />
      )}
    </main>
  );
}
