// Carpeta de un proyecto: sus expedientes de proceso (skill documentar-proceso), del más reciente al
// más viejo, cada uno con su antes/después y sus archivos.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth.js";
import { getProyecto, listProcesos } from "@/lib/procesos.js";

const archivo = (proyecto, carpeta, ruta) => `/planos/archivo/${proyecto}/${carpeta}/${ruta}`;

export default async function CarpetaProyectoPage({ params }) {
  await requirePlatformAdmin();
  const { proyecto: slug } = await params;
  const proyecto = getProyecto(slug);
  if (!proyecto) notFound();
  const procesos = listProcesos(slug);

  return (
    <div className={`page-stack carpeta-pagina carpeta-${proyecto.estilo ?? "neutro"}`}>
      <section>
        <Link href="/planos" className="page-back-link">
          ← Planos
        </Link>
        <h2 className="carpeta-pagina-titulo">{proyecto.nombre}</h2>
        <p className="topbar-subtitle">{proyecto.descripcion}</p>
      </section>

      {procesos.length === 0 && <p className="topbar-subtitle">Esta carpeta todavía no tiene expedientes.</p>}

      {procesos.map((p) => {
        const pdf = archivo(slug, p.carpeta, `${p.slug}-expediente.pdf`);
        return (
          <article key={p.carpeta} className="expediente">
            <header className="expediente-head">
              <div>
                <p className="expediente-fecha">{p.fecha}</p>
                <h3 className="expediente-titulo">{p.pieza}</h3>
                <p className="expediente-resumen">{p.resumen}</p>
              </div>
              <div className="expediente-acciones">
                <a className="btn btn-primary" href={pdf} target="_blank" rel="noopener noreferrer">
                  Ver expediente
                </a>
                <a className="btn btn-ghost" href={archivo(slug, p.carpeta, "bitacora.md")} target="_blank" rel="noopener noreferrer">
                  Bitácora
                </a>
              </div>
            </header>

            <div className="expediente-antes-despues">
              {[
                ["Antes", p.antes?.[0]],
                ["Después", p.despues?.[0]],
              ].map(([etiqueta, c]) =>
                c ? (
                  <figure key={etiqueta}>
                    <figcaption>{etiqueta}</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={archivo(slug, p.carpeta, c.archivo)} alt={c.pie} loading="lazy" />
                  </figure>
                ) : null,
              )}
            </div>

            <p className="expediente-meta">
              {p.rondas?.length ?? 0} rondas · {p.versiones?.length ?? 0} versiones · {p.archivos?.length ?? 0} archivos
              tocados
            </p>
          </article>
        );
      })}
    </div>
  );
}
