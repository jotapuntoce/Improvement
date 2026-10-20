import { Pagina } from "@/components/SiteHeader.tsx";
import s from "@/components/Sitio.module.css";
import { errorMessage } from "@/server/error-codes.ts";
import { solicitarDiagnostico } from "./actions.ts";

export const metadata = { title: "Diagnóstico Súmmum 360 · Summum System" };

const RECIBES = [
  "La radiografía de los seis sistemas de tu negocio: sano, inflamado o infectado.",
  "Los patógenos que hoy lo frenan: la raíz, no el síntoma.",
  "La pastilla que cura cada dolor y tu roadmap dentro de Summum.",
  "La línea base contra la que se mide toda tu mejora.",
];

export default async function Diagnostico({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = errorMessage((await searchParams).error);
  return (
    <Pagina
      etiqueta="Diagnóstico Súmmum 360"
      titulo="Empieza por la radiografía"
      intro="Revisamos cada esquina de tu negocio para encontrar la raíz de lo que lo frena y trazar tu ruta hasta la cúspide."
    >
      <section id="solicitar" className={s.seccion}>
        <div className={s.cabeza} style={{ alignItems: "start" }}>
          <div>
            <span className={s.etiqueta}>Inversión</span>
            <p className={s.precio}>$7,500 MXN</p>
            <p className={s.texto} style={{ marginTop: 16 }}>
              Si después del diagnóstico avanzas con tu mejora interna y externa, los $7,500 se abonan a tu primer
              servicio.
            </p>
            <ul className={s.lista} style={{ marginTop: 24 }}>
              {RECIBES.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className={s.micro}>Si el diagnóstico dice que no aplicas, te lo decimos.</p>
          </div>
          <form action={solicitarDiagnostico} className={`${s.tarjeta} ${s.formulario}`}>
            <span className={s.etiqueta}>Cuéntanos de tu negocio</span>
            <label className={s.campo}>
              Tu nombre
              <input name="nombre" autoComplete="name" required maxLength={120} />
            </label>
            <label className={s.campo}>
              Tu negocio o idea
              <input name="negocio" autoComplete="organization" required maxLength={160} />
            </label>
            <label className={s.campo}>
              Correo
              <input name="correo" type="email" autoComplete="email" required maxLength={200} />
            </label>
            <label className={s.campo}>
              Teléfono
              <input name="telefono" type="tel" autoComplete="tel" required minLength={8} maxLength={30} />
            </label>
            <label className={s.campo}>
              Eres
              <select name="perfil" required defaultValue="dueno">
                <option value="dueno">Dueño de un negocio</option>
                <option value="emprendedor">Emprendedor con una idea</option>
              </select>
            </label>
            <label className={s.campo}>
              ¿Qué sientes que hoy frena tu negocio?
              <textarea name="frena" required maxLength={480} />
            </label>
            {error && <p className={s.error}>{error}</p>}
            <button type="submit" className={s.boton}>
              Pagar y agendar mi diagnóstico <span aria-hidden="true">→</span>
            </button>
            <p className={s.micro}>El pago se hace en Stripe. Después te contactamos para agendar.</p>
          </form>
        </div>
      </section>
    </Pagina>
  );
}
