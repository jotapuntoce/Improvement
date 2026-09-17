// Nivel de responsabilidad por empleado — dato sensible, nunca expuesto a nadie más que el propio
// empleado (ni siquiera al owner, ver Pitfalls §02-producto-core: "el owner ve conteos agregados,
// nunca el número por persona" — es exactamente el riesgo de vigilancia laboral que el blueprint
// mitiga a propósito).
import { and, eq, gte } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@jotapuntoce/db";
import { objective, membership, profile } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";

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
 *
 * WHEN un platform admin tiene membership en el org THE SYSTEM SHALL excluirlo de esta lista: entra
 * a cada organización nueva por rol (provisionOrganization y approveCompanyRequest en apps/admin le
 * dan membership owner) para poder dar soporte, pero no es parte del equipo del cliente — sin este
 * filtro el dueño abría /equipo y veía el correo personal de Jose Carlos como un miembro más.
 * El filtro es por is_platform_admin, nunca por un id o correo literal (.claude/rules/motor-generico.md).
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
    .where(and(eq(membership.orgId, orgId), eq(profile.isPlatformAdmin, false)));

  return rows;
}

export interface TeamMemberDetail {
  userId: string;
  fullName: string | null;
  email: string;
  role: string;
  jobTitle: string | null;
  responsibilities: string | null;
  areaId: string | null;
  permissionTypeId: string | null;
}

/**
 * La ficha de una persona del equipo, para la pantalla donde el dueño le cambia el acceso.
 *
 * El guard va ADENTRO y no en la página (mismo criterio que listTeammates y listObjectives tras la
 * revisión de la Tarea 8): así ningún llamador futuro puede pedir la ficha de alguien sin ser el
 * dueño. Devuelve null tanto si quien pregunta no es dueño como si esa persona no es de su equipo —
 * la pantalla responde 404 en los dos casos, sin distinguirlos.
 *
 * NO trae responsibility_level: el no negociable #4 dice que nadie lee el de otro, ni el dueño, y la
 * forma segura de cumplirlo es que el campo no exista en este shape (igual que listTeamForOwner).
 */
export async function findTeamMemberForOwner(
  userId: string,
  orgId: string,
  targetUserId: string,
): Promise<TeamMemberDetail | null> {
  if (!(await findOwnerMembership(userId, orgId))) return null;

  const [row] = await db
    .select({
      userId: membership.userId,
      fullName: profile.fullName,
      email: profile.email,
      role: membership.role,
      jobTitle: membership.jobTitle,
      responsibilities: membership.responsibilities,
      areaId: membership.areaId,
      permissionTypeId: membership.permissionTypeId,
    })
    .from(membership)
    .innerJoin(profile, eq(profile.id, membership.userId))
    .where(
      and(
        eq(membership.userId, targetUserId),
        eq(membership.orgId, orgId),
        eq(profile.isPlatformAdmin, false),
      ),
    )
    .limit(1);

  return row ?? null;
}
