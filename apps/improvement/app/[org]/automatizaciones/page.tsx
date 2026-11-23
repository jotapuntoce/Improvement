// Las automatizaciones del dueño: qué las dispara, en qué estado están y qué hicieron la última vez.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgMembership } from "@/server/auth/guard.ts";
import { describeTrigger, listRules } from "@/server/automations/rules.ts";

const ESTADO_REGLA: Record<string, string> = { prueba: "En prueba", activa: "Activa", pausada: "Pausada" };
const fecha = (d: Date) => d.toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Automatizaciones({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  const me = await requireOrgMembership(orgId);
  if (me.role !== "owner") notFound();
  const rules = await listRules(me.userId, orgId);
  if (!rules.ok) notFound();
  return (
    <main className="config-page">
      <h1 className="config-title">Automatizaciones</h1>
      <p className="config-hint">
        <Link href={`/${orgId}/automatizaciones/nueva`} className="panel-cta">Nueva automatización</Link>
      </p>
      <ul className="equipo-list" role="list">
        {rules.data.map((r) => (
          <li key={r.id} className="config-card task-item">
            <Link href={`/${orgId}/automatizaciones/${r.id}`}>{r.name}</Link>
            <span className="config-hint">{describeTrigger(r.trigger)} · {r.appKey}</span>
            <span>{ESTADO_REGLA[r.status]}</span>
            <span className="config-hint">{r.lastRun ? `Última: ${fecha(r.lastRun.createdAt)} — ${r.lastRun.detail}` : "Aún no corre"}</span>
          </li>
        ))}
        {rules.data.length === 0 && <li className="config-hint">Todavía no tienes automatizaciones.</li>}
      </ul>
    </main>
  );
}
