// Lo primero que ve el dueño al abrir su panel: qué le toca hacer, lo más urgente arriba.
//
// Ocupa el lugar donde antes estaba el rastreador de construcción. El rastreador contesta "¿cómo va
// mi empresa?", que es una pregunta que se hace una vez a la semana; esto contesta "¿qué hago hoy?",
// que es por lo que abre el panel. El rastreador sigue ahí, detrás del botón de construcción.
//
// Server Component: el orden ya viene resuelto de server/tasks/loadOwnerTasks.ts.
import Link from "next/link";
import type { OwnerTask } from "@/server/tasks/loadOwnerTasks";

const KIND_LABEL: Record<string, string> = {
  pago: "Pago",
  objetivo: "Objetivo",
  solicitud: "Solicitud",
};

const DAY = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

// Seis y no todos: la lista vive arriba del panel y una empresa con cuarenta objetivos abiertos
// empujaría las tarjetas fuera de la pantalla. Lo que no cabe se ve en el panel de la empresa.
const VISIBLE = 6;

function dueText(task: OwnerTask): string {
  if (!task.dueDate) return "Sin fecha";
  return task.overdue ? `Venció el ${DAY.format(task.dueDate)}` : DAY.format(task.dueDate);
}

function TaskRow({ task }: { task: OwnerTask }) {
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
    <li className="pendiente">
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
            {tasks.slice(0, VISIBLE).map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ol>
          {tasks.length > VISIBLE && (
            <p className="pendientes-more">
              Y {tasks.length - VISIBLE} más. Entra a una empresa para verlos todos.
            </p>
          )}
        </>
      )}
    </section>
  );
}
