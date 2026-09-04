import { redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { loadCompanies } from "@/server/companies/loadCompanies.ts";
import { CompanyPicker } from "./CompanyPicker.tsx";

export default async function EmpresasPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const companies = await loadCompanies(userId);

  return (
    <main className="empresas-page">
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
