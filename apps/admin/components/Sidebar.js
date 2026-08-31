"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getProducts, PRODUCTS_CHANGED_EVENT } from "@/lib/storage";
import AppIcon from "./AppIcon";

export default function Sidebar() {
  const pathname = usePathname();
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    function refresh() {
      const products = getProducts("improvement");
      setActiveCount(products.filter((p) => p.status === "activo").length);
    }
    refresh();
    window.addEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PRODUCTS_CHANGED_EVENT, refresh);
  }, [pathname]);

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
                <AppIcon size={22} liveCount={activeCount} />
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
