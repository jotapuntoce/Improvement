"use client";
// Kanban: arrastrar una tarjeta a otra columna llama la Server Action de mover. Con teclado, cada
// tarjeta trae un select de etapa (arrastrar no es la única forma).
import Link from "next/link";
import { useTransition } from "react";
import type { ViewRecord } from "./ListView.tsx";

export function KanbanBoard({
  base,
  records,
  stages,
  move,
}: {
  base: string;
  records: ViewRecord[];
  stages: { key: string; name: string }[];
  move: (id: string, stage: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const drop = (stage: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) start(() => move(id, stage));
  };
  return (
    // Desplaza en horizontal: tabIndex y nombre para que se recorra con teclado (axe scrollable-region-focusable).
    <div className="view-kanban" aria-busy={pending} role="region" aria-label="Tablero por etapa" tabIndex={0}>
      {stages.map((s) => (
        <section key={s.key} className="view-column" aria-labelledby={`col-${s.key}`} onDragOver={(e) => e.preventDefault()} onDrop={drop(s.key)}>
          <h2 id={`col-${s.key}`} className="config-card-title">{s.name}</h2>
          <ul>
            {records.filter((r) => r.stage === s.key).map((r) => (
              <li key={r.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)} className="view-card">
                <Link href={`${base}/${r.id}`}>{r.title}</Link>
                {r.subtitle && <p className="config-hint">{r.subtitle}</p>}
                <label className="sr-only" htmlFor={`stage-${r.id}`}>Etapa de {r.title}</label>
                <select
                  id={`stage-${r.id}`}
                  value={r.stage}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.value;
                    start(() => move(r.id, next));
                  }}
                >
                  {stages.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
