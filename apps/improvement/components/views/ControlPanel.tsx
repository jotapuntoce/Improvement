// El panel de control estilo Odoo: título, buscador y cambio de vista. Un <form method="get">.
import Link from "next/link";

export function ControlPanel({ title, base, q, vista }: { title: string; base: string; q: string; vista: "lista" | "kanban" }) {
  return (
    <header className="view-control">
      <h1 className="config-title">{title}</h1>
      <form method="get" className="view-search" role="search">
        <label className="sr-only" htmlFor="q">Buscar</label>
        <input id="q" name="q" defaultValue={q} placeholder="Buscar…" className="config-input" />
        <input type="hidden" name="vista" value={vista} />
      </form>
      <nav aria-label="Vista" className="view-switch">
        <Link href={`${base}?vista=lista`} aria-current={vista === "lista" ? "page" : undefined}>Lista</Link>
        <Link href={`${base}?vista=kanban`} aria-current={vista === "kanban" ? "page" : undefined}>Kanban</Link>
      </nav>
    </header>
  );
}
