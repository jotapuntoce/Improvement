// Un layout para las 6 rutas de [org] (mapa, objetivos, equipo, powerups, clientes,
// planos) en vez de repetir el enlace en cada page.tsx. No autentica: cada página ya llama a
// requireOrgMembership() y ese sigue siendo el único guard — esto solo arma un href.
// El enlace a Dirección sale de loadDireccionNav, que nunca lanza: sin sesión, sin membresía (un
// platform admin en /planos) o sin ninguna de las cuatro secciones, simplemente no se dibuja.
import Link from "next/link";
import { BackLink } from "@/components/BackLink.tsx";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { loadDireccionNav } from "@/server/direccion/nav.ts";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const userId = await getSessionUserId();
  const direccion = userId ? await loadDireccionNav(userId, org) : [];

  return (
    <>
      <BackLink href={`/empresas/${org}`} label="Volver al edificio" />
      {direccion.length > 0 && (
        <nav aria-label="Dirección" className="direccion-nav">
          <Link href={`/${org}/direccion`} className="jpc-back-link jpc-back-link--fixed">
            Dirección
          </Link>
        </nav>
      )}
      {children}
    </>
  );
}
