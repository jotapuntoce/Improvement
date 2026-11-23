// Salud del cliente (G8), calculada de su actividad y guardada en client.health_status. La corre el
// cron diario (/api/cron/salud); no corre en nombre de nadie.
//
// Actividad = lo más reciente entre su alta, su bitácora y sus tratos y tickets.
//   ≤ 30 días → healthy · ≤ 90 → neutral · más → at_risk.
// Un ticket abierto hace más de 7 días lo deja at_risk aunque tenga actividad reciente.
// Lo manual gana 30 días: si alguien movió la salud a mano (un "Etapa:" en la bitácora), no se toca.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client } from "@jotapuntoce/db/schema";

type Health = "healthy" | "neutral" | "at_risk";
const DAY_MS = 86_400_000;

export function healthFor(lastActivity: Date, oldOpenTicket: boolean, now: Date): Health {
  if (oldOpenTicket) return "at_risk";
  const days = (now.getTime() - lastActivity.getTime()) / DAY_MS;
  return days <= 30 ? "healthy" : days <= 90 ? "neutral" : "at_risk";
}

/** Recalcula la salud de los clientes (de todas las empresas, o solo de `orgIds`). Devuelve cuántos cambió. */
export async function recomputeClientHealth(now = new Date(), orgIds?: string[]): Promise<{ clients: number; changed: number }> {
  const ticketCut = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const manualCut = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const rows = await db
    .select({
      id: client.id,
      health: client.healthStatus,
      last: sql<string>`greatest(${client.createdAt},
        (select max(ra.created_at) from record_activity ra where ra.org_id = client.org_id and ra.app_key = 'clientes' and ra.record_id = client.id),
        (select max(d.updated_at) from deal d where d.client_id = client.id),
        (select max(t.updated_at) from ticket t where t.client_id = client.id))`,
      oldTicket: sql<boolean>`exists (select 1 from ticket t where t.client_id = client.id and t.status <> 'resuelto' and t.opened_at < ${ticketCut})`,
      manual: sql<boolean>`exists (select 1 from record_activity ra where ra.org_id = client.org_id and ra.app_key = 'clientes' and ra.record_id = client.id
        and ra.kind = 'cambio' and ra.body like 'Etapa:%' and ra.created_at > ${manualCut})`,
    })
    .from(client)
    .where(orgIds ? inArray(client.orgId, orgIds) : undefined);
  let changed = 0;
  for (const r of rows) {
    if (r.manual) continue;
    const next = healthFor(new Date(r.last), r.oldTicket, now);
    if (next === r.health) continue;
    // Sin bitácora a propósito: un "Etapa:" del cron se leería mañana como cambio manual.
    await db.update(client).set({ healthStatus: next, updatedAt: now }).where(and(eq(client.id, r.id), eq(client.healthStatus, r.health)));
    changed++;
  }
  return { clients: rows.length, changed };
}
