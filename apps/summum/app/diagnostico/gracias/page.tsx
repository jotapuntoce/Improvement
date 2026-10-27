import Link from "next/link";
import { Pagina } from "@/components/SiteHeader.tsx";
import s from "@/components/Sitio.module.css";

export const metadata = { title: "Gracias · Summum System" };

export default function Gracias() {
  return (
    <Pagina
      etiqueta="Diagnóstico Súmmum 360"
      titulo="Bienvenido. Esto ya no lo cargas solo."
      intro="Recibimos tu pago. Te escribimos en las próximas horas para agendar tu diagnóstico y conocer a fondo tu negocio."
    >
      <section className={s.seccion}>
        <div className={s.cierre}>
          <p data-anima="texto" className={s.texto}>
            Si después del diagnóstico avanzas con tu mejora interna y externa, los $7,500 se abonan a tu primer servicio.
          </p>
          <Link href="/servicio" className={s.boton}>
            Conoce la ruta <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </Pagina>
  );
}
