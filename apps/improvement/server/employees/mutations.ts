// El dueño cambia el acceso de alguien que YA es empleado, o lo da de baja.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, permissionType } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { belongsToOrg } from "../db/belongsToOrg.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

const cambioSchema = z.object({
  permissionTypeId: z.uuid().nullable(),
  areaId: z.uuid().nullable(),
  jobTitle: z.string().trim().min(2, "Escribe el puesto de esta persona."),
});

export async function updateMembership(
  userId: string,
  orgId: string,
  targetUserId: string,
  input: unknown,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño cambia el acceso de su equipo.", "FORBIDDEN");
  }
  // Editarse a sí mismo es la puerta por la que el dueño se quitaría el área, el puesto o un día el
  // rol, y se dejaría fuera de su propia empresa sin vuelta atrás. Cerrada.
  if (targetUserId === userId) {
    return fail("No puedes cambiarte el acceso a ti mismo.", "FORBIDDEN");
  }

  const parsed = cambioSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Faltan datos del formulario.");

  const { permissionTypeId, areaId, jobTitle } = parsed.data;
  // WHEN el id de un tipo o de un área no es de ESTA empresa THE SYSTEM SHALL tratarlo como
  // inexistente. Los dos llegan de un <select>, o sea del navegador, así que no son de confianza
  // aunque quien los mande sea el dueño.
  const [tipoOk, areaOk] = await Promise.all([
    permissionTypeId ? belongsToOrg(permissionType, permissionTypeId, orgId) : true,
    areaId ? belongsToOrg(area, areaId, orgId) : true,
  ]);
  if (!tipoOk) return fail("Ese tipo de permiso no es de esta empresa.", "NOT_FOUND");
  if (!areaOk) return fail("Esa área no es de esta empresa.", "NOT_FOUND");

  const [row] = await db
    .update(membership)
    .set({ permissionTypeId, areaId, jobTitle })
    .where(and(eq(membership.userId, targetUserId), eq(membership.orgId, orgId)))
    .returning({ userId: membership.userId });

  return row ? { ok: true, data: true } : fail("Esa persona no es de tu equipo.", "NOT_FOUND");
}

/**
 * Da de baja a alguien de UNA empresa: borra su membresía, nunca su cuenta — la misma persona puede
 * trabajar en otra empresa del mismo dueño y allá no se toca nada.
 *
 * WHEN la persona tenía objetivos asignados THE SYSTEM SHALL dejarlos sin responsable en vez de
 * borrarlos: el trabajo planeado sobrevive a quien se va, y el dueño lo reasigna cuando pueda. Va en
 * una transacción para que no exista el estado intermedio donde la membresía ya no está pero los
 * objetivos siguen apuntándole.
 */
export async function removeMembership(
  userId: string,
  orgId: string,
  targetUserId: string,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño da de baja a su equipo.", "FORBIDDEN");
  }
  if (targetUserId === userId) {
    return fail("No puedes darte de baja a ti mismo.", "FORBIDDEN");
  }

  const [target] = await db
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.userId, targetUserId), eq(membership.orgId, orgId)))
    .limit(1);
  if (!target) return fail("Esa persona no es de tu equipo.", "NOT_FOUND");
  if (target.role === "owner") {
    return fail("El dueño de la empresa no se puede dar de baja.", "FORBIDDEN");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(objective)
      .set({ assignedEmployeeId: null })
      .where(and(eq(objective.assignedEmployeeId, targetUserId), eq(objective.orgId, orgId)));

    await tx
      .delete(membership)
      .where(and(eq(membership.userId, targetUserId), eq(membership.orgId, orgId)));
  });

  return { ok: true, data: true };
}
