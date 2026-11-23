// El perfil de la empresa arriba de la barra: abre su configuración (perfil, empresa, otras empresas
// y cerrar sesión). Cambiar de empresa vive ahí, en "Tus empresas".
import Link from "next/link";

export function OrgSwitcher({ current, orgs, logoUrl }: { current: string; orgs: { id: string; name: string }[]; logoUrl: string | null }) {
  const name = orgs.find((o) => o.id === current)?.name ?? "Tu empresa";
  return (
    <Link href={`/${current}/configuracion`} className="shell-org" aria-label={`Configuración de ${name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL del negocio, dominio desconocido para next/image */}
      {logoUrl ? <img src={logoUrl} alt="" className="shell-org-logo" /> : <span className="shell-org-logo" aria-hidden="true" />}
      <span>{name}</span>
    </Link>
  );
}
