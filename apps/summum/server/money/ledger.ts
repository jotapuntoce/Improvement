import { and, desc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, organization } from "@jotapuntoce/db/schema";
import { assertBarcoOwner, assertDockOwner } from "../auth/guard.ts";

type ChargeKind = "membresia" | "venta_propia" | "proyecto_summum";

/** Margen del muelle: lo que gana Summum ÷ lo que se movió (tarjeta "Profit margin" de Whop). */
export function summarize(rows: { grossCents: number; summumFeeCents: number }[]) {
  const grossCents = rows.reduce((s, r) => s + r.grossCents, 0);
  const feeCents = rows.reduce((s, r) => s + r.summumFeeCents, 0);
  return { grossCents, feeCents, marginBps: grossCents === 0 ? 0 : Math.round((feeCents * 10_000) / grossCents) };
}

const columns = {
  id: ledgerEntry.id,
  barcoOrgId: ledgerEntry.barcoOrgId,
  barcoName: organization.name,
  chargeKind: ledgerEntry.chargeKind,
  grossCents: ledgerEntry.grossCents,
  summumFeeCents: ledgerEntry.summumFeeCents,
  currency: ledgerEntry.currency,
  createdAt: ledgerEntry.createdAt,
};

export async function listDockLedger(userId: string, muelleId: string, filters: { barcoOrgId?: string; chargeKind?: ChargeKind } = {}) {
  await assertDockOwner(userId, muelleId);
  return db
    .select(columns)
    .from(ledgerEntry)
    .innerJoin(organization, eq(organization.id, ledgerEntry.barcoOrgId))
    .where(and(
      eq(ledgerEntry.muelleOrgId, muelleId),
      filters.barcoOrgId ? eq(ledgerEntry.barcoOrgId, filters.barcoOrgId) : undefined,
      filters.chargeKind ? eq(ledgerEntry.chargeKind, filters.chargeKind) : undefined,
    ))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(200); // ponytail: sin paginación; agregar cursor cuando un muelle pase de 200 movimientos a la vista
}

export async function listBarcoLedgerForOwner(userId: string, barcoId: string) {
  await assertBarcoOwner(userId, barcoId);
  return db
    .select(columns)
    .from(ledgerEntry)
    .innerJoin(organization, eq(organization.id, ledgerEntry.barcoOrgId))
    .where(eq(ledgerEntry.barcoOrgId, barcoId))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(200);
}
