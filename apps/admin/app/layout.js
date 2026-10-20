import { Caveat, Inter_Tight } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { getOrgStats } from "@/lib/orgStats.js";
import { signOut } from "./logout/actions.js";

// Solo para el tagline manuscrito de la recepción del edificio (components/building/*) — ver
// .claude/rules/tokens-de-diseno.md, ninguna fuente/hex nuevo se referencia inline, así que se
// declara aquí junto a las otras dos tipografías del producto.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

// Inter Tight 300–600 es la tipografía de la marca JotaPuntoCe (manual de marca v1): todo el panel.
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

// data-brand activa el remapeo de tokens a la marca madre (packages/ui/src/tokens.css).
const fontVars = `${caveat.variable} ${interTight.variable}`;

export const metadata = {
  title: "JotaPuntoCe · Panel Administrativo",
  description: "Panel administrativo de JotaPuntoCe — gestión de Improvement y futuras marcas.",
};

export default async function RootLayout({ children }) {
  // /login es la única ruta pública (blueprint "route protection") y ahora es en sí misma la
  // experiencia del edificio + recepción — el Sidebar/Topbar del panel (con conteos reales de
  // organizaciones) no debe asomarse detrás de esa escena. x-pathname lo pone middleware.js; sin
  // él (build estático, tests) isLoginRoute cae a false y el layout se comporta como siempre.
  const headerList = await headers();
  const isLoginRoute = headerList.get("x-pathname") === "/login";

  if (isLoginRoute) {
    // .app-shell (display:flex en fila, pensado para Sidebar+Topbar) no aplica aquí: .jl-root
    // (app/login/login.css) ocupa la pantalla completa con su propio fondo, sin scroll.
    return (
      <html lang="es" data-brand="jotapuntoce" className={fontVars}>
        <body>{children}</body>
      </html>
    );
  }

  // Corre en cada ruta autenticada — usa el mismo cliente `db` con service-role de siempre, sin
  // depender de requirePlatformAdmin(), así que es seguro llamarlo aquí. Ver lib/orgStats.js para
  // la definición de "organización activa".
  const { totalOrgs } = await getOrgStats();

  return (
    <html lang="es" data-brand="jotapuntoce" className={fontVars}>
      <body className="app-shell">
        <Sidebar orgCount={totalOrgs} />
        <div className="app-main">
          <Topbar orgCount={totalOrgs} signOut={signOut} />
          <main className="app-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
