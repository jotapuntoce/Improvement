// Lo que el cliente le debe a Improvement: el precio que ve antes de pedir una empresa, y el estado
// de cada pago de las empresas que ya tiene.
//
// Escritura: ninguna. Las filas de `payment` las crea Jose Carlos desde apps/admin, y el día que se
// conecte un procesador de pagos las marcará pagadas un webhook (payment.source / external_ref ya
// existen para eso). Desde apps/improvement esto es solo lectura, igual que el Mapa de Construcción.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, payment } from "@jotapuntoce/db/schema";

// ponytail: precio único en código, no una tabla de precios. Con un cliente piloto no hay dos
// precios que mantener sincronizados; cuando existan planes distintos por empresa, esto se vuelve
// una columna en organization y este módulo la lee en vez de la constante.
export const CONSTRUCTION_PRICE = { amount: 25000, currency: "MXN" } as const;

export function formatMoney(amount: number | string, currency = "MXN"): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export interface PaymentRow {
  id: string;
  orgId: string;
  orgName: string;
  concept: string;
  amount: string;
  currency: string;
  dueDate: Date;
  paidAt: Date | null;
}

/**
 * Los pagos de las empresas donde este usuario es DUEÑO, nunca de aquellas donde solo es empleado —
 * mismo criterio que la política RLS de la tabla (migración 0010): lo que el dueño le debe a
 * Improvement no es asunto de su equipo. El filtro por role vive aquí además de en RLS porque el
 * cliente `db` usa el rol postgres y bypasea la política (RLS es la segunda capa, nunca la única).
 */
export async function listMyPayments(userId: string): Promise<PaymentRow[]> {
  const ownedOrgIds = await db
    .select({ orgId: membership.orgId })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.role, "owner")));

  const orgIds = ownedOrgIds.map((r) => r.orgId);
  if (orgIds.length === 0) return [];

  return db
    .select({
      id: payment.id,
      orgId: payment.orgId,
      orgName: organization.name,
      concept: payment.concept,
      amount: payment.amount,
      currency: payment.currency,
      dueDate: payment.dueDate,
      paidAt: payment.paidAt,
    })
    .from(payment)
    .innerJoin(organization, eq(organization.id, payment.orgId))
    .where(inArray(payment.orgId, orgIds))
    .orderBy(asc(payment.dueDate));
}
