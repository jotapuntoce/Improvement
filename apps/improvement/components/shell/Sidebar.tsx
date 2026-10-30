// Barra izquierda al estilo Whop: empresa arriba, los fijos y los grupos de apps con sus enlaces.
import { NavLink } from "./NavLink.tsx";
import type { ReactNode } from "react";

export interface SidebarData {
  orgId: string;
  direccion: boolean;
  /** Solo el dueño ve "Agregar aplicación" y "Automatizaciones". */
  canAddApps: boolean;
  groups: { name: string; apps: { key: string; name: string; href: string }[] }[];
}

export function Sidebar({ data, header, footer }: { data: SidebarData; header: ReactNode; footer?: ReactNode }) {
  return (
    <nav className="shell-sidebar" aria-label="Aplicaciones">
      {header}
      <ul className="shell-fixed">
        <li><NavLink href={`/${data.orgId}`} exact>Inicio</NavLink></li>
        <li><NavLink href={`/${data.orgId}/tareas`}>Tareas</NavLink></li>
        {data.direccion && <li><NavLink href={`/${data.orgId}/direccion`}>Dirección</NavLink></li>}
        <li><NavLink href={`/${data.orgId}/configuracion/marca`}>Tu marca</NavLink></li>
        {data.canAddApps && <li><NavLink href={`/${data.orgId}/aplicaciones/nueva`}>Agregar aplicación</NavLink></li>}
        {data.canAddApps && <li><NavLink href={`/${data.orgId}/automatizaciones`}>Automatizaciones</NavLink></li>}
      </ul>
      {data.groups.map((g) => (
        <details key={g.name} open className="shell-group">
          <summary>{g.name}</summary>
          <ul>
            {g.apps.map((a) => (
              <li key={a.key}><NavLink href={a.href}>{a.name}</NavLink></li>
            ))}
          </ul>
        </details>
      ))}
      {footer}
    </nav>
  );
}
