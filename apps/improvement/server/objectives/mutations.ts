// Lecturas y escrituras de objetivos. "mutations.ts" es el nombre de módulo fijado por el blueprint
// (§9.6) aunque también exponga listObjectives — una lectura server-side, no un segundo archivo.
// Cada función empieza validando tenencia con assertMembership(userId, orgId): la regla de
// server/auth/guard.ts es que ninguna query nueva confíe solo en RLS o solo en el guard de la ruta.
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { objective, employeePointsLedger } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { pointsForObjective } from "./points.ts";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type ObjectiveRow = typeof objective.$inferSelect;

function decodeCursor(cursor?: string | null): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [createdAtIso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAtIso || !id) return null;
    const createdAt = new Date(createdAtIso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(row: ObjectiveRow): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

/**
 * WHEN un empleado del org A solicita la lista de objetivos del org B THE SYSTEM SHALL devolver 404
 * (criterio #3, vía assertMembership). WHEN se piden más de 100 objetivos por página THE SYSTEM
 * SHALL limitar la respuesta a 100 (criterio #4, vía el Math.min de abajo).
 */
export async function listObjectives(
  userId: string,
  orgId: string,
  opts: { cursor?: string | null; limit?: number } = {},
) {
  await assertMembership(userId, orgId);

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = decodeCursor(opts.cursor);

  const conditions = [eq(objective.orgId, orgId)];
  if (cursor) {
    const beforeCursor = or(
      lt(objective.createdAt, cursor.createdAt),
      and(eq(objective.createdAt, cursor.createdAt), lt(objective.id, cursor.id)),
    );
    if (beforeCursor) conditions.push(beforeCursor);
  }

  const rows = await db
    .select()
    .from(objective)
    .where(and(...conditions))
    .orderBy(desc(objective.createdAt), desc(objective.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last) : null;

  return { ok: true as const, data: { objectives: page, nextCursor } };
}

/**
 * Transacción: valida tenencia y estado, marca el objetivo completed y agrega exactamente una fila
 * al ledger append-only (criterios #1 y #2 — la comprobación de estado y el update condicional
 * viven en la misma transacción, así que un segundo intento nunca inserta una segunda fila).
 */
export async function completeObjective(userId: string, orgId: string, objectiveId: string) {
  await assertMembership(userId, orgId);

  return db.transaction(async (tx) => {
    const [obj] = await tx
      .select()
      .from(objective)
      .where(and(eq(objective.id, objectiveId), eq(objective.orgId, orgId)))
      .limit(1);

    if (!obj) {
      return {
        ok: false as const,
        error: { code: "NOT_FOUND" as const, message: "El objetivo no existe en este org." },
      };
    }
    if (obj.status === "completed") {
      return {
        ok: false as const,
        error: { code: "VALIDATION_ERROR" as const, message: "El objetivo ya está completado." },
      };
    }
    if (!obj.assignedEmployeeId) {
      return {
        ok: false as const,
        error: {
          code: "VALIDATION_ERROR" as const,
          message: "El objetivo no tiene un empleado asignado.",
        },
      };
    }

    // Update condicionado al status leído arriba: si otra transacción concurrente ya lo completó,
    // esta fila no matchea y `updated` sale vacío — la doble inserción en el ledger queda cerrada
    // por la base de datos, no solo por el chequeo de arriba.
    const [updated] = await tx
      .update(objective)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(objective.id, objectiveId), eq(objective.status, obj.status)))
      .returning();
    if (!updated) {
      return {
        ok: false as const,
        error: { code: "VALIDATION_ERROR" as const, message: "El objetivo ya está completado." },
      };
    }

    const points = pointsForObjective(updated.impactWeight);
    await tx.insert(employeePointsLedger).values({
      employeeId: obj.assignedEmployeeId,
      objectiveId: updated.id,
      orgId,
      points,
    });

    return { ok: true as const, data: { objective: updated, points } };
  });
}
