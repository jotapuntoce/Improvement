// Nivel de responsabilidad por empleado — dato sensible, nunca expuesto a nadie más que el propio
// empleado (ni siquiera al owner, ver Pitfalls §02-producto-core: "el owner ve conteos agregados,
// nunca el número por persona" — es exactamente el riesgo de vigilancia laboral que el blueprint
// mitiga a propósito).
import { and, eq, gte } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@jotapuntoce/db";
import { objective, membership, profile } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";

const DEFAULT_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * onTime / (onTime + late + overdueNotCompleted) sobre los objetivos asignados a employeeId en el
 * org con due_date dentro de los últimos windowDays días — porcentaje 0-100 redondeado. Un objetivo
 * todavía sin resolver (pending/in_progress con due_date en el futuro) no cuenta en ningún lado del
 * cociente: no hay veredicto sobre él todavía.
 */
export async function responsibilityLevel(
  employeeId: string,
  orgId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<number> {
  const windowStart = new Date(Date.now() - windowDays * MS_PER_DAY);
  const now = new Date();

  const rows = await db
    .select()
    .from(objective)
    .where(
      and(
        eq(objective.orgId, orgId),
        eq(objective.assignedEmployeeId, employeeId),
        gte(objective.dueDate, windowStart),
      ),
    );

  let onTime = 0;
  let late = 0;
  let overdueNotCompleted = 0;

  for (const obj of rows) {
    if (obj.status === "completed") {
      if (obj.completedAt && obj.completedAt <= obj.dueDate) onTime++;
      else late++;
    } else if (obj.dueDate < now) {
      overdueNotCompleted++;
    }
  }

  const total = onTime + late + overdueNotCompleted;
  // Sin objetivos resueltos todavía en la ventana — nada registrado en contra del empleado, no 0.
  if (total === 0) return 100;

  return Math.round((onTime / total) * 100);
}

/**
 * WHEN el empleado B solicita el responsibility_level del empleado A (mismo org) THE SYSTEM SHALL
 * devolver 404, no el valor (criterio #2). El único caller válido es el propio empleado sobre sí
 * mismo — este es el único punto de entrada que debe llamar cualquier ruta o Server Action.
 */
export async function getResponsibilityLevel(
  requestingUserId: string,
  targetEmployeeId: string,
  orgId: string,
  windowDays?: number,
): Promise<number> {
  await assertMembership(requestingUserId, orgId);
  if (requestingUserId !== targetEmployeeId) notFound();
  return responsibilityLevel(targetEmployeeId, orgId, windowDays);
}

export type TeamMemberSummary = {
  userId: string;
  role: string;
  email: string;
  fullName: string | null;
};

/**
 * WHEN el owner visita /[org]/equipo THE SYSTEM SHALL renderizar la lista de empleados sin un
 * campo de nivel de responsabilidad por fila (criterio #3). Esta es la única fuente de datos de esa
 * vista — su shape no incluye responsibilityLevel, así que la página no puede filtrarlo sin
 * agregarlo a mano (y no lo hace, ver [org]/equipo/page.tsx).
 */
export async function listTeamForOwner(orgId: string): Promise<TeamMemberSummary[]> {
  const rows = await db
    .select({
      userId: membership.userId,
      role: membership.role,
      email: profile.email,
      fullName: profile.fullName,
    })
    .from(membership)
    .innerJoin(profile, eq(profile.id, membership.userId))
    .where(eq(membership.orgId, orgId));

  return rows;
}
