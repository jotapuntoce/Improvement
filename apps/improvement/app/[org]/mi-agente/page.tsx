// El registro del empleado: al aceptar su invitación, Improvement conoce su trabajo (qué hace, qué
// repite, dónde se le atora) y le dice en qué le facilita el trabajo. Después, aquí vive su agente.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { EMPLEADO_QUESTIONS, helpFor, loadMiAgente, saveConocerte } from "@/server/equipo/agentes.ts";
import { Entrevista } from "@/components/arranque/Entrevista.tsx";

export default async function MiAgente({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const mio = await loadMiAgente(me.userId, orgId);
  if (!mio) redirect(`/${orgId}`);

  async function contar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await saveConocerte(actor, orgId, Object.fromEntries(formData));
    if (!r.ok) redirect(`/${orgId}/mi-agente?error=${encodeURIComponent(r.error.message)}`);
    redirect(`/${orgId}/mi-agente`);
  }

  const nombre = mio.nombre.split(" ")[0];
  if (!mio.conocido) {
    return (
      <main className="arr-main mi-agente">
        <p className="arr-why">Hola {nombre}. Soy tu agente de Improvement para {mio.puesto}{mio.sucursal ? ` en ${mio.sucursal}` : ""}. Antes de ayudarte quiero conocer todo tu trabajo: tu proceso de principio a fin y todas las tareas que te tocan.</p>
        <Entrevista action={contar} questions={EMPLEADO_QUESTIONS} label="Conocer tu trabajo" finish="Esto es lo que hago" pendingLabel="Guardando…" error={error} />
      </main>
    );
  }

  return (
    <main className="arr-main mi-agente">
      <section className="arr-alivio" aria-labelledby="ma-t">
        <h1 id="ma-t">{nombre}, esto es lo que hago por ti</h1>
        {mio.respuestas.friccion && <p className="arr-why">Me dijiste que se te atora: “{mio.respuestas.friccion.slice(0, 280)}”. Por ahí empiezo.</p>}
        <ul className="mi-agente-ayuda">{helpFor(mio.respuestas).map((h) => <li key={h}>{h}</li>)}</ul>
      </section>
      {mio.apps.length > 0 && (
        <section className="arr-alivio" aria-labelledby="ma-apps">
          <h2 id="ma-apps">Lo tuyo</h2>
          <p className="arr-why">Lo que pase aquí te llega como tarea a ti{mio.sucursal ? `, solo de ${mio.sucursal}` : ""}.</p>
          <ul className="arr-stages">{mio.apps.map((a) => <li key={a.key}><Link href={`/${orgId}/a/${a.key}`}>{a.name}</Link></li>)}</ul>
        </section>
      )}
      <div className="arr-row">
        <Link href={`/${orgId}/tareas`} className="arr-primary">Ver lo que toca hoy</Link>
      </div>
    </main>
  );
}
