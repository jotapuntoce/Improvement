// El panel de control estilo Odoo: título, buscador, "Nuevo" (apps propias) y cambio de vista.
import Link from "next/link";

export function ControlPanel({
  title,
  base,
  q,
  vista,
  create,
}: {
  title: string;
  base: string;
  q: string;
  vista: "lista" | "kanban";
  /** Solo en apps propias: crea un registro con su nombre. */
  create?: (formData: FormData) => Promise<void>;
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
      <nav aria-label="Vista" className="view-switch">
        <Link href={`${base}?vista=lista`} aria-current={vista === "lista" ? "page" : undefined}>Lista</Link>
        <Link href={`${base}?vista=kanban`} aria-current={vista === "kanban" ? "page" : undefined}>Kanban</Link>
      </nav>
    </header>
  );
}
