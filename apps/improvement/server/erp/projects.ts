// El ERP básico: proyectos con subtareas, dependencias y riesgo.
//
// server/projects/mutations.ts sigue siendo el alta y el avance del proyecto, y no se toca. Lo que
// hay aquí es lo que hacía falta para que Improvement pueda COORDINAR entre áreas: saber que el
// proyecto de un área está esperando al de otra, y decir en qué tarea exactamente se atoró.
//
// Qué NO es: no hay facturación, ni inventario, ni horas cobrables, ni un tablero Kanban completo.
// El plan lo dice y se respeta — "ERP es básico: solo proyectos + dependencias". Lo suficiente
// para coordinar, nada más.
//
// El riesgo se calcula con fechas y avance, nunca con el nombre de un proyecto ni de una empresa
// (.claude/rules/motor-generico.md).
import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, profile, project, projectTask } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";
import { belongsToOrg } from "../db/belongsToOrg.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export const TASK_STATUSES = ["pendiente", "por_hacer", "en_progreso", "revision", "hecha"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: "Sin empezar",
  por_hacer: "Por hacer",
  en_progreso: "En curso",
  revision: "En revisión",
  hecha: "Hecha",
};

export const RISK_LEVELS = ["bajo", "medio", "alto"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface ProjectTaskRow {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  assignedTo: string | null;
  assigneeName: string | null;
  dueAt: Date | null;
  estimatedHours: string | null;
  actualHours: string | null;
}

export interface ProjectNode {
  id: string;
  name: string;
  status: string;
  progress: number;
  risk: RiskLevel;
  areaId: string | null;
  areaName: string | null;
  areaColor: string | null;
  leadName: string | null;
  startAt: Date | null;
  dueAt: Date | null;
  budget: string | null;
  spent: string | null;
  /** Ids de los proyectos que tienen que avanzar antes que este. */
  dependsOn: string[];
  tasksOpen: number;
  tasksDone: number;
  /** Por qué este proyecto preocupa. Vacío = no preocupa. */
  alertas: string[];
  /** Proyectos de los que depende y que todavía no están terminados. */
  bloqueadoPor: { id: string; name: string; areaName: string | null }[];
}

/**
 * Por qué un proyecto preocupa: la fecha, el dinero o el bloqueo.
 *
 * Cada señal se mide contra un número y no contra una opinión. El riesgo que el dueño capturó a
 * mano (`project.risk`) se respeta y se suma: él sabe cosas que la fecha no dice.
 */
export function alertasDeProyecto(
  p: {
    status: string;
    progress: number;
    risk: string;
    dueAt: Date | null;
    budget: string | null;
    spent: string | null;
  },
  bloqueadoPor: { name: string }[],
  ahora = new Date(),
): string[] {
  const alertas: string[] = [];
  if (p.status !== "activo") return alertas;

  if (p.dueAt && p.dueAt.getTime() < ahora.getTime() && p.progress < 100) {
    alertas.push("Ya pasó su fecha de entrega");
  }

  const presupuesto = p.budget === null ? null : Number(p.budget);
  const gastado = p.spent === null ? null : Number(p.spent);
  if (presupuesto !== null && gastado !== null && presupuesto > 0) {
    // Gastar más de lo presupuestado es alerta; gastar más proporción de la que se ha avanzado,
    // también — es la que avisa ANTES de que se acabe el dinero, que es cuando todavía sirve.
    if (gastado > presupuesto) alertas.push("Se pasó del presupuesto");
    else if (gastado / presupuesto > p.progress / 100 + 0.2) {
      alertas.push("Va gastando más rápido de lo que avanza");
    }
  }

  if (bloqueadoPor.length > 0) {
    alertas.push(`Espera a ${bloqueadoPor.map((b) => b.name).join(", ")}`);
  }

  if (p.risk === "alto") alertas.push("Marcado de riesgo alto");

  return alertas;
}

/**
 * Los proyectos de la empresa con su grafo de dependencias resuelto y sus subtareas contadas.
 *
 * El grafo se arma en memoria y no con un CTE recursivo: son decenas de proyectos, no millones, y
 * un `WITH RECURSIVE` aquí sería una consulta que nadie va a poder depurar a las tres de la mañana
 * a cambio de un ahorro que no se nota. Solo se resuelve UN nivel de dependencia — "quién me
 * bloquea", no "quién bloquea a quien me bloquea": eso es lo que el dueño necesita accionar.
 */
export async function loadProjectGraph(userId: string, orgId: string): Promise<ProjectNode[]> {
  await assertMembership(userId, orgId);
  const ahora = new Date();

  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      progress: project.progress,
      risk: project.risk,
      areaId: project.areaId,
      areaName: area.name,
      areaColor: area.color,
      leadName: profile.fullName,
      startAt: project.startAt,
      dueAt: project.dueAt,
      budget: project.budget,
      spent: project.spent,
      dependsOn: project.dependsOn,
    })
    .from(project)
    .leftJoin(area, eq(area.id, project.areaId))
    .leftJoin(profile, eq(profile.id, project.leadId))
    .where(eq(project.orgId, orgId))
    .orderBy(desc(project.progress), asc(project.createdAt));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [abiertas, hechas] = await Promise.all([
    db
      .select({ projectId: projectTask.projectId, n: count() })
      .from(projectTask)
      .where(
        and(
          eq(projectTask.orgId, orgId),
          ne(projectTask.status, "hecha"),
          inArray(projectTask.projectId, ids),
        ),
      )
      .groupBy(projectTask.projectId),
    db
      .select({ projectId: projectTask.projectId, n: count() })
      .from(projectTask)
      .where(
        and(
          eq(projectTask.orgId, orgId),
          eq(projectTask.status, "hecha"),
          inArray(projectTask.projectId, ids),
        ),
      )
      .groupBy(projectTask.projectId),
  ]);

  const porAbiertas = new Map(abiertas.map((r) => [r.projectId, Number(r.n)] as const));
  const porHechas = new Map(hechas.map((r) => [r.projectId, Number(r.n)] as const));
  // Solo los proyectos de ESTA empresa entran al índice: una dependencia apuntando a un id de otra
  // organización (o a uno borrado) simplemente no resuelve, nunca fuga un nombre ajeno.
  const porId = new Map(rows.map((r) => [r.id, r] as const));

  return rows.map((r) => {
    const dependsOn = (Array.isArray(r.dependsOn) ? r.dependsOn : []).filter(
      (d): d is string => typeof d === "string",
    );
    const bloqueadoPor = dependsOn
      .map((d) => porId.get(d))
      .filter((p) => p !== undefined)
      .filter((p) => p.status !== "terminado")
      .map((p) => ({ id: p.id, name: p.name, areaName: p.areaName }));

    return {
      ...r,
      risk: r.risk as RiskLevel,
      dependsOn,
      tasksOpen: porAbiertas.get(r.id) ?? 0,
      tasksDone: porHechas.get(r.id) ?? 0,
      bloqueadoPor,
      alertas: alertasDeProyecto(r, bloqueadoPor, ahora),
    };
  });
}

