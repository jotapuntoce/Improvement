// Un layout para las 6 rutas de [org] (mapa, objetivos, equipo, powerups, clientes,
// planos) en vez de repetir el enlace en cada page.tsx. No autentica: cada página ya llama a
// requireOrgMembership() y ese sigue siendo el único guard — esto solo arma un href.
// El enlace a Dirección sale de loadDireccionNav, que nunca lanza: sin sesión, sin membresía (un
// platform admin en /planos) o sin ninguna de las cuatro secciones, simplemente no se dibuja.
import Link from "next/link";
import { BackLink } from "@/components/BackLink.tsx";
import { z } from "zod";
import { findMembership, getSessionUserId, resolveSection } from "@/server/auth/guard.ts";
import { loadDireccionNav } from "@/server/direccion/nav.ts";
import { loadOrgTheme } from "@/server/companies/theme.ts";
import { OFICINAS_SLUGS, sectionBySlug } from "@/server/permissions/sections.ts";
import { themeStyle } from "@jotapuntoce/ui/theme.ts";

/** Enlaces de Oficinas digitales que esta persona ve. Nunca lanza (mismo criterio que loadDireccionNav). */
async function loadOficinasNav(userId: string, orgId: string): Promise<{ href: string; label: string }[]> {
  if (!z.uuid().safeParse(orgId).success) return [];
  try {
    const m = await findMembership(userId, orgId);
    if (!m) return [];
    const links: { href: string; label: string }[] = [];
    for (const slug of OFICINAS_SLUGS) {
      if ((await resolveSection(userId, orgId, slug)).scope !== "ninguno") {
        links.push({ href: `/${orgId}/${slug}`, label: sectionBySlug(slug)?.label ?? slug });
      }
    }
    if (m.role === "owner") links.push({ href: `/${orgId}/marca`, label: "Marca" });
    return links;
  } catch {
    return [];
  }
}

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
  const oficinas = userId ? await loadOficinasNav(userId, org) : [];
  // Tema propio del org (solo si pasa AA, ver packages/ui/src/theme.ts); null = tokens base.
  const theme = userId ? await loadOrgTheme(userId, org) : null;

  return (
    <div style={theme ? themeStyle(theme) : undefined}>
      {/* En un landmark: axe (regla region) no quiere contenido suelto fuera de ellos. */}
      <nav aria-label="Regresar">
        <BackLink href={`/empresas/${org}`} label="Volver al edificio" />
      </nav>
      {direccion.length > 0 && (
        <nav aria-label="Dirección" className="direccion-nav">
          <Link href={`/${org}/direccion`} className="jpc-back-link jpc-back-link--fixed">
            Dirección
          </Link>
        </nav>
      )}
      {oficinas.length > 0 && (
        <nav aria-label="Oficinas digitales" className="oficinas-nav">
          {oficinas.map((l) => (
            <Link key={l.href} href={l.href} className="jpc-back-link">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}
