import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata = {
  title: "JotaPuntoCe · Panel Administrativo",
  description: "Panel administrativo de JotaPuntoCe — gestión de Improvement y futuras marcas.",
};

export default async function RootLayout({ children }) {
  // Corre en cada ruta, incluida /login (sin sesión todavía) — usa el mismo cliente `db` con
  // service-role de siempre, sin depender de requirePlatformAdmin(), así que es seguro llamarlo
  // aquí. Ver lib/orgStats.js para la definición de "organización activa".
  const { totalOrgs } = await getOrgStats();

  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
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
