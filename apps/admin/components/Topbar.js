"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AccentPicker from "./AccentPicker";
import AppIcon from "./AppIcon";
import { getProducts, PRODUCTS_CHANGED_EVENT } from "@/lib/storage";

const TITLES = {
  "/": { title: "Dashboard", subtitle: "Resumen general de JotaPuntoCe" },
  "/improvement": { title: "Improvement", subtitle: "Empresa digital · catálogo y productos" },
};

export default function Topbar() {
  const pathname = usePathname();
  const meta = TITLES[pathname] || { title: "Panel", subtitle: "" };
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

  return (
    <header className="topbar">
      <div className="topbar-heading">
        {pathname === "/improvement" && <AppIcon size={34} liveCount={activeCount} />}
        <div>
          <h1 className="topbar-title">{meta.title}</h1>
          {meta.subtitle && <p className="topbar-subtitle">{meta.subtitle}</p>}
        </div>
      </div>
      <div className="topbar-actions">
        <AccentPicker />
        <div className="user-chip" title="Jose Carlos">JC</div>
      </div>
    </header>
  );
}
