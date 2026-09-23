// El puesto de mando del dueño: qué se está moviendo, quién lo tiene y qué preocupa.
//
// No inventa ni un dato. Es el cruce de cuatro loaders que ya existían y vivían cada uno en su
// pantalla: la vuelta de mejora en curso, las cuentas en riesgo, los proyectos en riesgo y las
// tareas que Improvement repartió. La pregunta que contesta —"¿cómo va todo?"— no la contestaba
// ninguna de las cuatro por separado, y obligar al dueño a abrir cuatro pestañas y sumarlas es
// pedirle que haga a mano el trabajo del producto.
//
// Deliberadamente no tiene formularios: desde aquí se ve y se navega, se actúa en la pantalla de
// cada cosa. Un tablero que también edita termina siendo una quinta copia de cuatro formularios
// que hay que mantener sincronizados.
//
// Solo dueño, por la misma razón que /[org]/necesidades: cruzar riesgo de cartera con carga por
// persona es juicio sobre el trabajo de gente concreta. 404 y no 403 para todos los demás — un 403
// le confirmaría a un empleado que este tablero existe.
import Link from "next/link";
import { notFound } from "next/navigation";
import { findOwnerMembership, getSessionUserId } from "@/server/auth/guard";
import { listClientsAtRisk } from "@/server/crm/client-extensions";
import { listProjectsAtRisk } from "@/server/erp/projects";
import { listDelegations, DELEGATED_STATUS_LABEL, type DelegatedStatus } from "@/server/improvement/delegation";
import { activeCycle } from "@/server/improvement/motor";
import { PHASE_LABEL } from "@/server/improvement/phases";
import { loadAreaBoard } from "@/server/areas/loadAreaBoard";

/** Las que todavía le piden algo a alguien. Una rechazada o completada ya no es carga. */
const ABIERTAS: DelegatedStatus[] = ["sugerida", "aceptada", "en_progreso"];

function fecha(d: Date | null): string | null {
  return d ? d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : null;
}

