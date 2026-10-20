// Inicio público de Summum: estructura de whop.com (hero con video, avisos, rejilla de funciones,
// misión, pie) con la marca y el contenido de Summum System.
import Link from "next/link";
import { Icono, type NombreIcono } from "./Icono.tsx";
import h from "./Landing.module.css";
import { SiteFooter, SiteHeader } from "./SiteHeader.tsx";
import s from "./Sitio.module.css";
import { Palabras } from "./Palabras.tsx";

const AVISOS: { icono: NombreIcono; t: string; d: string }[] = [
  { icono: "lupa", t: "El Súmmum 360 detectó 3 patógenos en Operación", d: "Procesos que viven en la cabeza del dueño" },
  { icono: "red", t: "Entró la afiliada comercial a tu negocio", d: "Paso 3 de tu roadmap" },
  { icono: "sube", t: "Tus clientes recurrentes subieron 18 %", d: "Contra tu línea base del diagnóstico" },
  { icono: "medalla", t: "Café Altamira ganó su Sello Cénit", d: "Miembro de Summum" },
];

const SISTEMAS: { icono: NombreIcono; t: string; p: string }[] = [
  { icono: "comunidad", t: "Comunidad", p: "Si tus clientes se conocen entre ellos y vuelven por la gente, no solo por el servicio." },
  { icono: "experiencia", t: "Experiencia y marca", p: "Lo que siente alguien desde que te encuentra hasta que se va." },
  { icono: "comercial", t: "Comercial", p: "Cómo llegan, cómo compran y qué tan seguido regresan." },
  { icono: "operacion", t: "Operación", p: "Procesos, horarios y el manual de qué hacer en cada caso." },
  { icono: "talento", t: "Humano y talento", p: "Tu equipo: si se queda, si crece y si puede operar sin ti." },
  { icono: "finanzas", t: "Finanzas", p: "Cuánto vale cada cliente y qué parte del negocio de verdad deja dinero." },
];

const FASES: { icono: NombreIcono; k: string; t: string; p: string }[] = [
  { icono: "lupa", k: "Fase 01 · Primeras semanas", t: "Súmmum 360", p: "La radiografía de los seis sistemas. Recibes tu diagnóstico, la pastilla y tu roadmap." },
  { icono: "matraz", k: "Fase 02 · Mínimo 6 meses", t: "Intervención", p: "Experimentos con datos reales, de adentro hacia afuera. Entran las afiliadas cuando el negocio ya tiene bases." },
  { icono: "medalla", k: "Fase 03 · Cada temporada", t: "Certificación", p: "El sello se gana con métricas sostenidas y se revisa cada temporada." },
];

const SELLO: { icono: NombreIcono; t: string; p: string }[] = [
  { icono: "sube", t: "Se gana", p: "Con métricas reales contra tu línea base." },
  { icono: "ciclo", t: "Se sostiene", p: "Se revisa cada temporada." },
  { icono: "baja", t: "Se pierde", p: "Si el estándar deja de cumplirse." },
];

