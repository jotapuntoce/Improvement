// Todo lo que el Director General necesita saber antes de abrir la boca, en una sola carga.
//
// Es el equivalente del brief que un director general de verdad lee antes de una junta: cómo va
// cada área, qué cuentas preocupan, qué proyectos se atoraron, qué se dijo la última vez y cómo
// salieron las vueltas anteriores. Sin esto, cualquier cosa que diga es una plantilla.
//
// SE RECALCULA EN CADA LLAMADA, nunca se guarda en el ciclo. Un ciclo abierto el lunes que se
// midiera el viernes con los datos del lunes mediría el pasado — y el riesgo "datos stale" del
// plan es exactamente eso. Lo único que sí se guarda son las métricas del experimento (el "antes"
// congelado a propósito, para tener contra qué comparar).
//
// Este archivo es motor (.claude/rules/motor-generico.md): recibe orgId por parámetro y no
// menciona ninguna empresa, cliente ni empleado.
import { and, count, desc, eq, gte, lt, ne } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  improvementCycle,
  objective,
  organization,
  ownerMessage,
} from "@jotapuntoce/db/schema";
import type { DirectorContext, DirectorPhase } from "../ai/prompts/director.ts";
import { loadAreaBoard } from "../areas/loadAreaBoard.ts";
import { listClientsAtRisk } from "../crm/client-extensions.ts";
import { listProjectsAtRisk } from "../erp/projects.ts";
import { listOwnerMemory, ownerBrief } from "../owner/memory.ts";
import { loadRelacion, relacionEnPalabras } from "./relacion.ts";

/** Cuánto del hilo viaja en el prompt. Los últimos y no todos: una conversación de un año no cabe,
 *  y lo que importa para decidir hoy es lo reciente. El histórico completo sigue en la tabla. */
const MENSAJES_EN_CONTEXTO = 12;
/** Cuántas vueltas cerradas se le recuerdan. Suficiente para no repetir lo rechazado. */
const CICLOS_EN_CONTEXTO = 8;

export type CycleRow = typeof improvementCycle.$inferSelect;

/**
 * El contexto completo para una fase.
 *
 * Todas las consultas van en paralelo: son siete lecturas independientes y encadenarlas sumaría
 * siete viajes de ida y vuelta a Supabase a algo que ya corre dentro de un cron.
 */
