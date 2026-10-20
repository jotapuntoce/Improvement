import Link from "next/link";
import { Pagina } from "@/components/SiteHeader.tsx";
import s from "@/components/Sitio.module.css";

export const metadata = { title: "Para Dueños y Emprendedores · Summum System" };

const PERFILES = [
  {
    etiqueta: "Dueños de negocio",
    t: "Tu negocio se estancó, pero sabes lo que puede llegar a ser",
    puntos: [
      "Ya funciona, pero dejó de crecer y no sabes exactamente por qué.",
      "Todo pasa por ti: si te detienes, el negocio se detiene.",
      "Le ves un potencial mucho más grande del que hoy refleja.",
      "Estás dispuesto a que el diagnóstico te incluya a ti y a tu equipo.",
    ],
  },
  {
    etiqueta: "Emprendedores",
    t: "Tienes una idea brillante y necesitas quién te dirija",
    puntos: [
      "Sabes lo que quieres construir, pero no por dónde empezar.",
      "Necesitas dirección, método y gente que ya lo haya hecho.",
      "Quieres hacerlo bien desde el principio, no corregir después.",
      "Buscas una red que te acompañe a traer tu idea a la realidad.",
    ],
  },
];

export default function Duenos() {
  return (
    <Pagina
      activo="/duenos"
      etiqueta="Para Dueños y Emprendedores"
      titulo="Para quien sabe que su negocio puede llegar más alto"
      intro="Summum es para dueños con un negocio estancado que saben que tiene un potencial muy grande, y para emprendedores con ideas brillantes que necesitan quién los dirija para hacerlas realidad."
    >
      <section className={s.seccion}>
        <div className={s.rejilla2}>
          {PERFILES.map((p) => (
            <div key={p.etiqueta} className={s.tarjeta}>
              <span className={s.etiqueta}>{p.etiqueta}</span>
              <h2 className={s.h3}>{p.t}</h2>
              <ul className={s.lista}>
                {p.puntos.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className={`${s.seccion} ${s.plano} ${s.oscura}`}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta}>Lo que pedimos</span>
            <h2 className={s.h2}>Apertura, no perfección</h2>
          </div>
          <p className={s.texto}>
            No necesitas tener todo resuelto para entrar: se entra con potencial y apertura, y se sale con el estándar.
            Lo único que no funciona es un dueño que no acepta el diagnóstico, porque el método llega a la raíz, y la raíz
            también eres tú. Esto ya no lo cargas solo.
          </p>
        </div>
      </section>

      <section className={s.seccion}>
        <div className={s.cierre}>
          <div>
            <h2 className={s.h2}>Que tu negocio ya no dependa solo de ti</h2>
            <p className={s.micro}>Si el diagnóstico dice que no aplicas, te lo decimos.</p>
          </div>
          <Link href="/diagnostico" className={s.boton}>
            Diagnóstico 360 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </Pagina>
  );
}
