// Quién del equipo se encarga de una app: el que la tiene en sus encargos y ya aceptó su invitación.
// Con sucursales, el de la sucursal del registro. Lo usa el motor de automatizaciones para que la
// tarea le llegue a esa persona y no al dueño. Archivo aparte para no cerrar un ciclo de imports.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agente } from "@jotapuntoce/db/schema";

export async function responsable(orgId: string, appKey: string, custom: Record<string, unknown> = {}): Promise<string | null> {
  const rows = await db
    .select({ userId: agente.userId, sucursal: agente.sucursal })
    .from(agente)
    .where(and(eq(agente.orgId, orgId), isNotNull(agente.userId), sql`${agente.encargos} @> ${JSON.stringify([appKey])}::jsonb`));
  const suc = typeof custom.sucursal === "string" ? custom.sucursal : null;
  const pick = rows.find((r) => suc && r.sucursal === suc) ?? rows.find((r) => !r.sucursal) ?? (suc ? null : rows[0]);
  return pick?.userId ?? null;
}
