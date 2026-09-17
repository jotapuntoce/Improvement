// Los tipos de permiso de una empresa: un nombre del organigrama del cliente + qué ve en cada
// sección. Solo el dueño los toca — es literalmente la definición de quién ve qué.
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, permissionType } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { isUniqueViolation } from "../db/pgError.ts";
import { grantsSchema, type Grants } from "./sections.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export interface PermissionTypeRow {
  id: string;
  name: string;
  grants: Grants;
  /** A cuánta gente de ESTA empresa está asignado — la pantalla lo advierte antes de dejar borrar. */
  assignedCount: number;
}

export async function listPermissionTypes(orgId: string): Promise<PermissionTypeRow[]> {
  const [rows, counts] = await Promise.all([
    db
      .select({ id: permissionType.id, name: permissionType.name, grants: permissionType.grants })
      .from(permissionType)
      .where(eq(permissionType.orgId, orgId))
      .orderBy(asc(permissionType.name)),
    // Acotado por orgId y no solo por permissionTypeId: un conteo sin el org de por medio contaría
    // gente de una empresa ajena si algún día un id de tipo se reutilizara entre organizaciones.
    db
      .select({ typeId: membership.permissionTypeId, value: count() })
      .from(membership)
      .where(eq(membership.orgId, orgId))
      .groupBy(membership.permissionTypeId),
  ]);

  const countByTypeId = new Map(counts.map((c) => [c.typeId, c.value]));

  // El parse tolera filas viejas: lo que no pasa se lee como mapa vacío, que niega todo. Nunca lanza
  // en una lectura — un tipo corrupto no puede tumbar la pantalla del dueño.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    grants: grantsSchema.safeParse(row.grants).data ?? {},
    assignedCount: countByTypeId.get(row.id) ?? 0,
  }));
}

function validate(name: string, grants: unknown): Result<{ name: string; grants: Grants }> {
  const nombre = name.trim();
  if (!nombre) return fail("El tipo de permiso necesita un nombre.");

  const parsed = grantsSchema.safeParse(grants ?? {});
  if (!parsed.success) return fail("Ese alcance no existe para esa sección.");

  return { ok: true, data: { name: nombre, grants: parsed.data } };
}

export async function createPermissionType(
  userId: string,
  orgId: string,
  name: string,
  grants: unknown,
): Promise<Result<string>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define los permisos.", "FORBIDDEN");
  }

  const checked = validate(name, grants);
  if (!checked.ok) return checked;

  try {
    const [row] = await db
      .insert(permissionType)
      .values({ orgId, name: checked.data.name, grants: checked.data.grants })
      .returning({ id: permissionType.id });

    return row ? { ok: true, data: row.id } : fail("No se pudo crear el tipo.", "NOT_FOUND");
  } catch (err) {
    if (isUniqueViolation(err)) return fail("Ya tienes un tipo con ese nombre.", "DUPLICATE_NAME");
    throw err;
  }
}

export async function updatePermissionType(
  userId: string,
  orgId: string,
  typeId: string,
  name: string,
  grants: unknown,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define los permisos.", "FORBIDDEN");
  }

  const checked = validate(name, grants);
  if (!checked.ok) return checked;

  try {
    const [row] = await db
      .update(permissionType)
      .set({ name: checked.data.name, grants: checked.data.grants, updatedAt: new Date() })
      .where(and(eq(permissionType.id, typeId), eq(permissionType.orgId, orgId)))
      .returning({ id: permissionType.id });

    return row ? { ok: true, data: true } : fail("Ese tipo no existe.", "NOT_FOUND");
  } catch (err) {
    if (isUniqueViolation(err)) return fail("Ya tienes un tipo con ese nombre.", "DUPLICATE_NAME");
    throw err;
  }
}

/**
 * La FK de membership.permission_type_id es `on delete set null`: quien tenía este tipo queda sin
 * tipo, o sea sin ver nada. Es a propósito — el caso seguro es que deje de ver, no que vea de más.
 */
export async function deletePermissionType(
  userId: string,
  orgId: string,
  typeId: string,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define los permisos.", "FORBIDDEN");
  }

  const [row] = await db
    .delete(permissionType)
    .where(and(eq(permissionType.id, typeId), eq(permissionType.orgId, orgId)))
    .returning({ id: permissionType.id });

  return row ? { ok: true, data: true } : fail("Ese tipo no existe.", "NOT_FOUND");
}
