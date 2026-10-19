import { Geist, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Tipografías del manual de Summum System v1.1: títulos Instrument Sans condensada, texto Geist, datos Geist Mono.
const titulo = Instrument_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--summum-titulo" });
const texto = Geist({ subsets: ["latin"], variable: "--summum-texto" });
const datos = Geist_Mono({ subsets: ["latin"], variable: "--summum-datos" });

export const metadata = { title: "Summum System" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${titulo.variable} ${texto.variable} ${datos.variable}`}>
      <body data-brand="summum">{children}</body>
    </html>
  );
}
