// Inicio público de Summum: réplica del hero de whop.com con la marca Summum System.
import s from "./Landing.module.css";
import Link from "next/link";

// ponytail: anclas provisionales; cada pestaña tendrá su página cuando exista su contenido.
const NAV = [
  { label: "Empresas Afiliadas", href: "#afiliadas" },
  { label: "Servicio", href: "#servicio" },
  { label: "Sistema", href: "#sistema" },
  { label: "Para Dueños y Emprendedores", href: "#duenos" },
];

export function Landing() {
  return (
    <main className={s.hero}>
      <header className={s.header}>
        <Link href="/" className={s.logo} aria-label="Summum System">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG del kit de marca, sin optimizar */}
          <img src="/brand/wordmark-hueso.svg" alt="Summum System" />
        </Link>
        <nav className={s.nav} aria-label="Principal">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className={s.acciones}>
          <a href="/login" className={s.entrar}>
            Iniciar sesión
          </a>
          <a href="/diagnostico" className={s.comenzar}>
            Comenzar
          </a>
        </div>
      </header>
      <div className={s.contenido}>
        <h1 className={s.titulo}>Que tu negocio ya no dependa solo de ti.</h1>
        <p className={s.sub}>Convertimos clientes en comunidad, y comunidad en rentabilidad.</p>
        <a href="/diagnostico" className={s.cta}>
          Comenzar
        </a>
      </div>
    </main>
  );
}
