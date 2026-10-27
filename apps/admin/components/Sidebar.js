"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppIcon from "./AppIcon";
import { ChequeosIcon, PlanosIcon, ReceptionIcon, SolicitudesIcon } from "./brand/NavIcons.js";

// orgCount llega como prop desde app/layout.js (Server Component) — ya no lee
// localStorage/PRODUCTS_CHANGED_EVENT, esa key quedó huérfana cuando E3-T3 borró
// components/ImprovementCatalog.js. Fuente real: total de `organization` vía Drizzle
// (lib/orgStats.js).
export default function Sidebar({ orgCount = 0 }) {
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: "/", label: "Recepción", sub: "Resumen", Icon: ReceptionIcon },
    { href: "/improvement", label: "Improvement", sub: "Productos", appIcon: true },
    { href: "/planos", label: "Planos", sub: "Expedientes y ensambles", Icon: PlanosIcon },
    { href: "/chequeos", label: "Chequeos", sub: "Del chequeo al cliente", Icon: ChequeosIcon },
    { href: "/company-requests", label: "Solicitudes", sub: "Auto-registro", Icon: SolicitudesIcon },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        {/* Firma del admin elegida por Jose Carlos (manual v1.1): isotipo + wordmark W3 sin hilo, ambos
            archivos reales del kit (Branding/jotapuntoce/assets), nunca redibujados. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-isotipo" src="/brand/isotipo.png" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-wordmark" src="/brand/wordmark-w3-marfil-sin-hilo.svg" alt="JotaPuntoCe" />
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? "nav-item-active" : ""}`}
            >
              {item.appIcon ? (
                <AppIcon size={22} liveCount={orgCount} liveLabel="organización(es)" />
              ) : item.Icon ? (
                <item.Icon className="nav-icon-svg" />
              ) : (
                <span className="nav-icon">{item.icon}</span>
              )}
              <span className="nav-label">
                {item.label}
                <span className="nav-sub">{item.sub}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">Más marcas, próximamente ✨</div>
    </aside>
  );
}
