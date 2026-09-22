// El ERP básico, a la vista: qué se está construyendo, qué lo frena y quién lo tiene.
//
// La capa de datos (server/erp/projects.ts) existía desde la integración del Director General pero
// no tenía pantalla — el motor podía razonar sobre proyectos que ninguna persona podía consultar.
// Esta página es ese grifo.
//
// Lo que cada rol puede hacer lo decide el servidor, no este archivo: mover una subtarea es de
// cualquiera del equipo (el tablero desactualizado es peor que el tablero impreciso), y dar de
// alta, coordinar dependencias o fijar presupuesto es solo del dueño. Aquí únicamente se deja de
// dibujar el formulario que de todos modos iba a fallar.
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireOrgMembership, requireSection } from "@/server/auth/guard";
import { loadAreaBoard } from "@/server/areas/loadAreaBoard";
import { createProject } from "@/server/projects/mutations";
import {
  addProjectTask,
  loadProjectGraph,
  listProjectTasks,
  moveProjectTask,
  RISK_LEVELS,
  setProjectCoordination,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  type RiskLevel,
  type TaskStatus,
} from "@/server/erp/projects";

const RIESGO_LABEL: Record<RiskLevel, string> = {
  bajo: "Riesgo bajo",
  medio: "Riesgo medio",
  alto: "Riesgo alto",
};

/** Una fecha como la lee una persona, no como la escribe Postgres. */
function fecha(d: Date | null): string | null {
  return d ? d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : null;
}

