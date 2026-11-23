// Calendario de trabajo interno: las próximas 4 semanas con todo lo que tiene fecha y la persona ve.
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { agenda } from "@/server/calendar/agenda.ts";
import { Agenda } from "@/components/dashboard/CardBody.tsx";

export default async function Calendario({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await requireOrgMembership(orgId);
  const days = await agenda(me.userId, orgId, new Date(), 28);
  return (
    <main className="config-page">
      <h1 className="config-title">Calendario</h1>
      <p className="config-hint">Las próximas cuatro semanas: tus tareas, tus objetivos y las fechas de tus apps.</p>
      <section className="config-card" aria-label="Próximas cuatro semanas">
        <Agenda days={days} />
      </section>
    </main>
  );
}
