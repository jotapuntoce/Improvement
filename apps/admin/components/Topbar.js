"use client";

import { usePathname } from "next/navigation";
import AccentPicker from "./AccentPicker";
import AppIcon from "./AppIcon";

const TITLES = {
  "/": { title: "Dashboard", subtitle: "Resumen general de JotaPuntoCe" },
  "/improvement": { title: "Improvement", subtitle: "Empresa digital · catálogo y productos" },
  "/planos": { title: "Planos", subtitle: "Los proyectos como piezas conectadas · solo lectura" },
  "/company-requests": { title: "Solicitudes", subtitle: "Auto-registro de empresa de tus clientes" },
};

// orgCount llega como prop desde app/layout.js (Server Component) — ya no lee
// localStorage/PRODUCTS_CHANGED_EVENT, esa key quedó huérfana cuando E3-T3 borró
// components/ImprovementCatalog.js. Fuente real: total de `organization` vía Drizzle
// (lib/orgStats.js).
// signOut llega como prop desde app/layout.js — un Server Action puede cruzar a un Client Component
// así, mismo patrón que signIn en app/login/page.js.
export default function Topbar({ orgCount = 0, signOut }) {
  const pathname = usePathname();
  const meta = TITLES[pathname] || { title: "Panel", subtitle: "" };

  return (
    <header className="topbar">
      <div className="topbar-heading">
        {pathname === "/improvement" && (
          <AppIcon size={34} liveCount={orgCount} liveLabel="organización(es)" />
        )}
        <div>
          <h1 className="topbar-title">{meta.title}</h1>
          {meta.subtitle && <p className="topbar-subtitle">{meta.subtitle}</p>}
        </div>
      </div>
      <div className="topbar-actions">
        <AccentPicker />
        <div className="user-chip" title="Jose Carlos">JC</div>
        {signOut && (
          <form action={signOut}>
            <button type="submit" className="topbar-signout">
              Salir
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
