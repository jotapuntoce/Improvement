// Los movimientos de dinero de ESTE barco. Solo con alcance `empresa` en la sección cobros (el
// dueño siempre; un empleado solo si su tipo lo concede). Lectura pura: el libro lo escribe
// únicamente el webhook de apps/summum.
import { desc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";

export async function listOrgLedger(userId: string, orgId: string) {
  const { scope } = await resolveSection(userId, orgId, "cobros");
  if (scope !== "empresa") return [];
  return db
    .select({
      id: ledgerEntry.id,
      chargeKind: ledgerEntry.chargeKind,
      grossCents: ledgerEntry.grossCents,
      summumFeeCents: ledgerEntry.summumFeeCents,
      currency: ledgerEntry.currency,
      createdAt: ledgerEntry.createdAt,
    })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.barcoOrgId, orgId))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(200);
}
