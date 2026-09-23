// Lo que Improvement le propone al equipo, y qué pasa con ello.
//
// El recorrido completo de una tarea delegada: el motor la crea en fase de sugerencia → el dueño
// acepta la sugerencia → la persona la acepta o la rechaza → la trabaja → la marca completada → el
// dueño la revisa → la fase de medición la lee para saber si el ciclo sirvió.
//
// POR QUÉ NO ES UN `objective`. Un objetivo lo emite el dueño y paga puntos al completarse. Una
// tarea delegada es una PROPUESTA: mientras nadie la acepta no es nada, y si fueran la misma
// tabla, una sugerencia que el dueño va a rechazar ya estaría en el tablero de alguien pagando
// puntos. Cuando sí se acepta se puede materializar en un objetivo de verdad, y ahí entra al
// motor de puntos por el camino normal (objectiveId).
//
// LO QUE EL EMPLEADO VE Y LO QUE NO. Ve su tarea: título, para qué, cuándo. No ve el ciclo, ni la
// observación, ni la inferencia — decisión de diseño #1 del plan, y la misma razón por la que un
// empleado no puede leer el nivel de responsabilidad de otro (no negociable #4): el razonamiento
// del Director General sobre un área habla de la gente de esa área.
//
// Este archivo es motor: el reparto se decide por carga, nunca por un nombre
// (.claude/rules/motor-generico.md).
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import {
  area,
  delegatedTask,
  membership,
  objective,
  profile,
} from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export const TASK_STATUSES = [
  "sugerida",
  "aceptada",
  "rechazada",
  "en_progreso",
  "completada",
] as const;
export type DelegatedStatus = (typeof TASK_STATUSES)[number];

export const DELEGATED_STATUS_LABEL: Record<DelegatedStatus, string> = {
  sugerida: "Sugerida por Improvement",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  en_progreso: "En curso",
  completada: "Completada",
};

export type DelegatedTaskRow = typeof delegatedTask.$inferSelect;