/** Los proyectos que preocupan, nada más. Es lo que lee la fase de observación del motor. */
export async function listProjectsAtRisk(userId: string, orgId: string): Promise<ProjectNode[]> {
  const grafo = await loadProjectGraph(userId, orgId);
  return grafo.filter((p) => p.alertas.length > 0);
}

export async function listProjectTasks(
  userId: string,
  orgId: string,
  projectId: string,
): Promise<ProjectTaskRow[]> {
  await assertMembership(userId, orgId);

  const rows = await db
    .select({
      id: projectTask.id,
      projectId: projectTask.projectId,
      title: projectTask.title,
      status: projectTask.status,
      assignedTo: projectTask.assignedTo,
      assigneeName: profile.fullName,
      dueAt: projectTask.dueAt,
      estimatedHours: projectTask.estimatedHours,
      actualHours: projectTask.actualHours,
    })
    .from(projectTask)
    .leftJoin(profile, eq(profile.id, projectTask.assignedTo))
    // orgId además de projectId: un projectId de otra empresa no alcanza para leer sus tareas.
    .where(and(eq(projectTask.orgId, orgId), eq(projectTask.projectId, projectId)))
    .orderBy(asc(projectTask.createdAt));

  return rows.map((r) => ({ ...r, status: r.status as TaskStatus }));
}

