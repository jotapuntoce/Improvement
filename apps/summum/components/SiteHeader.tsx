// Barra del sitio público (medidas de whop.com). `activo` marca la pestaña actual.
import Link from "next/link";
import s from "./Sitio.module.css";

export const NAV = [
  { label: "Empresas Afiliadas", href: "/afiliadas" },
  { label: "Servicio", href: "/servicio" },
  { label: "Sistema", href: "/servicio#sistema" },
  { label: "Para Dueños y Emprendedores", href: "/duenos" },
] as const;

export function SiteHeader({ activo }: { activo?: string }) {
  return (
    <header className={s.header}>
      <Link href="/" className={s.logo} aria-label="Inicio de Summum System">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG del kit de marca, sin optimizar */}
        <img src="/brand/wordmark-hueso.svg" alt="Summum System" />
      </Link>
      <nav className={s.nav} aria-label="Principal">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={n.href === activo ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className={s.acciones}>
        <Link href="/login" className={s.entrar}>
          Iniciar sesión
        </Link>
        <Link href="/diagnostico" className={s.diagnostico}>
          Diagnóstico 360
        </Link>
      </div>
    </header>
  );
}

// Página interior: barra + portada navy (etiqueta, título, intro) + secciones.
export function Pagina({
  activo,
  etiqueta,
  titulo,
  intro,
  children,
}: {
  activo?: string;
  etiqueta: string;
  titulo: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className={s.pagina}>
      <section className={`${s.portada} ${s.plano}`}>
        <SiteHeader activo={activo} />
        <span className={s.etiqueta}>{etiqueta}</span>
        <h1 className={s.titulo}>{titulo}</h1>
        <p className={s.intro}>{intro}</p>
      </section>
      {children}
    </main>
  );
}
