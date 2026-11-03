// Selector de empresa: un <details> nativo, sin estado de cliente.
import Link from "next/link";

export function OrgSwitcher({ current, orgs, logoUrl }: { current: string; orgs: { id: string; name: string }[]; logoUrl: string | null }) {
  const active = orgs.find((o) => o.id === current);
  return (
    <details className="shell-org">
      <summary>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL del negocio, dominio desconocido para next/image */}
        {logoUrl ? <img src={logoUrl} alt="" className="shell-org-logo" /> : <span className="shell-org-logo" aria-hidden="true" />}
        <span>{active?.name ?? "Tu empresa"}</span>
      </summary>
      <ul>
        {orgs.map((o) => (
          <li key={o.id}>
            <Link href={`/${o.id}`} aria-current={o.id === current ? "page" : undefined}>{o.name}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