export function Landing({ video }: { video: boolean }) {
  return (
    <div className={s.pagina}>
      <main className={h.hero}>
        {video && (
          <video className={h.video} src="/brand/hero.mp4" autoPlay muted loop playsInline aria-hidden="true" />
        )}
        <SiteHeader />
        <div className={h.contenido}>
          <h1 className={h.titulo} data-anima="titulo"><Palabras texto="Que tu negocio ya no dependa solo de ti." /></h1>
          <p className={h.sub} data-anima="texto">Convertimos clientes en comunidad, y comunidad en rentabilidad.</p>
          <Link href="/diagnostico" className={h.cta}>
            Diagnóstico 360
          </Link>
        </div>
      </main>

      <section className={`${s.seccion} ${s.plano} ${s.oscura}`}>
        <div className={s.dosCol}>
          <div>
            <span className={s.etiqueta} data-anima="etiqueta">Improvement, el expediente de tu negocio</span>
            <h2 className={s.h2} data-anima="titulo"><Palabras texto="El camino más corto a tu cúspide" /></h2>
            <p data-anima="texto" className={s.texto} style={{ marginTop: 20 }}>
              Todo lo que pasa dentro de tu negocio queda registrado: lo que encontró el diagnóstico, quién entra a
              ayudarte y cómo se mueve cada número contra tu punto de partida.
            </p>
          </div>
          <div className={s.pila} aria-hidden="true">
            {AVISOS.map((a) => (
              <div key={a.t} className={s.aviso}>
                <span className={s.cajaIcono}>
                  <Icono nombre={a.icono} size={24} />
                </span>
                <span>
                  {a.t}
                  <small>{a.d}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.seccion}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta} data-anima="etiqueta">Súmmum 360</span>
            <h2 className={s.h2} data-anima="titulo"><Palabras texto="Los seis sistemas de tu negocio" /></h2>
          </div>
          <div>
            <p data-anima="texto" className={s.texto}>
              El diagnóstico revisa cada esquina. Cada sistema queda sano, inflamado o infectado, y eso fija la línea
              base contra la que se mide todo.
            </p>
            <div className={s.estados}>
              <span className={s.estado} data-estado="sano">Sano</span>
              <span className={s.estado} data-estado="inflamado">Inflamado</span>
              <span className={s.estado} data-estado="infectado">Infectado</span>
            </div>
          </div>
        </div>
        <div className={s.rejilla}>
          {SISTEMAS.map((x) => (
            <div key={x.t} className={s.tarjeta} data-anima="bloque">
              <span className={s.cajaIcono}>
                <Icono nombre={x.icono} />
              </span>
              <h3 className={s.h3}>{x.t}</h3>
              <p>{x.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${s.seccion} ${s.plano} ${s.oscura}`}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta} data-anima="etiqueta">Cómo funciona</span>
            <h2 className={s.h2} data-anima="titulo"><Palabras texto="Tu ruta en tres fases" /></h2>
          </div>
          <p data-anima="texto" className={s.texto}>Llegar a la raíz, no al síntoma. Cada fase se mide contra el punto de partida.</p>
        </div>
        <div className={s.rejilla}>
          {FASES.map((f) => (
            <div key={f.t} className={s.tarjeta} data-anima="bloque">
              <span className={s.cajaIcono}>
                <Icono nombre={f.icono} />
              </span>
              <span className={s.etiqueta} data-anima="etiqueta">{f.k}</span>
              <h3 className={s.h3}>{f.t}</h3>
              <p>{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={s.seccion}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta} data-anima="etiqueta">Mentes maestras</span>
            <h2 className={s.h2} data-anima="titulo"><Palabras texto="Entramos juntos a tu negocio" /></h2>
          </div>
          <p data-anima="texto" className={s.texto}>Uno ve hacia adentro y otro hacia afuera. Uno sin el otro deja el trabajo a la mitad.</p>
        </div>
        <div className={s.rejilla}>
          <div className={s.tarjeta} data-anima="bloque">
            <span className={s.cajaIcono}>
              <Icono nombre="adentro" />
            </span>
            <span className={s.etiqueta} data-anima="etiqueta">Hacia adentro</span>
            <h3 className={s.h3}>Jose Carlos Salinas</h3>
            <p>CO-CEO | Transformación Interna e Innovación. Los patógenos del negocio, la transformación del dueño y del equipo, los procesos.</p>
          </div>
          <div className={s.tarjeta} data-anima="bloque">
            <span className={s.cajaIcono}>
              <Icono nombre="afuera" />
            </span>
            <span className={s.etiqueta} data-anima="etiqueta">Hacia afuera</span>
            <h3 className={s.h3}>Ricardo Ramírez</h3>
            <p>CO-CEO | Alianzas &amp; Conexión. Ventas, eventos, comunidad y la red de contactos que tu negocio necesita.</p>
          </div>
          <Link href="/afiliadas" className={s.tarjeta} data-anima="bloque" style={{ textDecoration: "none", color: "inherit" }}>
            <span className={s.cajaIcono}>
              <Icono nombre="red" />
            </span>
            <span className={s.etiqueta} data-anima="etiqueta">La red</span>
            <h3 className={s.h3}>Empresas afiliadas →</h3>
            <p>Especialistas que entran cuando tu negocio los necesita y sostienen el mismo estándar.</p>
          </Link>
        </div>
      </section>

      <section className={`${s.seccion} ${s.plano} ${s.oscura}`}>
        <div className={s.cabeza}>
          <div>
            <span className={s.etiqueta} data-anima="etiqueta">El Sello Cénit</span>
            <h2 className={s.h2} data-anima="titulo"><Palabras texto="Un sello solo vale si se puede perder" /></h2>
          </div>
          <p data-anima="texto" className={s.texto}>No certifica a quien ya era bueno: certifica lo que construimos juntos.</p>
        </div>
        <div className={s.rejilla}>
          {SELLO.map((x) => (
            <div key={x.t} className={s.tarjeta} data-anima="bloque">
              <span className={s.cajaIcono}>
                <Icono nombre={x.icono} />
              </span>
              <h3 className={s.h3}>{x.t}</h3>
              <p>{x.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={s.seccion}>
        <div className={s.cierre}>
          <div>
            <span className={s.etiqueta} data-anima="etiqueta">Diagnóstico Súmmum 360 · $7,500 MXN</span>
            <h2 className={s.h2} data-anima="titulo"><Palabras texto="Empieza por la radiografía" /></h2>
            <p className={s.micro}>Se abona a tu primer servicio si avanzas. Si el diagnóstico dice que no aplicas, te lo decimos.</p>
          </div>
          <Link href="/diagnostico" className={s.boton}>
            Diagnóstico 360 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
