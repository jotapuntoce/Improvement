// Lo que el dueño tiene pendiente, de todas sus empresas y de su relación con Improvement, en una
// sola lista ordenada por qué tan urgente es.
//
// Mezclar las dos cosas es deliberado: para el dueño no hay diferencia entre "tengo un objetivo
// vencido" y "tengo un pago sin hacer" — las dos frenan su empresa y las dos le tocan a él. Verlas
// en listas separadas lo obliga a priorizar de cabeza cada vez que abre el panel.
//
// Además, un cliente cuya empresa todavía se está construyendo (Jaime Salinas hoy) no tiene un solo
// objetivo: si la lista fueran solo objetivos, abriría su panel y no vería nada que hacer.
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { companyRequest, membership, objective, organization, payment } from "@jotapuntoce/db/schema";

export type TaskKind = "pago" | "objetivo" | "solicitud";

export interface OwnerTask {
  id: string;
  kind: TaskKind;
  title: string;
  /** De qué empresa viene, o el contexto que hace entendible el pendiente sin abrirlo. */
  context: string;
  dueDate: Date | null;
  overdue: boolean;
  priority: number;
  href: string | null;
}

/**
 * Cuánto pesa cada tipo de pendiente cuando no hay una fecha que lo ordene.
 *
 * Un pago pesa casi como el objetivo más importante posible (100) porque bloquea la construcción
 * entera; una solicitud esperando aprobación pesa la mitad: importa, pero el que tiene que moverse
 * es Improvement, no el dueño. Un objetivo pesa lo que su propio impact_weight diga — el dueño ya
 * decidió ahí qué tan importante es.
 */
const PESO_PAGO = 90;
const PESO_SOLICITUD = 45;

const DIA_MS = 86_400_000;

/**
 * La prioridad de un pendiente: su peso más su urgencia.
 *
 * Vencido salta hasta arriba de todo (1000) sin importar el peso — un objetivo trivial que ya venció
 * se resuelve antes que uno importante que vence en un mes, porque ya está costando. Dentro de lo no
 * vencido, la urgencia sube conforme se acerca la fecha y se apaga a los 60 días: lo que vence en
 * dos meses no compite con lo de esta semana, ordena su peso.
 */
export function taskPriority(weight: number, dueDate: Date | null, now: Date): number {
  if (!dueDate) return weight;
  const days = (dueDate.getTime() - now.getTime()) / DIA_MS;
  if (days < 0) return weight + 1000;
  return weight + Math.max(0, 60 - days);
}

function sortTasks(tasks: OwnerTask[]): OwnerTask[] {
  return tasks.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    // Empate de prioridad: gana el que vence antes. Sin fecha va al final — no es que no importe,
    // es que nada lo está apurando.
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

/** Qué parte del peso total concentra el grupo vital. La regla 80/20, escrita una sola vez. */
export const PARETO_SHARE = 0.8;

/**
 * Los pocos pendientes que concentran el 80% del peso de todo lo que hay pendiente hoy.
 *
 * La lista entra ya ordenada por prioridad, así que el grupo vital es un prefijo: se van sumando
 * prioridades desde el más urgente hasta cubrir el 80%. Lo que queda afuera no es basura — es el
 * 20% de resultado que cuesta el 80% del día, y por eso no va arriba.
 *
 * Devuelve cuántos son, no las tareas: quien dibuja ya tiene la lista y solo necesita saber dónde
 * está el corte. Devolver una segunda lista invitaba a que las dos se desincronizaran.
 */
export function paretoCut(tasks: OwnerTask[]): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((n, t) => n + t.priority, 0);
  // Sin peso que repartir (todo en cero) no hay 20% que valga más que otro: todos son vitales.
  if (total <= 0) return tasks.length;

  let acumulado = 0;
  for (let i = 0; i < tasks.length; i++) {
    acumulado += tasks[i]!.priority;
    if (acumulado / total >= PARETO_SHARE) return i + 1;
  }
  return tasks.length;
}

export async function loadOwnerTasks(userId: string, now = new Date()): Promise<OwnerTask[]> {
  // Solo las empresas donde es DUEÑO: un empleado que entre aquí no tiene por qué ver la deuda de su
  // jefe, y el panel de portafolio es del dueño por definición.
  const owned = await db
    .select({ orgId: membership.orgId, name: organization.name })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(and(eq(membership.userId, userId), eq(membership.role, "owner")));

  const orgIds = owned.map((o) => o.orgId);
  const nameOf = new Map(owned.map((o) => [o.orgId, o.name]));

  const [objectives, payments, requests] = await Promise.all([
    orgIds.length
      ? db
          .select()
          .from(objective)
          .where(and(inArray(objective.orgId, orgIds), ne(objective.status, "completed")))
      : [],
    orgIds.length
      ? db
          .select()
          .from(payment)
          .where(and(inArray(payment.orgId, orgIds), isNull(payment.paidAt)))
      : [],
    db
      .select()
      .from(companyRequest)
      .where(and(eq(companyRequest.requesterId, userId), eq(companyRequest.status, "pending"))),
  ]);

  const tasks: OwnerTask[] = [
    ...payments.map((p) => ({
      id: `pago:${p.id}`,
      kind: "pago" as const,
      title: p.concept,
      context: `${nameOf.get(p.orgId) ?? "Tu empresa"} · Pago a Improvement`,
      dueDate: p.dueDate,
      overdue: p.dueDate < now,
      priority: taskPriority(PESO_PAGO, p.dueDate, now),
      href: "/empresas/configuracion",
    })),
    ...objectives.map((o) => ({
      id: `objetivo:${o.id}`,
      kind: "objetivo" as const,
      title: o.title,
      context: nameOf.get(o.orgId) ?? "Tu empresa",
      dueDate: o.dueDate,
      overdue: o.dueDate < now,
      priority: taskPriority(o.impactWeight, o.dueDate, now),
      href: `/${o.orgId}/objetivos`,
    })),
    ...requests.map((r) => ({
      id: `solicitud:${r.id}`,
      kind: "solicitud" as const,
      title: `${r.companyName} espera aprobación`,
      context: "Solicitud enviada a Improvement",
      dueDate: null,
      overdue: false,
      priority: PESO_SOLICITUD,
      href: null,
    })),
  ];

  return sortTasks(tasks);
}
