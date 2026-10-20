import Link from "next/link";
import { Pagina } from "@/components/SiteHeader.tsx";
import s from "@/components/Sitio.module.css";

export const metadata = { title: "Empresas Afiliadas · Summum System" };

// Las afiliadas que ya están dentro. Al sumarse una nueva, se agrega aquí.
const AFILIADAS = [
  { nombre: "Jotapuntoce", area: "Dirección y tecnología", hace: "Dirección general externa, transformación interna del dueño y del negocio, e Improvement: el expediente de cada empresa." },
  { nombre: "CR Consulting", area: "Comercial y conexiones", hace: "Estrategia comercial, eventos, comunidad y la red de networking que hace crecer las ventas." },
  { nombre: "Área jurídica · Founding Partner", area: "Jurídico y cumplimiento", hace: "Contratos, derechos de cada dueño y empleado dentro del sistema, y la base de estándares de Summum." },
];

const PASOS = [
  { t: "Entra por la misma puerta", p: "Una afiliada también es cliente: recorre su propia transformación interna antes de atender a nadie." },
  { t: "Firma el Pacto Summum", p: "Cuerpo, descanso, claridad, orden, hábitos, mente y cumplir. Es requisito para entrar y para seguir dentro." },
  { t: "Se capacita en el método", p: "Aprende cómo se hace Summum para dar un servicio de calidad real, no de catálogo." },
  { t: "Recibe clientes del sistema", p: "Cuando el Súmmum 360 detecta que un negocio necesita su área, entra en el momento justo, uno por uno." },
  { t: "Comparte lo que gana", p: "Por cada cliente que le llega por el sistema paga una comisión del 10 al 30 %. Si se satura, capacita a una sub-afiliada y cobra un porcentaje de lo que ella venda." },
  { t: "Gana su Sello Cénit", p: "El mismo sello que obtiene un negocio. Se gana y se puede perder." },
];

export default function Afiliadas() {
  return (
    <Pagina
      activo="/afiliadas"
      etiqueta="Empresas Afiliadas"
      titulo="Los especialistas que entran cuando tu negocio los necesita"
      intro="Una empresa afiliada es un especialista de la red Summum. Da el servicio en las áreas donde nosotros no somos expertos y entra a tu negocio en el momento en que el diagnóstico dice que hace falta."
    >
      <section className={s.seccion}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta}>Qué es</span>
            <h2 className={s.h2}>Como en un quirófano</h2>
          </div>
          <p className={s.texto}>
            Primero ordenamos el negocio por dentro. Después entra cada especialista a su área, con su método, y se queda
            hasta que el negocio aprende a sostenerlo. Nadie entra antes de tiempo y nadie entra sin el diagnóstico.
          </p>
        </div>
      </section>

      <section className={`${s.seccion} ${s.plano} ${s.oscura}`}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta}>Cómo funciona</span>
            <h2 className={s.h2}>Una red que vale más con cada afiliada</h2>
          </div>
          <p className={s.texto}>Un sello solo vale si se puede perder. Por eso no cualquier empresa pertenece a Summum.</p>
        </div>
        <div className={s.rejilla}>
          {PASOS.map((p, i) => (
            <div key={p.t} className={s.tarjeta}>
              <span className={s.numero}>{String(i + 1).padStart(2, "0")}</span>
              <h3 className={s.h3}>{p.t}</h3>
              <p>{p.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={s.seccion}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta}>Quiénes están dentro</span>
            <h2 className={s.h2}>La primera generación</h2>
          </div>
          <p className={s.texto}>Las afiliadas que hoy forman la red. Cada una recorre el mismo camino que le pedimos a tus clientes.</p>
        </div>
        <div className={s.rejilla}>
          {AFILIADAS.map((a) => (
            <div key={a.nombre} className={s.tarjeta}>
              <span className={s.etiqueta}>{a.area}</span>
              <h3 className={s.h3}>{a.nombre}</h3>
              <p>{a.hace}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={s.seccion}>
        <div className={s.cierre}>
          <h2 className={s.h2}>¿Tu empresa puede ser afiliada?</h2>
          <Link href="/diagnostico" className={s.boton}>
            Empieza con el Diagnóstico 360 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </Pagina>
  );
}
