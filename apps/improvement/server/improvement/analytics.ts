// Qué tan bien está dirigiendo Improvement. En números, para el dueño.
//
// Es la pantalla que impide que el Director General sea un acto de fe. Si de doce propuestas el
// dueño aceptó dos y de esas dos ninguna movió nada, eso tiene que verse — y verse es lo que
// permite corregirlo, o apagarlo.
//
// DOS COSAS QUE ESTE MÓDULO NO HACE, a propósito:
//
//  1. No inventa un ROI en pesos. El plan lo contemplaba (`estimatedROI: USD`), y no está: para
//     traducir "tres objetivos menos retrasados" a dinero haría falta saber cuánto vale una hora
//     de cada persona, y ese dato no existe en ninguna tabla. Un número de dinero calculado a
//     partir de nada es peor que no tenerlo, porque se cita en juntas. Lo que sí se enseña es el
//     costo real de IA, que sí está medido (llm_calls), y el movimiento de los indicadores.
//  2. No califica a nadie. Mide vueltas, no personas.
//
// Este archivo es motor: cuenta filas de la empresa que le pasen por parámetro.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, delegatedTask, improvementCycle, llmCalls } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";

export interface CycleTimelineEntry {
  id: string;
  title: string;
  phase: string;
  result: string | null;
  decision: string | null;
  areaName: string | null;
  createdAt: Date;
  closedAt: Date | null;
  /** Cuántos días tardó de abrirse a cerrarse. null si sigue abierta. */
  dias: number | null;
}

export interface ImprovementAnalytics {
  cyclesTotal: number;
  cyclesCompleted: number;
  cyclesOpen: number;
  /** De las vueltas cerradas con resultado, cuántas salieron bien. 0–100. null si no hay ninguna. */
  successRate: number | null;
  /** Días promedio de una vuelta completa. null si ninguna se ha cerrado. */
  avgCycleDurationDays: number | null;
  suggestionsAccepted: number;
  suggestionsRejected: number;
  suggestionsModified: number;
  tasksSuggested: number;
  tasksCompleted: number;
  /** Lo que ha costado el Director General, en dólares. Medido, no estimado. */
  costUsd: number;
  /** Áreas donde alguna vuelta cerró con éxito, con cuántas. */
  areasImproved: { name: string; cycles: number }[];
  /** Lo que dejó escrito cada vuelta cerrada, lo más reciente primero. */
  topLearnings: string[];
  timeline: CycleTimelineEntry[];
}

const VACIO: ImprovementAnalytics = {
  cyclesTotal: 0,
  cyclesCompleted: 0,
  cyclesOpen: 0,
  successRate: null,
  avgCycleDurationDays: null,
  suggestionsAccepted: 0,
  suggestionsRejected: 0,
  suggestionsModified: 0,
  tasksSuggested: 0,
  tasksCompleted: 0,
  costUsd: 0,
  areasImproved: [],
  topLearnings: [],
  timeline: [],
};

/**
 * El tablero completo, en tres consultas.
 *
 * Los ciclos se traen enteros y se agregan en memoria en vez de pedirle a Postgres seis
 * `count(... filter ...)` distintos: son decenas de filas por empresa, no millones, y la línea de
 * tiempo necesita las filas de todos modos. Pedir los agregados por separado sería una consulta
 * más para recalcular lo que ya está en la mano.
 *
 * Devuelve el tablero en ceros a quien no es el dueño, en vez de lanzar: el alcance se resuelve
 * ADENTRO (convención de la casa) y la pantalla que lo protege usa su propio guard.
 */