/**
 * Las subtareas de proyecto asignadas a ESTA persona, de cualquier proyecto de la empresa.
 *
 * El complemento por persona de `listProjectTasks`, que es por proyecto. Existe para la bandeja
 * de `/[org]/tareas`: sin esto, "todo lo que tengo que hacer" dejaba fuera justo el trabajo que
 * sale de un proyecto, que es la mayor parte del trabajo de un empleado.
 *
 * `hecha` se excluye en SQL y no después: una bandeja de pendientes que trae lo terminado para
 * tirarlo en memoria se pone lenta el mismo mes en que el equipo empieza a usarla.
 */
export async function listMyProjectTasks(
  userId: string,
  orgId: string,
): Promise<(ProjectTaskRow & { projectName: string })[]> {
  await assertMembership(userId, orgId);

  const rows = await db
    .select({
      id: projectTask.id,
      projectId: projectTask.projectId,
      projectName: project.name,
      title: projectTask.title,
      status: projectTask.status,
      assignedTo: projectTask.assignedTo,
      assigneeName: profile.fullName,
      dueAt: projectTask.dueAt,
      estimatedHours: projectTask.estimatedHours,
      actualHours: projectTask.actualHours,
    })
    .from(projectTask)
    .innerJoin(project, eq(project.id, projectTask.projectId))
    .leftJoin(profile, eq(profile.id, projectTask.assignedTo))
    .where(
      and(
        eq(projectTask.orgId, orgId),
        eq(projectTask.assignedTo, userId),
        ne(projectTask.status, "hecha"),
      ),
    )
    .orderBy(asc(projectTask.dueAt), asc(projectTask.createdAt));

  return rows.map((r) => ({ ...r, status: r.status as TaskStatus }));
}

/** Cuántas subtareas abiertas tiene esta persona. Mismo where que `listMyProjectTasks`. */
export async function countMyOpenProjectTasks(userId: string, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(projectTask)
    .where(
      and(
        eq(projectTask.orgId, orgId),
        eq(projectTask.assignedTo, userId),
        ne(projectTask.status, "hecha"),
      ),
    );
  return Number(row?.n ?? 0);
}

const tareaSchema = z.object({
  title: z.string().trim().min(3, "Escribe qué hay que hacer."),
  assignedTo: z.uuid().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  estimatedHours: z.coerce.number().min(0).max(9999).nullable().optional(),
});

/**
 * Agrega una subtarea a un proyecto.
 *
 * El proyecto se valida contra ESTA empresa antes de escribir: un projectId de otra organización
 * en el formulario no puede acabar en la fila (mismo patrón que createObjective y createProject).
 */
export async function addProjectTask(
  userId: string,
  orgId: string,
  projectId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño agrega tareas a un proyecto.", "FORBIDDEN");
  }

  const parsed = tareaSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const d = parsed.data;

  if (!(await belongsToOrg(project, projectId, orgId))) {
    return fail("Ese proyecto no es de esta empresa.", "NOT_FOUND");
  }

  const [row] = await db
    .insert(projectTask)
    .values({
      orgId,
      projectId,
      title: d.title,
      assignedTo: d.assignedTo ?? null,
      ...(d.status ? { status: d.status } : {}),
      dueAt: d.dueAt ?? null,
      estimatedHours: d.estimatedHours == null ? null : d.estimatedHours.toFixed(2),
    })
    .returning({ id: projectTask.id });

  return row ? { ok: true, data: row } : fail("No se pudo guardar la tarea.", "DB_ERROR");
}

