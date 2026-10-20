import Link from "next/link";
import { Pagina } from "@/components/SiteHeader.tsx";
import s from "@/components/Sitio.module.css";

export const metadata = { title: "Servicio · Summum System" };

const SISTEMAS = [
  { t: "Comunidad", p: "Qué tan conectados están tus clientes entre sí y entre las áreas de tu servicio." },
  { t: "Experiencia y marca", p: "Qué se vive al entrar y qué se recuerda al salir; si lo que prometes es lo que entregas." },
  { t: "Comercial", p: "Cómo llega gente nueva, cómo se cierra la venta y qué tanto se cruza." },
  { t: "Operación", p: "Flujo, horarios, uso del espacio y los procesos que hoy viven en tu cabeza." },
  { t: "Humano y talento", p: "La gente detrás de cada puesto: enfoque, bienestar, rotación y quién es dueño de cada función." },
  { t: "Finanzas", p: "De dónde sale el dinero, qué cliente vuelve, cuánto vale y cuánto cuesta." },
];

const RUTA = [
  { t: "Mentes maestras", p: "Dos socios entran juntos a tu negocio: uno ve hacia adentro (dirección, operación, tu transformación) y otro hacia afuera (ventas, comunidad, conexiones). Uno sin el otro deja el trabajo a la mitad." },
  { t: "Diagnóstico Súmmum 360", p: "Revisamos cada esquina de tu negocio y detectamos sus patógenos actuales: la raíz de lo que lo frena, no el síntoma." },
  { t: "Roadmap de solución", p: "Recibes tu dolor, la pastilla que lo cura y tu ruta dentro de Summum, paso por paso, hasta la cúspide." },
  { t: "Estandarización", p: "Llevamos tu negocio al sistema Summum: procesos escritos, métricas contra tu línea base y un estándar propio de experiencia del cliente que ya no depende solo de ti." },
  { t: "Certificación", p: "Cuando sostienes la mejora, ganas el Sello Cénit. Es lo que tus clientes ven en la puerta, y se puede perder." },
  { t: "Conexión de clientes y red de apoyo", p: "Conectamos a tus clientes en comunidad y te rodeamos de empresas afiliadas y de otros dueños que van subiendo contigo." },
];

export default function Servicio() {
  return (
    <Pagina
      activo="/servicio"
      etiqueta="Servicio"
      titulo="De la raíz de tu negocio a su cúspide"
      intro="Entramos a tu negocio con mentes maestras, empezamos por un diagnóstico que llega a la raíz y te acompañamos hasta que tu negocio llegue al Summum, junto con toda la red."
    >
      <section className={s.seccion}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta}>Lo que hacemos</span>
            <h2 className={s.h2}>Seis pasos, una sola ruta</h2>
          </div>
          <p className={s.texto}>
            Llegar a la raíz, no al síntoma. Cada paso alimenta al siguiente y todo se mide contra el punto de partida que
            fija el diagnóstico.
          </p>
        </div>
        <div className={s.rejilla}>
          {RUTA.map((r, i) => (
            <div key={r.t} className={s.tarjeta}>
              <span className={s.numero}>{String(i + 1).padStart(2, "0")}</span>
              <h3 className={s.h3}>{r.t}</h3>
              <p>{r.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="sistema" className={`${s.seccion} ${s.plano} ${s.oscura}`}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta}>El sistema Summum · Súmmum 360</span>
            <h2 className={s.h2}>Los seis sistemas de tu negocio</h2>
          </div>
          <p className={s.texto}>
            Cada sistema queda sano, inflamado o infectado. Esa radiografía es la línea base contra la que se mide todo lo
            que hacemos después.
          </p>
        </div>
        <div className={s.rejilla}>
          {SISTEMAS.map((x, i) => (
            <div key={x.t} className={s.tarjeta}>
              <span className={s.numero}>{String(i + 1).padStart(2, "0")}</span>
              <h3 className={s.h3}>{x.t}</h3>
              <p>{x.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={s.seccion}>
        <div className={s.cierre}>
          <div>
            <h2 className={s.h2}>Empieza por la radiografía</h2>
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