export async function loadAnalytics(
  userId: string,
  orgId: string,
): Promise<ImprovementAnalytics> {
  if (!(await findOwnerMembership(userId, orgId))) return VACIO;

  const [ciclos, tareas, costo] = await Promise.all([
    db
      .select({
        id: improvementCycle.id,
        title: improvementCycle.title,
        phase: improvementCycle.phase,
        result: improvementCycle.result,
        decision: improvementCycle.ownerDecision,
        description: improvementCycle.description,
        areaId: improvementCycle.areaId,
        createdAt: improvementCycle.createdAt,
        closedAt: improvementCycle.closedAt,
      })
      .from(improvementCycle)
      .where(and(eq(improvementCycle.orgId, orgId), eq(improvementCycle.ownerId, userId)))
      .orderBy(sql`${improvementCycle.createdAt} desc`),
    db
      .select({ status: delegatedTask.status, n: sql<number>`count(*)` })
      .from(delegatedTask)
      .where(eq(delegatedTask.orgId, orgId))
      .groupBy(delegatedTask.status),
    db
      .select({ total: sql<string>`coalesce(sum(${llmCalls.costUsd}), 0)` })
      .from(llmCalls)
      .where(and(eq(llmCalls.orgId, orgId), eq(llmCalls.purpose, "director"))),
  ]);

  if (ciclos.length === 0) {
    return { ...VACIO, costUsd: Number(costo[0]?.total ?? 0) };
  }

  const areaIds = [...new Set(ciclos.map((c) => c.areaId).filter((a): a is string => a !== null))];
  const nombreDeArea = new Map<string, string>();
  if (areaIds.length > 0) {
    const filas = await db
      .select({ id: area.id, name: area.name })
      .from(area)
      .where(and(eq(area.orgId, orgId), inArray(area.id, areaIds)));
    for (const f of filas) nombreDeArea.set(f.id, f.name);
  }

  const cerrados = ciclos.filter((c) => c.phase === "cerrado");
  // Solo las que llegaron a tener un veredicto cuentan para la tasa. Una cerrada a mano vale
  // `neutral` y no entra: ni acertó ni falló, y meterla al denominador castigaría a Improvement
  // por algo que decidió el calendario.
  const conVeredicto = cerrados.filter((c) => c.result === "exitoso" || c.result === "fallido");
  const exitosas = conVeredicto.filter((c) => c.result === "exitoso");

  const duraciones = cerrados
    .filter((c) => c.closedAt !== null)
    .map((c) => (c.closedAt!.getTime() - c.createdAt.getTime()) / 86_400_000);

  const porArea = new Map<string, number>();
  for (const c of exitosas) {
    if (!c.areaId) continue;
    const nombre = nombreDeArea.get(c.areaId);
    if (nombre) porArea.set(nombre, (porArea.get(nombre) ?? 0) + 1);
  }

  const porEstado = new Map(tareas.map((t) => [t.status, Number(t.n)] as const));
  const tasksSuggested = [...porEstado.values()].reduce((a, b) => a + b, 0);

  return {
    cyclesTotal: ciclos.length,
    cyclesCompleted: cerrados.length,
    cyclesOpen: ciclos.length - cerrados.length,
    successRate:
      conVeredicto.length === 0
        ? null
        : Math.round((exitosas.length / conVeredicto.length) * 100),
    avgCycleDurationDays:
      duraciones.length === 0
        ? null
        : Math.round((duraciones.reduce((a, b) => a + b, 0) / duraciones.length) * 10) / 10,
    suggestionsAccepted: ciclos.filter((c) => c.decision === "acepto").length,
    suggestionsRejected: ciclos.filter((c) => c.decision === "rechazo").length,
    suggestionsModified: ciclos.filter((c) => c.decision === "modificar").length,
    tasksSuggested,
    tasksCompleted: porEstado.get("completada") ?? 0,
    costUsd: Number(costo[0]?.total ?? 0),
    areasImproved: [...porArea.entries()]
      .map(([name, cycles]) => ({ name, cycles }))
      .sort((a, b) => b.cycles - a.cycles),
    // El aprendizaje de cada vuelta es la última línea que la medición apiló en su descripción.
    topLearnings: cerrados
      .map((c) => c.description?.split("\n\n").at(-1)?.trim())
      .filter((s): s is string => Boolean(s))
      .slice(0, 5),
    timeline: ciclos.map((c) => ({
      id: c.id,
      title: c.title,
      phase: c.phase,
      result: c.result,
      decision: c.decision,
      areaName: c.areaId ? (nombreDeArea.get(c.areaId) ?? null) : null,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      dias:
        c.closedAt === null
          ? null
          : Math.round((c.closedAt.getTime() - c.createdAt.getTime()) / 86_400_000),
    })),
  };
}
