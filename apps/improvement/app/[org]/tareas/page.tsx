// La bandeja de cada persona: sus tareas abiertas y sus objetivos pendientes, lo vencido primero.
import Link from "next/link";
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { listInbox, type InboxItem } from "@/server/tasks/inbox.ts";

const ORIGEN: Record<InboxItem["source"], string> = {
  dueno: "Te la asignó el dueño",
  propia: "Te la apuntaste",
  improvement: "La sugirió Improvement",
  automatizacion: "La creó una automatización",
};
const fecha = (d: Date) => d.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" });

export default async function Bandeja({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await requireOrgMembership(orgId);
  const inbox = await listInbox(me.userId, orgId);
  const items = inbox.ok ? inbox.data : [];
  return (
    <main className="config-page">
      <h1 className="config-title">Tu bandeja</h1>
      <p className="config-hint">
        <Link href={`/${orgId}/tareas/nueva`} className="panel-cta">Apuntar una tarea</Link>{" "}
        <Link href={`/${orgId}/tareas/permisos`}>Qué hace Improvement solo</Link>
      </p>
      <ul className="equipo-list" role="list">
        {items.map((i) => (
          <li key={`${i.kind}-${i.id}`} className="config-card task-item">
            <Link href={i.href}>{i.title}</Link>
            <span className="config-hint">
              {i.kind === "objetivo" ? "Objetivo" : ORIGEN[i.source]}
              {i.dueAt && ` · ${fecha(i.dueAt)}`}
            </span>
            {i.overdue && <span className="task-overdue">Vencida</span>}
          </li>
        ))}
        {items.length === 0 && <li className="config-hint">Nada pendiente por ahora.</li>}
      </ul>
    </main>
  );
}
