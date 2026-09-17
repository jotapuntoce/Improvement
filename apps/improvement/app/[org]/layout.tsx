// Un layout para las 7 rutas de [org] (dashboard, mapa, objetivos, equipo, powerups, clientes,
// planos) en vez de repetir el enlace en cada page.tsx. No autentica: cada página ya llama a
// requireOrgMembership() y ese sigue siendo el único guard — esto solo arma un href.
import { BackLink } from "@/components/BackLink.tsx";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <>
      <BackLink href={`/empresas/${org}`} label="Volver al edificio" />
      {children}
    </>
  );
}