/**
 * Mueve una subtarea de estado. Cualquiera del equipo, no solo el dueño: mover tu propia tarea a
 * "en curso" no es una decisión de dirección, y pedir permiso para hacerlo garantiza que el
 * tablero esté siempre desactualizado.
 */
export async function moveProjectTask(
  userId: string,
  orgId: string,
  taskId: string,
  status: TaskStatus,
  actualHours?: number | null,
): Promise<Result<true>> {
  await assertMembership(userId, orgId);

  const parsed = z.enum(TASK_STATUSES).safeParse(status);
  if (!parsed.success) return fail("Ese estado no existe.");

  const [row] = await db
    .update(projectTask)
    .set({
      status: parsed.data,
      ...(actualHours !== undefined
        ? { actualHours: actualHours === null ? null : actualHours.toFixed(2) }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(projectTask.id, taskId), eq(projectTask.orgId, orgId)))
    .returning({ id: projectTask.id });

  return row ? { ok: true, data: true } : fail("Esa tarea no existe en esta empresa.", "NOT_FOUND");
}

const coordinacionSchema = z.object({
  dependsOn: z.array(z.uuid()).max(20).optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  leadId: z.uuid().nullable().optional(),
  budget: z.coerce.number().min(0).nullable().optional(),
  spent: z.coerce.number().min(0).nullable().optional(),
  startAt: z.coerce.date().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

/**
 * Declara de qué depende un proyecto, quién lo lleva y cuánto cuesta.
 *
 * Dos cosas que se revisan antes de escribir, y las dos por el mismo motivo —un id que llegó de un
 * formulario no es de fiar:
 *
 *  1. Cada dependencia tiene que ser un proyecto de ESTA empresa. Sin este filtro, el grafo podría
 *     apuntar a una organización ajena; no fugaría nada (loadProjectGraph solo resuelve ids que ya
 *     cargó de este org), pero dejaría basura que después nadie entiende.
 *  2. Un proyecto no puede depender de sí mismo — se bloquearía para siempre.
 */
export async function setProjectCoordination(
  userId: string,
  orgId: string,
  projectId: string,
  input: unknown,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño coordina los proyectos.", "FORBIDDEN");
  }

  const parsed = coordinacionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const d = parsed.data;

  let dependsOn: string[] | undefined;
  if (d.dependsOn) {
    if (d.dependsOn.includes(projectId)) return fail("Un proyecto no puede depender de sí mismo.");
    const validos =
      d.dependsOn.length === 0
        ? []
        : await db
            .select({ id: project.id })
            .from(project)
            .where(and(eq(project.orgId, orgId), inArray(project.id, d.dependsOn)));
    if (validos.length !== d.dependsOn.length) {
      return fail("Alguna de esas dependencias no es un proyecto de esta empresa.");
    }
    dependsOn = validos.map((v) => v.id);
  }

  const [row] = await db
    .update(project)
    .set({
      ...(dependsOn !== undefined ? { dependsOn } : {}),
      ...(d.risk ? { risk: d.risk } : {}),
      ...(d.leadId !== undefined ? { leadId: d.leadId } : {}),
      ...(d.budget !== undefined
        ? { budget: d.budget === null ? null : d.budget.toFixed(2) }
        : {}),
      ...(d.spent !== undefined ? { spent: d.spent === null ? null : d.spent.toFixed(2) } : {}),
      ...(d.startAt !== undefined ? { startAt: d.startAt } : {}),
      ...(d.dueAt !== undefined ? { dueAt: d.dueAt } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(project.id, projectId), eq(project.orgId, orgId)))
    .returning({ id: project.id });

  return row ? { ok: true, data: true } : fail("Ese proyecto no existe en esta empresa.", "NOT_FOUND");
}
