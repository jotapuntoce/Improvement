// Barra izquierda al estilo Whop: empresa arriba, los fijos y los grupos de apps con sus enlaces.
import Link from "next/link";
import type { ReactNode } from "react";

export interface SidebarData {
  orgId: string;
  direccion: boolean;
  groups: { name: string; apps: { key: string; name: string; href: string }[] }[];
}

export function Sidebar({ data, header, footer }: { data: SidebarData; header: ReactNode; footer?: ReactNode }) {
  return (
    <nav className="shell-sidebar" aria-label="Aplicaciones">
      {header}
      <ul className="shell-fixed">
        <li><Link href={`/${data.orgId}`}>Inicio</Link></li>
        {data.direccion && <li><Link href={`/${data.orgId}/direccion`}>Dirección</Link></li>}
        <li><Link href={`/${data.orgId}/configuracion/marca`}>Tu marca</Link></li>
      </ul>
      {data.groups.map((g) => (
        <details key={g.name} open className="shell-group">
          <summary>{g.name}</summary>
          <ul>
            {g.apps.map((a) => (
              <li key={a.key}><Link href={a.href}>{a.name}</Link></li>
            ))}
          </ul>
        </details>
      ))}
      {footer}
    </nav>
  );
}
