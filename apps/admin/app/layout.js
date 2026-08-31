import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

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

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="app-shell">
        <div className="app-bg" aria-hidden="true" />
        <Sidebar />
        <div className="app-main">
          <Topbar />
          <main className="app-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