export interface DelegatedCard {
  id: string;
  title: string;
  description: string | null;
  expectedOutcome: string | null;
  /** Por qué esta tarea toca la causa raíz y no el síntoma. null en una tarea sin ACR detrás. */
  attacksRoot: string | null;
  status: DelegatedStatus;
  areaName: string | null;
  areaColor: string | null;
  assigneeName: string | null;
  assignedTo: string | null;
  ownerReview: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * A quién le toca, dentro de un área: a quien menos objetivos abiertos trae.
 *
 * Por carga y no por antigüedad, jerarquía ni "el que siempre dice que sí". Es la única regla que
 * un motor genérico puede aplicar sin conocer a la gente, y es la que el dueño puede corregir de
 * un clic si se equivoca. Devuelve null cuando el área no tiene a nadie: la tarea nace sin dueño y
 * el dueño la asigna — mejor una tarea sin asignar que una asignada al azar.
 */
export async function elegirResponsable(orgId: string, areaId: string | null): Promise<string | null> {
  if (!areaId) return null;

  const candidatos = await db
    .select({ userId: membership.userId })
    .from(membership)
    .innerJoin(profile, eq(profile.id, membership.userId))
    // Los platform admins no son personal de la empresa del cliente — mismo filtro que los otros
    // tres lugares que listan gente de un org.
    .where(
      and(
        eq(membership.orgId, orgId),
        eq(membership.areaId, areaId),
        eq(profile.isPlatformAdmin, false),
      ),
    );

  if (candidatos.length === 0) return null;
  const ids = candidatos.map((c) => c.userId);

  const cargas = await db
    .select({ id: objective.assignedEmployeeId, n: count() })
    .from(objective)
    .where(
      and(
        eq(objective.orgId, orgId),
        ne(objective.status, "completed"),
        inArray(objective.assignedEmployeeId, ids),
      ),
    )
    .groupBy(objective.assignedEmployeeId);

  const porPersona = new Map(ids.map((id) => [id, 0]));
  for (const c of cargas) if (c.id) porPersona.set(c.id, Number(c.n));

  // Empate: gana el primero de la consulta, que es estable. No se aleatoriza — que la misma
  // situación reparta distinto cada vez haría imposible entender por qué le tocó a quien le tocó.
  let elegido = ids[0]!;
  let minimo = porPersona.get(elegido) ?? 0;
  for (const id of ids) {
    const carga = porPersona.get(id) ?? 0;
    if (carga < minimo) {
      elegido = id;
      minimo = carga;
    }
  }
  return elegido;
}

export interface TareaPropuesta {
  title: string;
  description?: string;
  expectedOutcome?: string;
  /** El nombre del área tal como el modelo lo escribió. Se resuelve contra las de esta empresa. */
  areaName?: string | null;
  /** Por qué esta tarea toca la causa raíz y no el síntoma (ver `attacks_root` en el esquema). */
  atacaLaRaiz?: string;
}

/**
 * Materializa las tareas que propuso la fase de sugerencia.
 *
 * El nombre de área que devolvió el modelo se resuelve contra las áreas REALES de esta empresa,
 * comparando sin acentos ni mayúsculas. Si no resuelve, la tarea nace sin área en vez de fallar:
 * media sugerencia sirve más que ninguna, y corregirle el área al dueño le cuesta un clic. Lo que
 * nunca pasa es que un nombre inventado por el modelo se convierta en un id.
 */
export async function createTasksFromSuggestion(
  orgId: string,
  cycleId: string,
  propuestas: TareaPropuesta[],
): Promise<DelegatedTaskRow[]> {
  if (propuestas.length === 0) return [];

  const areas = await db
    .select({ id: area.id, name: area.name })
    .from(area)
    .where(eq(area.orgId, orgId));
  const porNombre = new Map(areas.map((a) => [normalizar(a.name), a.id] as const));

  const filas: DelegatedTaskRow[] = [];
  for (const p of propuestas) {
    const areaId = p.areaName ? (porNombre.get(normalizar(p.areaName)) ?? null) : null;
    const assignedTo = await elegirResponsable(orgId, areaId);

    const [row] = await db
      .insert(delegatedTask)
      .values({
        orgId,
        cycleId,
        areaId,
        assignedTo,
        title: p.title.slice(0, 160),
        description: p.description?.trim() || null,
        expectedOutcome: p.expectedOutcome?.trim() || null,
        attacksRoot: p.atacaLaRaiz?.trim() || null,
      })
      .returning();
    if (row) filas.push(row);
  }
  return filas;
}

/** Sin acentos, sin mayúsculas, sin espacios de sobra — para comparar "Atención a clientes" con
 *  "atencion a clientes" sin que el modelo tenga que acertarle a la tilde. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

const COLUMNAS = {
  id: delegatedTask.id,
  title: delegatedTask.title,
  description: delegatedTask.description,
  expectedOutcome: delegatedTask.expectedOutcome,
  attacksRoot: delegatedTask.attacksRoot,
  status: delegatedTask.status,
  areaName: area.name,
  areaColor: area.color,
  assigneeName: profile.fullName,
  assignedTo: delegatedTask.assignedTo,
  ownerReview: delegatedTask.ownerReview,
  dueAt: delegatedTask.dueAt,
  completedAt: delegatedTask.completedAt,
  createdAt: delegatedTask.createdAt,
};

function toCard(r: {
  id: string;
  title: string;
  description: string | null;
  expectedOutcome: string | null;
  attacksRoot: string | null;
  status: string;
  areaName: string | null;
  areaColor: string | null;
  assigneeName: string | null;
  assignedTo: string | null;
  ownerReview: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}): DelegatedCard {
  return { ...r, status: r.status as DelegatedStatus };
}

/**
 * Las tareas que Improvement le propuso a ESTA persona.
 *
 * El filtro por assigned_to va en el where y no en la pantalla: es la misma regla que la política
 * RLS de 0022, escrita también del lado de la app porque en el camino de la app RLS no corre
 * (CLAUDE.md, "Dos puertas, no dos cerraduras").
 */
export async function listMyDelegatedTasks(
  userId: string,
  orgId: string,
  soloAbiertas = true,
): Promise<DelegatedCard[]> {
  await assertMembership(userId, orgId);

  const conditions = [eq(delegatedTask.orgId, orgId), eq(delegatedTask.assignedTo, userId)];
  if (soloAbiertas) conditions.push(ne(delegatedTask.status, "rechazada"));

  const rows = await db
    .select(COLUMNAS)
    .from(delegatedTask)
    .leftJoin(area, eq(area.id, delegatedTask.areaId))
    .leftJoin(profile, eq(profile.id, delegatedTask.assignedTo))
    .where(and(...conditions))
    .orderBy(asc(delegatedTask.createdAt));

  return rows.map(toCard);
}

/** Todas las tareas que Improvement ha delegado en esta empresa. Solo el dueño. */
export async function listDelegations(
  ownerId: string,
  orgId: string,
  cycleId?: string,
): Promise<DelegatedCard[]> {
  if (!(await findOwnerMembership(ownerId, orgId))) return [];

  const conditions = [eq(delegatedTask.orgId, orgId)];
  if (cycleId) conditions.push(eq(delegatedTask.cycleId, cycleId));

  const rows = await db
    .select(COLUMNAS)
    .from(delegatedTask)
    .leftJoin(area, eq(area.id, delegatedTask.areaId))
    .leftJoin(profile, eq(profile.id, delegatedTask.assignedTo))
    .where(and(...conditions))
    .orderBy(sql`${delegatedTask.createdAt} desc`);

  return rows.map(toCard);
}

const respuestaSchema = z.object({
  status: z.enum(["aceptada", "rechazada", "en_progreso"]),
  note: z.string().trim().max(600).optional(),
});

/**
 * La persona contesta: la acepta, la rechaza o dice que ya está en ella.
 *
 * Solo sobre SUS tareas — el where lleva assigned_to además del id, así que un id de la tarea de
 * otra persona no alcanza para contestarla. Y solo desde `sugerida` o `aceptada`: una tarea ya
 * completada no se puede "rechazar" para atrás, porque la medición del ciclo ya la contó.
 */
export async function respondToTask(
  userId: string,
  orgId: string,
  taskId: string,
  input: unknown,
): Promise<Result<true>> {
  await assertMembership(userId, orgId);

  const parsed = respuestaSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");

  const [row] = await db
    .update(delegatedTask)
    .set({
      status: parsed.data.status,
      ...(parsed.data.note ? { result: { nota: parsed.data.note } } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(delegatedTask.id, taskId),
        eq(delegatedTask.orgId, orgId),
        eq(delegatedTask.assignedTo, userId),
        inArray(delegatedTask.status, ["sugerida", "aceptada", "en_progreso"]),
      ),
    )
    .returning({ id: delegatedTask.id });

  return row ? { ok: true, data: true } : fail("Esa tarea no es tuya o ya se cerró.", "NOT_FOUND");
}

const completadaSchema = z.object({
  feedback: z.string().trim().max(1000).optional(),
  /** Qué tan bien salió, según quien la hizo. 1 a 5. Es su lectura, no una calificación de nadie. */
  quality: z.coerce.number().int().min(1).max(5).optional(),
});

/**
 * Quien la tenía la da por terminada.
 *
 * `completedAt` se sella aquí y no cuando el dueño la revise: la tarea está hecha cuando quien la
 * hizo dice que está hecha, y esperar la revisión para sellar la fecha haría que el tiempo de
 * ejecución que mide el ciclo incluyera lo que el dueño tardó en verla.
 */
export async function completeDelegatedTask(
  userId: string,
  orgId: string,
  taskId: string,
  input: unknown = {},
): Promise<Result<true>> {
  await assertMembership(userId, orgId);

  const parsed = completadaSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");

  const ahora = new Date();
  const [row] = await db
    .update(delegatedTask)
    .set({
      status: "completada",
      completedAt: ahora,
      result: {
        completedAt: ahora.toISOString(),
        ...(parsed.data.quality !== undefined ? { quality: parsed.data.quality } : {}),
        ...(parsed.data.feedback ? { feedback: parsed.data.feedback } : {}),
      },
      updatedAt: ahora,
    })
    .where(
      and(
        eq(delegatedTask.id, taskId),
        eq(delegatedTask.orgId, orgId),
        eq(delegatedTask.assignedTo, userId),
        inArray(delegatedTask.status, ["aceptada", "en_progreso"]),
      ),
    )
    .returning({ id: delegatedTask.id });

  return row ? { ok: true, data: true } : fail("Esa tarea no es tuya o no está aceptada.", "NOT_FOUND");
}

/** El dueño opina de una tarea ya terminada. No cambia el estado: la tarea ya está completada. La
 *  opinión la lee quien hizo la tarea, en su bandeja ("Tu jefe dijo…"); el motor NO la lee en la
 *  medición — la medición trabaja con el estado de las tareas y las métricas, no con prosa. */
export async function reviewDelegatedTask(
  ownerId: string,
  orgId: string,
  taskId: string,
  review: string,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(ownerId, orgId))) {
    return fail("Solo el dueño revisa las tareas delegadas.", "FORBIDDEN");
  }
  const texto = review.trim();
  if (!texto) return fail("Escribe qué te pareció.");

