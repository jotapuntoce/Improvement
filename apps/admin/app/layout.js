import { Geist, Geist_Mono, Caveat } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { getOrgStats } from "@/lib/orgStats.js";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Solo para el tagline manuscrito de la recepción del edificio (components/building/*) — ver
// .claude/rules/tokens-de-diseno.md, ninguna fuente/hex nuevo se referencia inline, así que se
// declara aquí junto a las otras dos tipografías del producto.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

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
    return (
      <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable}`}>
        <body className="app-shell">
          <div className="app-bg" aria-hidden="true" />
          {children}
        </body>
      </html>
    );
  }

  // Corre en cada ruta autenticada — usa el mismo cliente `db` con service-role de siempre, sin
  // depender de requirePlatformAdmin(), así que es seguro llamarlo aquí. Ver lib/orgStats.js para
  // la definición de "organización activa".
  const { totalOrgs } = await getOrgStats();

  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable}`}>
      <body className="app-shell">
        <div className="app-bg" aria-hidden="true" />
        <Sidebar orgCount={totalOrgs} />
        <div className="app-main">
          <Topbar orgCount={totalOrgs} />
          <main className="app-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
