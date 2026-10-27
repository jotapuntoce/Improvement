import Link from "next/link";

// Carpeta de un proyecto en /planos. Cada proyecto se viste con su propio estilo: la clase
// carpeta-<estilo> (app/globals.css) trae sus colores y su firma. Un proyecto sin estilo propio usa
// el neutro. Estilos nuevos: se agregan en globals.css al crear el primer expediente del proyecto.
const FIRMAS = {
  jotapuntoce: "/brand/isotipo.png",
};

export default function Carpeta({ slug, nombre, estilo, descripcion, total }) {
  const firma = FIRMAS[estilo];
  return (
    <Link href={`/planos/${slug}`} className={`carpeta carpeta-${estilo ?? "neutro"}`}>
      <span className="carpeta-pestana" aria-hidden="true" />
      <span className="carpeta-cuerpo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {firma && <img className="carpeta-firma" src={firma} alt="" />}
        <span className="carpeta-nombre">{nombre}</span>
        <span className="carpeta-desc">{descripcion}</span>
        <span className="carpeta-total">
          {total} {total === 1 ? "expediente" : "expedientes"}
        </span>
      </span>
    </Link>
  );
}