  const [row] = await db
    .update(delegatedTask)
    .set({ ownerReview: texto.slice(0, 1000), updatedAt: new Date() })
    .where(and(eq(delegatedTask.id, taskId), eq(delegatedTask.orgId, orgId)))
    .returning({ id: delegatedTask.id });

  return row ? { ok: true, data: true } : fail("Esa tarea no existe en esta empresa.", "NOT_FOUND");
}

/**
 * El dueño asigna o reasigna a mano una tarea que el reparto automático dejó sin dueño (o le
 * asignó a quien no era). La persona tiene que ser de esta empresa: un userId suelto no basta.
 */
export async function assignDelegatedTask(
  ownerId: string,
  orgId: string,
  taskId: string,
  assignedTo: string | null,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(ownerId, orgId))) {
    return fail("Solo el dueño reasigna una tarea delegada.", "FORBIDDEN");
  }

  if (assignedTo) {
    const [miembro] = await db
      .select({ userId: membership.userId })
      .from(membership)
      .where(and(eq(membership.orgId, orgId), eq(membership.userId, assignedTo)))
      .limit(1);
    if (!miembro) return fail("Esa persona no trabaja en esta empresa.");
  }

  const [row] = await db
    .update(delegatedTask)
    .set({ assignedTo, updatedAt: new Date() })
    .where(and(eq(delegatedTask.id, taskId), eq(delegatedTask.orgId, orgId)))
    .returning({ id: delegatedTask.id });

  return row ? { ok: true, data: true } : fail("Esa tarea no existe en esta empresa.", "NOT_FOUND");
}

