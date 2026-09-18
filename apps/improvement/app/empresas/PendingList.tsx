// Lo primero que ve el dueño al abrir su panel: qué le toca hacer, lo más urgente arriba.
//
// Ocupa el lugar donde antes estaba el rastreador de construcción. El rastreador contesta "¿cómo va
// mi empresa?", que es una pregunta que se hace una vez a la semana; esto contesta "¿qué hago hoy?",
// que es por lo que abre el panel. El rastreador sigue ahí, detrás del botón de construcción.
//
// TRES y no seis. Seis pendientes no son una prioridad, son una lista de quehaceres: el dueño la
// lee entera y arranca por el que le dé menos flojera. Tres caben de un vistazo y obligan a que
// algo se quede afuera, que es justamente lo que los vuelve una decisión.
//
// El resto no se esconde, se pliega: un <details> nativo los abre todos. Sin "use client" — un
// acordeón es exactamente lo que el navegador ya sabe hacer solo.
//
// Server Component: el orden y el corte de Pareto ya vienen resueltos de
// server/tasks/loadOwnerTasks.ts.
import Link from "next/link";
import { paretoCut, type OwnerTask } from "@/server/tasks/loadOwnerTasks";

const KIND_LABEL: Record<string, string> = {
  pago: "Pago",
  objetivo: "Objetivo",
  solicitud: "Solicitud",
};

const DAY = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

const VISIBLE = 3;

function dueText(task: OwnerTask): string {
  if (!task.dueDate) return "Sin fecha";
  return task.overdue ? `Venció el ${DAY.format(task.dueDate)}` : DAY.format(task.dueDate);
}

function TaskRow({ task, vital }: { task: OwnerTask; vital?: boolean }) {
  const body = (
    <>
      <span className={`pendiente-kind pendiente-kind--${task.kind}`}>{KIND_LABEL[task.kind]}</span>
      <span className="pendiente-body">
        <span className="pendiente-title">{task.title}</span>
        <span className="pendiente-context">{task.context}</span>
      </span>
      <span className={task.overdue ? "pendiente-due pendiente-due--overdue" : "pendiente-due"}>
        {dueText(task)}
      </span>
    </>
  );

  return (
    <li className={vital ? "pendiente pendiente--vital" : "pendiente"}>
      {task.href ? (
        <Link href={task.href} className="pendiente-link">
          {body}
        </Link>
      ) : (
        <span className="pendiente-link pendiente-link--plain">{body}</span>
      )}
    </li>
  );
}

export function PendingList({ tasks }: { tasks: OwnerTask[] }) {
  const overdue = tasks.filter((t) => t.overdue).length;
  const vitales = paretoCut(tasks);
  const arriba = tasks.slice(0, VISIBLE);
  const resto = tasks.slice(VISIBLE);

  return (
    <section className="pendientes" aria-label="Tus pendientes">
      <header className="pendientes-head">
        <h2 className="pendientes-title">Tus pendientes</h2>
        {overdue > 0 && (
          <span className="pendientes-alert">
            {overdue} {overdue === 1 ? "vencido" : "vencidos"}
          </span>
        )}
      </header>

      {tasks.length === 0 ? (
        <p className="pendientes-empty">
          No tienes nada pendiente. En cuanto haya un objetivo abierto o un pago por hacer, aparece
          aquí.
        </p>
      ) : (
        <>
          <ol className="pendientes-list">
            {arriba.map((task, i) => (
              <TaskRow key={task.id} task={task} vital={i < vitales} />
            ))}
          </ol>

          {vitales <= VISIBLE && tasks.length > vitales && (
            <p className="pendientes-pareto">
              {vitales === 1
                ? "Ese pendiente concentra el 80% de lo que hoy mueve tus empresas."
                : `Esos ${vitales} concentran el 80% de lo que hoy mueve tus empresas.`}{" "}
              Lo demás puede esperar sin costarte nada.
            </p>
          )}

          {resto.length > 0 && (
            <details className="pendientes-resto">
              <summary className="pendientes-more">
                Ver los otros {resto.length} {resto.length === 1 ? "pendiente" : "pendientes"}
              </summary>
              <ol className="pendientes-list">
                {resto.map((task, i) => (
                  <TaskRow key={task.id} task={task} vital={i + VISIBLE < vitales} />
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}
