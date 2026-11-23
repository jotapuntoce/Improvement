// El panel de control estilo Odoo: título, buscador, "Nuevo" (apps propias) y cambio de vista.
import Link from "next/link";

export function ControlPanel({
  title,
  base,
  q,
  vista,
  options,
  saveDefault,
  create,
  importHref,
}: {
  title: string;
  base: string;
  q: string;
  vista: string;
  /** Las vistas que esta app puede mostrar (las que piden un campo que no tiene no salen). */
  options: { kind: string; name: string }[];
  /** Solo el dueño, cuando la vista actual no es la que abre la app: la deja así. */
  saveDefault?: (formData: FormData) => Promise<void>;
  /** Solo en apps propias: crea un registro con su nombre. */
  create?: (formData: FormData) => Promise<void>;
  /** Solo el dueño, en Clientes y en apps propias: lleva a traer un archivo. */
  importHref?: string;
}) {
  return (
    <header className="view-control">
      <h1 className="config-title">{title}</h1>
      <form method="get" className="view-search" role="search">
        <label className="sr-only" htmlFor="q">Buscar</label>
        <input id="q" name="q" defaultValue={q} placeholder="Buscar…" className="config-input" />
        <input type="hidden" name="vista" value={vista} />
      </form>
      {create && (
        <form action={create} className="view-new" aria-label="Nuevo registro">
          <label className="sr-only" htmlFor="new-title">Nombre del registro nuevo</label>
          <input id="new-title" name="title" required maxLength={120} placeholder="Nuevo…" className="config-input" />
          <button type="submit" className="panel-cta">Nuevo</button>
        </form>
      )}
      {importHref && <Link href={importHref} className="panel-cta">Importar</Link>}
      <nav aria-label="Vista" className="view-switch">
        {options.map((o) => (
          <Link key={o.kind} href={`${base}?vista=${o.kind}`} aria-current={vista === o.kind ? "page" : undefined}>{o.name}</Link>
        ))}
      </nav>
      {saveDefault && (
        <form action={saveDefault}>
          <input type="hidden" name="kind" value={vista} />
          <button type="submit" className="panel-btn-ghost">Que abra así</button>
        </form>
      )}
    </header>
  );
}