/** Las tareas de un ciclo, como las lee la fase de medición. Sin guard: lo llama el motor, que ya
 *  cargó el ciclo de este org y no corre en nombre de ninguna sesión. */
export async function tasksOfCycle(orgId: string, cycleId: string) {
  return db
    .select({
      title: delegatedTask.title,
      status: delegatedTask.status,
      expectedOutcome: delegatedTask.expectedOutcome,
    })
    .from(delegatedTask)
    .where(and(eq(delegatedTask.orgId, orgId), eq(delegatedTask.cycleId, cycleId)));
}

/**
 * Cuántas tareas de este ciclo siguen abiertas. Lo enseña la pantalla del Director en la
 * recepción. Sin guard: lo llama loadLobby, que ya validó la membresía del dueño.
 */
export async function countOpenDelegations(orgId: string, cycleId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(delegatedTask)
    .where(
      and(
        eq(delegatedTask.orgId, orgId),
        eq(delegatedTask.cycleId, cycleId),
        inArray(delegatedTask.status, ["sugerida", "aceptada", "en_progreso"]),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Cuántas tareas abiertas tiene ESTA persona en esta empresa, de cualquier vuelta.
 *
 * Para el contador del enlace en la recepción: un enlace que no dice cuánto hay detrás manda a
 * la gente a una pantalla vacía. Cuenta en SQL y no trayendo las filas — la recepción dibuja un
 * número, no una lista.
 *
 * Sin `assertMembership` adentro, igual que `countOpenDelegations` aquí arriba: quien llama ya
 * verificó la pertenencia. Y aunque no lo hiciera, el where es `assigned_to = userId` — lo peor
 * que alguien puede contar son sus propias tareas.
 */
export async function countMyOpenDelegations(userId: string, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(delegatedTask)
    .where(
      and(
        eq(delegatedTask.orgId, orgId),
        eq(delegatedTask.assignedTo, userId),
        inArray(delegatedTask.status, ["sugerida", "aceptada", "en_progreso"]),
      ),
    );
  return Number(row?.n ?? 0);
}

/** ¿Ya se cerraron todas las tareas de este ciclo? El experimento termina cuando nada queda
 *  abierto: ni sugerida, ni aceptada, ni en curso. Un ciclo sin tareas cuenta como terminado. */
export async function cycleTasksSettled(orgId: string, cycleId: string): Promise<boolean> {
  return (await countOpenDelegations(orgId, cycleId)) === 0;
}
