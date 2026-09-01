// Balance y canje de PowerUps. powerup_partner es un catálogo GLOBAL (no org-scoped, §4 del
// blueprint) — el balance y el canje sí son por empleado/org.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { employeePointsLedger, powerupPartner, powerupRedemption } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";

/**
 * Balance = suma del ledger de puntos ganados menos suma de puntos gastados en canjes NO
 * cancelados. Cancelar un canje le devuelve el balance al empleado sin borrar la fila — el ledger
 * y el historial de canjes son append-only, `status` es lo que cambia (regla de base-de-datos.md).
 */
export async function pointsBalance(employeeId: string): Promise<number> {
  const [earnedRow] = await db
    .select({ total: sql<number>`coalesce(sum(${employeePointsLedger.points}), 0)` })
    .from(employeePointsLedger)
    .where(eq(employeePointsLedger.employeeId, employeeId));

  const [spentRow] = await db
    .select({ total: sql<number>`coalesce(sum(${powerupRedemption.pointsSpent}), 0)` })
    .from(powerupRedemption)
    .where(and(eq(powerupRedemption.employeeId, employeeId), eq(powerupRedemption.status, "redeemed")));

  return Number(earnedRow?.total ?? 0) - Number(spentRow?.total ?? 0);
}

/**
 * WHEN Jose Carlos desactiva un partner desde apps/admin THE SYSTEM SHALL dejar de mostrarlo en el
 * catálogo de todos los orgs (criterio #3) — filtra por isActive, nunca borra la fila, así que los
 * canjes históricos que la referencian (partnerId, onDelete: "restrict") siguen intactos.
 */
export async function listActivePowerups() {
  return db.select().from(powerupPartner).where(eq(powerupPartner.isActive, true));
}

/**
 * WHEN un empleado con balance insuficiente intenta canjear THE SYSTEM SHALL rechazar sin insertar
 * fila en powerup_redemption (criterio #1). WHEN el balance alcanza THE SYSTEM SHALL insertar
 * exactamente una fila y reducir el balance calculado en points_cost (criterio #2) — el balance se
 * recalcula y valida dentro de la misma transacción que hace el insert.
 */
export async function redeemPowerup(userId: string, orgId: string, partnerId: string) {
  await assertMembership(userId, orgId);

  return db.transaction(async (tx) => {
    const [partner] = await tx.select().from(powerupPartner).where(eq(powerupPartner.id, partnerId)).limit(1);
    if (!partner) {
      return {
        ok: false as const,
        error: { code: "NOT_FOUND" as const, message: "El PowerUp no existe." },
      };
    }
    if (!partner.isActive) {
      return {
        ok: false as const,
        error: { code: "VALIDATION_ERROR" as const, message: "Este PowerUp ya no está disponible." },
      };
    }

    const [earnedRow] = await tx
      .select({ total: sql<number>`coalesce(sum(${employeePointsLedger.points}), 0)` })
      .from(employeePointsLedger)
      .where(eq(employeePointsLedger.employeeId, userId));
    const [spentRow] = await tx
      .select({ total: sql<number>`coalesce(sum(${powerupRedemption.pointsSpent}), 0)` })
      .from(powerupRedemption)
      .where(and(eq(powerupRedemption.employeeId, userId), eq(powerupRedemption.status, "redeemed")));

    const balance = Number(earnedRow?.total ?? 0) - Number(spentRow?.total ?? 0);
    if (balance < partner.pointsCost) {
      return {
        ok: false as const,
        error: { code: "VALIDATION_ERROR" as const, message: "Balance insuficiente." },
      };
    }

    const [redemption] = await tx
      .insert(powerupRedemption)
      .values({ employeeId: userId, orgId, partnerId, pointsSpent: partner.pointsCost })
      .returning();
    if (!redemption) throw new Error("insert de powerup_redemption no devolvió fila");

    return { ok: true as const, data: { redemption, balance: balance - partner.pointsCost } };
  });
}