export async function buildContext(
  ownerId: string,
  orgId: string,
  phase: DirectorPhase,
  cycle: CycleRow,
  tareas: { title: string; status: string; expectedOutcome: string | null }[] = [],
): Promise<DirectorContext> {
  const hace30 = new Date(Date.now() - 30 * 86_400_000);
  const ahora = new Date();

  const [org, memoria, areas, clientes, proyectos, mensajes, previos, metas, relacion] = await Promise.all([
    db
      .select({ name: organization.name, industry: organization.industry })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1),
    listOwnerMemory(ownerId, orgId),
    loadAreaBoard(ownerId, orgId),
    listClientsAtRisk(ownerId, orgId),
    listProjectsAtRisk(ownerId, orgId),
    db
      .select({ role: ownerMessage.role, content: ownerMessage.content })
      .from(ownerMessage)
      .where(and(eq(ownerMessage.orgId, orgId), eq(ownerMessage.ownerId, ownerId)))
      .orderBy(desc(ownerMessage.createdAt))
      .limit(MENSAJES_EN_CONTEXTO),
    db
      .select({
        title: improvementCycle.title,
        result: improvementCycle.result,
        decision: improvementCycle.ownerDecision,
        ownerFeedback: improvementCycle.ownerFeedback,
        tags: improvementCycle.tags,
        // La causa raíz de cada vuelta cerrada viaja al contexto de la siguiente. Es lo que
        // convierte diez vueltas sueltas en un diagnóstico de la empresa.
        rootCause: improvementCycle.rootCause,
        causeCategory: improvementCycle.causeCategory,
      })
      .from(improvementCycle)
      .where(
        and(
          eq(improvementCycle.orgId, orgId),
          eq(improvementCycle.ownerId, ownerId),
          eq(improvementCycle.phase, "cerrado"),
          ne(improvementCycle.id, cycle.id),
        ),
      )
      .orderBy(desc(improvementCycle.closedAt))
      .limit(CICLOS_EN_CONTEXTO),
    contarObjetivos(orgId, hace30, ahora),
    loadRelacion(orgId),
  ]);

  const areaName = cycle.areaId
    ? (areas.find((a) => a.id === cycle.areaId)?.name ?? null)
    : null;

  return {
    phase,
    orgName: org[0]?.name ?? "",
    industry: org[0]?.industry ?? null,
    ownerBrief: ownerBrief(memoria),
    // Qué llevan juntos. Se pasa ya redactado y no como objeto: lo lee un prompt, no un componente,
    // y así el motor y la burbuja cuentan la MISMA historia en vez de dos redacciones que se
    // separan con el tiempo.
    relacion: relacionEnPalabras(relacion),
    areas: areas.map((a) => ({
      name: a.name,
      description: a.description,
      members: a.members,
      objectivesOpen: a.objectivesOpen,
      projects: a.projects,
      clients: a.clients,
    })),
    objetivos: metas,
    clientesEnRiesgo: clientes.map((c) => ({ name: c.name, motivos: c.motivos })),
    proyectosEnRiesgo: proyectos.map((p) => ({
      name: p.name,
      areaName: p.areaName,
      alertas: p.alertas,
    })),
    // La consulta los trae del más nuevo al más viejo (para poder cortar con limit); el prompt los
    // lee como conversación, así que van al revés.
    conversacion: [...mensajes].reverse(),
    aprendizajes: previos.map((p) => ({
      title: p.title,
      result: p.result,
      decision: p.decision,
      ownerFeedback: p.ownerFeedback,
      tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
      rootCause: p.rootCause,
      causeCategory: p.causeCategory,
    })),
    cycle: {
      title: cycle.title,
      description: cycle.description,
      areaName,
      observation: cycle.observation,
      inference: cycle.inference,
      analysis: cycle.analysis,
      suggestion: cycle.aiSuggestion,
      rootCause: cycle.rootCause,
      causeCategory: cycle.causeCategory,
      // jsonb entra como unknown: se valida la forma al leer y no se confía en que la fila la
      // escribió este build. Una fila vieja o escrita a mano deja la lista vacía, nunca lanza.
      whys: Array.isArray(cycle.whys)
        ? (cycle.whys as { pregunta: string; respuesta: string }[])
        : [],
      contributingFactors: Array.isArray(cycle.contributingFactors)
        ? (cycle.contributingFactors as string[])
        : [],
      verification: cycle.verification,
      ownerDecision: cycle.ownerDecision,
      ownerFeedback: cycle.ownerFeedback,
      metrics: (cycle.metrics ?? {}) as Record<string, unknown>,
    },
    tareas,
  };
}

/**
 * Los tres números de objetivos que el motor mira: abiertos, cerrados el último mes y vencidos.
 *
 * "Retrasado" es con fecha pasada y todavía sin completar. Todo objetivo tiene fecha —due_date es
 * notNull en el esquema—, así que no hay caso de "sin fecha" que excluir.
 */
export async function contarObjetivos(
  orgId: string,
  desde: Date,
  ahora: Date,
): Promise<{ abiertos: number; completados30d: number; retrasados: number }> {
  const [abiertos, completados, retrasados] = await Promise.all([
    db
      .select({ n: count() })
      .from(objective)
      .where(and(eq(objective.orgId, orgId), ne(objective.status, "completed"))),
    db
      .select({ n: count() })
      .from(objective)
      .where(
        and(
          eq(objective.orgId, orgId),
          eq(objective.status, "completed"),
          gte(objective.completedAt, desde),
        ),
      ),
    db
      .select({ n: count() })
      .from(objective)
      .where(
        and(
          eq(objective.orgId, orgId),
          ne(objective.status, "completed"),
          // `due_date` es notNull en objective, así que no hace falta un isNotNull: todo objetivo
          // tiene fecha y la comparación sola basta.
          lt(objective.dueDate, ahora),
        ),
      ),
  ]);

  return {
    abiertos: Number(abiertos[0]?.n ?? 0),
    completados30d: Number(completados[0]?.n ?? 0),
    retrasados: Number(retrasados[0]?.n ?? 0),
  };
}

/**
 * La foto de los indicadores hoy. Es lo que se congela como `metrics.antes` al abrir un
 * experimento y como `metrics.despues` al cerrarlo — los mismos campos en las dos puntas, porque
 * comparar dos formas distintas no compara nada.
 */
export async function snapshotMetrics(orgId: string): Promise<Record<string, number>> {
  const ahora = new Date();
  const metas = await contarObjetivos(orgId, new Date(ahora.getTime() - 30 * 86_400_000), ahora);
  return {
    objetivosAbiertos: metas.abiertos,
    objetivosCompletados30d: metas.completados30d,
    objetivosRetrasados: metas.retrasados,
  };
}