/** Dinero con separador de miles. `null` cuando no se capturó — no se inventa un cero. */
function dinero(v: string | null): string | null {
  if (v === null) return null;
  return Number(v).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

export default async function ProyectosPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ abierto?: string }>;
}) {
  const { org: orgId } = await params;
  const { abierto } = await searchParams;
  const { membership: memberRow } = await requireSection(orgId, "proyectos");
  const userId = memberRow.userId;
  // El rol sale de la fila de membresía que el guard ya trajo: una consulta menos que
  // findOwnerMembership, y el mismo dato.
  const isOwner = memberRow.role === "owner";
  const pagina = `/${orgId}/proyectos`;

  const [proyectos, areas] = await Promise.all([
    loadProjectGraph(userId, orgId),
    isOwner ? loadAreaBoard(userId, orgId) : Promise.resolve([]),
  ]);

  // Las subtareas solo del proyecto que el usuario abrió: traerlas todas de entrada sería una
  // query por proyecto en cada carga para una lista que casi siempre está cerrada.
  const abiertoValido = proyectos.some((p) => p.id === abierto) ? abierto : undefined;
  const subtareas = abiertoValido ? await listProjectTasks(userId, orgId, abiertoValido) : [];

  async function crear(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const areaId = formData.get("areaId")?.toString() || null;
    await createProject(row.userId, orgId, {
      name: formData.get("name")?.toString().trim() ?? "",
      detail: formData.get("detail")?.toString().trim() || null,
      areaId,
      clientId: null,
      status: "activo",
      progress: 0,
    });
    revalidatePath(pagina);
  }

  async function coordinar(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const projectId = formData.get("projectId")?.toString() ?? "";
    // getAll: un proyecto puede esperar a varios. Una lista vacía es una instrucción válida
    // ("ya no depende de nadie"), así que se manda siempre y no solo cuando trae algo.
    const dependsOn = formData.getAll("dependsOn").map((v) => v.toString()).filter(Boolean);
    const dueAt = formData.get("dueAt")?.toString();
    const budget = formData.get("budget")?.toString();
    const spent = formData.get("spent")?.toString();
    await setProjectCoordination(row.userId, orgId, projectId, {
      dependsOn,
      risk: formData.get("risk")?.toString(),
      dueAt: dueAt ? new Date(dueAt) : null,
      budget: budget === "" || budget === undefined ? null : Number(budget),
      spent: spent === "" || spent === undefined ? null : Number(spent),
    });
    revalidatePath(pagina);
  }

  async function agregarTarea(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const projectId = formData.get("projectId")?.toString() ?? "";
    await addProjectTask(row.userId, orgId, projectId, {
      title: formData.get("title")?.toString().trim() ?? "",
      assignedTo: formData.get("assignedTo")?.toString() || null,
    });
    revalidatePath(pagina);
  }

  async function moverTarea(formData: FormData) {
    "use server";
    const row = await requireOrgMembership(orgId);
    const taskId = formData.get("taskId")?.toString() ?? "";
    const status = formData.get("status")?.toString() ?? "";
    await moveProjectTask(row.userId, orgId, taskId, status as TaskStatus);
    revalidatePath(pagina);
  }

  const enRiesgo = proyectos.filter((p) => p.alertas.length > 0);

  return (
    <main className="config-page">
      <h1 className="config-title">Proyectos</h1>
      <p className="config-hint">
        Lo que la empresa está construyendo, con lo que cada cosa espera y lo que ya preocupa.
      </p>

      {enRiesgo.length > 0 && (
        <div className="config-card">
          <h2 className="config-card-title">Necesitan atención ({enRiesgo.length})</h2>
          <ul className="equipo-list">
            {enRiesgo.map((p) => (
              <li key={p.id}>
                <span className="equipo-name">{p.name}</span>
                <span className="config-hint"> — {p.alertas.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOwner && (
        <form action={crear} className="config-card">
          <h2 className="config-card-title">Nuevo proyecto</h2>
          <input name="name" placeholder="Nombre del proyecto" required minLength={3} className="config-input" />
          <input name="detail" placeholder="De qué se trata (opcional)" className="config-input" />
          <select name="areaId" defaultValue="" className="config-input">
            <option value="">Sin área</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="submit" className="panel-cta">
            Dar de alta
          </button>
        </form>
      )}

      {proyectos.length === 0 && (
        <div className="config-card">
          <p className="config-hint">Todavía no hay proyectos. {isOwner ? "Da de alta el primero arriba." : ""}</p>
        </div>
      )}

      <ul className="equipo-list">
        {proyectos.map((p) => {
          const estaAbierto = p.id === abiertoValido;
          const presupuesto = dinero(p.budget);
          const gastado = dinero(p.spent);
          const entrega = fecha(p.dueAt);

          return (
            <li key={p.id} className="config-card">
              <p className="objetivo-title">{p.name}</p>
              <p className="config-hint">
                {p.areaName ?? "Sin área"} · {p.progress}% · {RIESGO_LABEL[p.risk]}
                {p.leadName && ` · lleva ${p.leadName}`}
                {entrega && ` · entrega ${entrega}`}
                {presupuesto && ` · ${gastado ?? "$0"} de ${presupuesto}`}
              </p>

              {p.alertas.length > 0 && (
                <p className="invite-error" role="status">
                  {p.alertas.join(" · ")}
                </p>
              )}

              {p.bloqueadoPor.length > 0 && (
                <p className="config-hint">
                  Espera a: {p.bloqueadoPor.map((b) => b.name).join(", ")}
                </p>
              )}

              <p className="config-hint">
                {p.tasksDone} de {p.tasksDone + p.tasksOpen} subtareas hechas
              </p>

              {/* La lista de subtareas se abre por URL y no con estado de cliente: así el enlace
                  se puede compartir y la página sigue siendo Server Component entera. */}
              <Link
                href={estaAbierto ? pagina : `${pagina}?abierto=${p.id}`}
                className="panel-btn-ghost"
                scroll={false}
              >
                {estaAbierto ? "Ocultar subtareas" : "Ver subtareas"}
              </Link>

              {estaAbierto && (
                <>
                  <ul className="equipo-list">
                    {subtareas.map((t) => (
                      <li key={t.id}>
                        <span className="equipo-name">{t.title}</span>
                        <span className="config-hint">
                          {" "}
                          — {TASK_STATUS_LABEL[t.status]}
                          {t.assigneeName && ` · ${t.assigneeName}`}
                        </span>
                        {/* Mover una subtarea es de cualquiera del equipo: quien la está
                            haciendo es quien sabe en qué va. */}
                        <form action={moverTarea} className="permiso-actions">
                          <input type="hidden" name="taskId" value={t.id} />
                          <select name="status" defaultValue={t.status} className="config-input">
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {TASK_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="panel-btn-ghost">
                            Mover
                          </button>
                        </form>
                      </li>
                    ))}
                    {subtareas.length === 0 && <p className="config-hint">Sin subtareas todavía.</p>}
                  </ul>

                  {isOwner && (
                    <form action={agregarTarea} className="permiso-actions">
                      <input type="hidden" name="projectId" value={p.id} />
                      <input
                        name="title"
                        placeholder="Nueva subtarea"
                        required
                        minLength={3}
                        className="config-input"
                      />
                      <button type="submit" className="panel-btn-ghost">
                        Agregar
                      </button>
                    </form>
                  )}
                </>
              )}

              {isOwner && (
                <details>
                  <summary className="config-hint">Coordinación</summary>
                  <form action={coordinar}>
                    <input type="hidden" name="projectId" value={p.id} />

                    <label className="config-hint" htmlFor={`dep-${p.id}`}>
                      Espera a que terminen (ctrl+clic para varios)
                    </label>
                    <select
                      id={`dep-${p.id}`}
                      name="dependsOn"
                      multiple
                      defaultValue={p.dependsOn}
                      className="config-input"
                    >
                      {proyectos
                        .filter((otro) => otro.id !== p.id)
                        .map((otro) => (
                          <option key={otro.id} value={otro.id}>
                            {otro.name}
                          </option>
                        ))}
                    </select>

                    <select name="risk" defaultValue={p.risk} className="config-input">
                      {RISK_LEVELS.map((r) => (
                        <option key={r} value={r}>
                          {RIESGO_LABEL[r]}
                        </option>
                      ))}
                    </select>

                    <label className="config-hint" htmlFor={`due-${p.id}`}>
                      Fecha de entrega
                    </label>
                    <input
                      id={`due-${p.id}`}
                      type="date"
                      name="dueAt"
                      defaultValue={p.dueAt ? p.dueAt.toISOString().slice(0, 10) : ""}
                      className="config-input"
                    />

                    {/* `spent` se captura a mano, igual que `progress`: no hay tabla de gastos de
                        donde derivarlo, y un número derivado de la nada miente con más
                        confianza que uno que alguien escribió. */}
                    <label className="config-hint" htmlFor={`bud-${p.id}`}>
                      Presupuesto y gastado
                    </label>
                    <input
                      id={`bud-${p.id}`}
                      type="number"
                      name="budget"
                      min={0}
                      step="0.01"
                      placeholder="Presupuesto"
                      defaultValue={p.budget ?? ""}
                      className="config-input"
                    />
                    <input
                      type="number"
                      name="spent"
                      min={0}
                      step="0.01"
                      placeholder="Gastado"
                      defaultValue={p.spent ?? ""}
                      className="config-input"
                    />

                    <button type="submit" className="panel-btn-ghost">
                      Guardar coordinación
                    </button>
                  </form>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <Link href={`/empresas/${orgId}`}>← Volver a la recepción</Link>
    </main>
  );
}
