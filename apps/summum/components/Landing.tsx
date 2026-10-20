// Inicio público de Summum: réplica del hero de whop.com con la marca Summum System.
import Link from "next/link";
import s from "./Landing.module.css";
import { SiteHeader } from "./SiteHeader.tsx";

export function Landing() {
  return (
    <main className={s.hero}>
      <SiteHeader />
      <div className={s.contenido}>
        <h1 className={s.titulo}>Que tu negocio ya no dependa solo de ti.</h1>
        <p className={s.sub}>Convertimos clientes en comunidad, y comunidad en rentabilidad.</p>
        <Link href="/diagnostico" className={s.cta}>
          Diagnóstico 360
        </Link>
      </div>
    </main>
  );
}
