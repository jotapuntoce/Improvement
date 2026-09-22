// Un layout para todas las rutas de [org] en vez de repetir el enlace en cada page.tsx. No
// autentica: cada página ya llama a requireOrgMembership() y ese sigue siendo el único guard —
// esto solo arma un href y monta la burbuja.
//
// La burbuja va AQUÍ y no en cada pantalla: el Director tiene que estar en todas, y montarlo una
// vez por página sería nueve lugares donde olvidarlo. Se monta sin preguntar nada a la base — se
// autoriza sola al primer fetch, así que un layout no autenticado no filtra nada.
import { BackLink } from "@/components/BackLink.tsx";
import { DirectorBubble } from "@/components/DirectorBubble.tsx";

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
      <DirectorBubble orgId={org} />
    </>
  );
}
