// La pared de resultados: qué tan bien está dirigiendo Improvement.
//
// Cuelga debajo del panel del Director General, en la misma pantalla. Es lo que impide que el
// Director sea un acto de fe: vueltas cerradas, cuántas acertaron, cuánto tardan, qué costó y qué
// se aprendió.
//
// UN NÚMERO QUE NO SE PUEDE CALCULAR SE DIBUJA COMO RAYA, nunca como cero. Es la misma regla que
// los muebles de la recepción: "0% de acierto" dice que Improvement falla siempre, y "—" dice que
// todavía no hay con qué juzgarlo. Son cosas distintas y la primera es falsa el primer día.
//
// Componente de presentación puro: sin fetch, sin estado, sin rutas. Recibe el tablero ya
// calculado (server/improvement/analytics.ts) y lo dibuja.
import type { ReactNode } from "react";

export interface AnalyticsTimelineEntry {
  id: string;
  title: string;
  phase: string;
  result: string | null;
  areaName: string | null;
  createdAt: string | Date;
  dias: number | null;
}

export interface AnalyticsWallProps {
  cyclesTotal: number;
  cyclesCompleted: number;
  cyclesOpen: number;
  successRate: number | null;
  avgCycleDurationDays: number | null;
  suggestionsAccepted: number;
  suggestionsRejected: number;
  tasksSuggested: number;
  tasksCompleted: number;
  costUsd: number;
  areasImproved: { name: string; cycles: number }[];
  topLearnings: string[];
  timeline: AnalyticsTimelineEntry[];
}

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });
const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" });

/** Cómo se lee cada desenlace. Sin entrada = la vuelta sigue viva. */
const RESULTADO: Record<string, string> = {
  exitoso: "Funcionó",
  fallido: "No funcionó",
  neutral: "Sin conclusión",
};

export function AnalyticsWall(p: AnalyticsWallProps) {
  return (
    <section className="jpc-aw">
      <h2 className="jpc-dg-subtitulo">Cómo voy dirigiendo</h2>

      <div className="jpc-aw-tarjetas">
        <Tarjeta
          valor={p.successRate === null ? "—" : `${p.successRate}%`}
          pie="de mis propuestas funcionaron"
        />
        <Tarjeta valor={p.cyclesCompleted} pie={p.cyclesCompleted === 1 ? "vuelta cerrada" : "vueltas cerradas"} />
        <Tarjeta
          valor={p.avgCycleDurationDays === null ? "—" : `${p.avgCycleDurationDays} d`}
          pie="dura una vuelta"
        />
        <Tarjeta
          valor={`${p.tasksCompleted}/${p.tasksSuggested}`}
          pie="tareas hechas de las que propuse"
        />
        <Tarjeta
          valor={`${p.suggestionsAccepted}/${p.suggestionsAccepted + p.suggestionsRejected}`}
          pie="propuestas que aceptaste"
        />
        {/* El costo en dólares es el ÚNICO número de dinero de esta pared, y es real: sale de
            llm_calls, medido llamada por llamada. No hay un "ROI estimado" porque no hay de dónde
            sacarlo — ver el comentario de cabecera de server/improvement/analytics.ts. */}
        <Tarjeta valor={dinero.format(p.costUsd)} pie="he costado en IA" />
      </div>

      {p.areasImproved.length > 0 && (
        <>
          <h3 className="jpc-dg-subtitulo">Áreas que mejoraron</h3>
          <ul className="jpc-aw-areas">
            {p.areasImproved.map((a) => (
              <li key={a.name}>
                <strong>{a.name}</strong>
                <span className="jpc-dg-meta">
                  {a.cycles} {a.cycles === 1 ? "vuelta" : "vueltas"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {p.topLearnings.length > 0 && (
        <>
          <h3 className="jpc-dg-subtitulo">Lo que he aprendido</h3>
          <ul className="jpc-aw-aprendizajes">
            {p.topLearnings.map((l, i) => (
              // Índice como key: son frases sin id propio, y la lista se reemplaza entera en cada
              // carga (no se reordena ni se edita en su lugar), así que no hay estado que perder.
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      )}

      {p.timeline.length > 0 && (
        <>
          <h3 className="jpc-dg-subtitulo">Todas las vueltas</h3>
          <ol className="jpc-aw-timeline">
            {p.timeline.map((c) => (
              <li key={c.id} data-resultado={c.result ?? "abierto"}>
                <strong>{c.title}</strong>
                <span className="jpc-dg-meta">
                  {[
                    fecha.format(new Date(c.createdAt)),
                    c.areaName,
                    c.result ? RESULTADO[c.result] : c.phase,
                    c.dias === null ? null : `${c.dias} d`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {p.cyclesTotal === 0 && (
        <p className="jpc-dg-meta">
          Todavía no he dirigido ninguna vuelta. Abre una arriba y aquí va a aparecer cómo salió.
        </p>
      )}
    </section>
  );
}

function Tarjeta({ valor, pie }: { valor: ReactNode; pie: string }) {
  return (
    <p className="jpc-aw-tarjeta">
      <strong>{valor}</strong>
      <span className="jpc-dg-meta">{pie}</span>
    </p>
  );
}