export default async function ControlPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;

  const userId = await getSessionUserId();
  if (!userId) notFound();
  if (!(await findOwnerMembership(userId, orgId))) notFound();

  const [ciclo, cuentas, proyectos, delegaciones, areas] = await Promise.all([
    activeCycle(userId, orgId),
    listClientsAtRisk(userId, orgId),
    listProjectsAtRisk(userId, orgId),
    listDelegations(userId, orgId),
    loadAreaBoard(userId, orgId),
  ]);

  const abiertas = delegaciones.filter((d) => ABIERTAS.includes(d.status));
  const sinDueno = abiertas.filter((d) => !d.assigneeName);

  // Cuánto trabajo repartido tiene cada persona encima. Se cuenta sobre las abiertas y no sobre
  // todas: quien cerró diez la semana pasada no está cargado hoy.
  const carga = new Map<string, number>();
  for (const d of abiertas) {
    if (d.assigneeName) carga.set(d.assigneeName, (carga.get(d.assigneeName) ?? 0) + 1);
  }
  const porPersona = [...carga.entries()].sort((a, b) => b[1] - a[1]);

  const esperandoDecision = Boolean(ciclo && ciclo.phase === "sugerencia" && ciclo.aiSuggestion);
  const todoTranquilo =
    !esperandoDecision && cuentas.length === 0 && proyectos.length === 0 && sinDueno.length === 0;

  return (
    <main className="config-page">
      <h1 className="config-title">Control</h1>
      <p className="config-hint">Cómo va tu empresa hoy, en una pantalla.</p>

      {todoTranquilo && (
        <div className="config-card">
          <p className="config-hint">
            Nada pide tu atención ahora mismo: ninguna cuenta en riesgo, ningún proyecto atorado y
            nada esperando tu decisión.
          </p>
        </div>
      )}

      <div className="config-card">
        <h2 className="config-card-title">La vuelta de mejora</h2>
        {ciclo ? (
          <>
            <p className="objetivo-title">{ciclo.title ?? "Sin título"}</p>
            <p className="config-hint">
              {/* El `?? ciclo.phase` no es defensa de más: `phase` es text en la base, y una fila
                  escrita por una versión futura tiene que enseñarse cruda, no dejar esto en
                  blanco. */}
              Fase: {PHASE_LABEL[ciclo.phase as keyof typeof PHASE_LABEL] ?? ciclo.phase}
            </p>
            {esperandoDecision && (
              <p className="invite-error" role="status">
                Está esperando tu decisión. No avanza sin ti.
              </p>
            )}
          </>
        ) : (
          <p className="config-hint">No hay ninguna vuelta abierta.</p>
        )}
        <Link href={`/${orgId}/improvement`} className="panel-btn-ghost">
          Abrir el Director General →
        </Link>
      </div>

      <div className="config-card">
        <h2 className="config-card-title">Cuentas que necesitan algo ({cuentas.length})</h2>
        {cuentas.length === 0 && <p className="config-hint">Ninguna cuenta preocupa hoy.</p>}
        <ul className="equipo-list">
          {cuentas.map((c) => (
            <li key={c.id}>
              <span className="equipo-name">{c.name}</span>
              <span className="config-hint">
                {" "}
                — {c.motivos.join(" · ")}
                {c.areaName && ` · ${c.areaName}`}
              </span>
            </li>
          ))}
        </ul>
        <Link href={`/${orgId}/clientes`} className="panel-btn-ghost">
          Ver la cartera →
        </Link>
      </div>

      <div className="config-card">
        <h2 className="config-card-title">Proyectos atorados ({proyectos.length})</h2>
        {proyectos.length === 0 && <p className="config-hint">Ningún proyecto preocupa hoy.</p>}
        <ul className="equipo-list">
          {proyectos.map((p) => (
            <li key={p.id}>
              <span className="equipo-name">{p.name}</span>
              <span className="config-hint">
                {" "}
                — {p.alertas.join(" · ")}
                {p.areaName && ` · ${p.areaName}`}
              </span>
            </li>
          ))}
        </ul>
        <Link href={`/${orgId}/proyectos`} className="panel-btn-ghost">
          Ver los proyectos →
        </Link>
      </div>

      <div className="config-card">
        <h2 className="config-card-title">Lo que Improvement repartió ({abiertas.length} abiertas)</h2>
        {sinDueno.length > 0 && (
          <p className="invite-error" role="status">
            {sinDueno.length} sin responsable — el área no tenía a nadie a quien asignárselas.
            Pídele a Improvement que se las asigne a alguien.
          </p>
        )}
        {porPersona.length > 0 && (
          <ul className="equipo-list">
            {porPersona.map(([nombre, n]) => (
              <li key={nombre}>
                <span className="equipo-name">{nombre}</span>
                <span className="config-hint"> — {n} abierta{n === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
        {abiertas.length === 0 && <p className="config-hint">Nada repartido ahora mismo.</p>}
        <ul className="equipo-list">
          {abiertas.map((d) => (
            <li key={d.id}>
              <span className="equipo-name">{d.title}</span>
              <span className="config-hint">
                {" "}
                — {DELEGATED_STATUS_LABEL[d.status] ?? d.status}
                {d.assigneeName ? ` · ${d.assigneeName}` : " · sin responsable"}
                {fecha(d.dueAt) && ` · ${fecha(d.dueAt)}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="config-card">
        <h2 className="config-card-title">Las áreas</h2>
        <ul className="equipo-list">
          {areas.map((a) => (
            <li key={a.id}>
              <span className="equipo-name">{a.name}</span>
              <span className="config-hint">
                {" "}
                — {a.members} {a.members === 1 ? "persona" : "personas"} · {a.objectivesOpen}{" "}
                objetivos abiertos · {a.projects} proyectos · {a.clients} clientes
              </span>
            </li>
          ))}
          {areas.length === 0 && <p className="config-hint">Todavía no hay áreas.</p>}
        </ul>
      </div>

      <Link href={`/empresas/${orgId}`}>← Volver a la recepción</Link>
    </main>
  );
}
