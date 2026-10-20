// Barra y pie del sitio público (medidas de whop.com). `activo` marca la pestaña actual.
import Link from "next/link";
import { LoginModal } from "./LoginModal.tsx";
import s from "./Sitio.module.css";
import { Palabras } from "./Palabras.tsx";

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
        <LoginModal className={s.entrar} />
        <Link href="/diagnostico" className={s.diagnostico}>
          Diagnóstico 360
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={`${s.pie} ${s.plano}`}>
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG del kit de marca, sin optimizar */}
        <img src="/brand/wordmark-hueso.svg" alt="Summum System" />
        <p>Convertimos clientes en comunidad, y comunidad en rentabilidad.</p>
      </div>
      <div>
        <h3>Summum</h3>
        <ul>
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href}>{n.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Empieza</h3>
        <ul>
          <li>
            <Link href="/diagnostico">Diagnóstico 360</Link>
          </li>
          <li>
            <Link href="/login">Iniciar sesión</Link>
          </li>
        </ul>
      </div>
      <div>
        <h3>La marca</h3>
        <ul>
          <li>Un sello solo vale si se puede perder.</li>
        </ul>
      </div>
    </footer>
  );
}

// Página interior: barra + portada navy (etiqueta, título, intro) + secciones + pie.
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
        <span className={s.etiqueta} data-anima="etiqueta">{etiqueta}</span>
        <h1 className={s.titulo} data-anima="titulo"><Palabras texto={titulo} /></h1>
        <p className={s.intro} data-anima="texto">{intro}</p>
      </section>
      {children}
      <SiteFooter />
    </main>
  );
}
