"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppIcon from "./AppIcon";

// orgCount llega como prop desde app/layout.js (Server Component) — ya no lee
// localStorage/PRODUCTS_CHANGED_EVENT, esa key quedó huérfana cuando E3-T3 borró
// components/ImprovementCatalog.js. Fuente real: total de `organization` vía Drizzle
// (lib/orgStats.js).
export default function Sidebar({ orgCount = 0 }) {
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: "/", label: "Dashboard", sub: "Resumen", icon: "◈" },
    { href: "/improvement", label: "Improvement", sub: "Productos", appIcon: true },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">JC</div>
        <div>
          <div className="brand-name">JotaPuntoCe</div>
          <div className="brand-sub">Panel Administrativo</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? "nav-item-active" : ""}`}
            >
              {item.appIcon ? (
                <AppIcon size={22} liveCount={orgCount} liveLabel="organización(es)" />
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
