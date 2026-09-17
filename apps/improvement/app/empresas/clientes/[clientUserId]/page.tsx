import { requirePlatformAdminSession } from "@/server/auth/guard.ts";
import { loadCompanies } from "@/server/companies/loadCompanies.ts";
import { BackLink } from "@/components/BackLink.tsx";
import { CompanyPicker } from "@/app/empresas/CompanyPicker.tsx";

export default async function ClientCompaniesPage({
  params,
}: {
  params: Promise<{ clientUserId: string }>;
}) {
  await requirePlatformAdminSession();
  const { clientUserId } = await params;

  const companies = await loadCompanies(clientUserId);

  return (
    <main className="empresas-page">
      <BackLink href="/empresas" label="Volver a mis clientes" />
      {companies.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Este cliente todavía no tiene ninguna empresa activa.
        </p>
      ) : (
        <CompanyPicker companies={companies} />
      )}
    </main>
  );
}
