// Las áreas de una empresa, para poblar los selectores que las filtran.
//
// Existe por los indicadores: "Objetivos abiertos" de toda la empresa y "Objetivos abiertos del área
// de Ventas" son dos indicadores distintos con el mismo adaptador, y lo único que los separa es el
// area_id guardado en la config de la fila (server/kpis/sources.ts).
import { asc, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area } from "@jotapuntoce/db/schema";

export interface AreaOption {
  id: string;
  name: string;
}

export async function listAreasByOrg(orgIds: string[]): Promise<Map<string, AreaOption[]>> {
  const byOrg = new Map<string, AreaOption[]>(orgIds.map((id) => [id, []]));
  if (orgIds.length === 0) return byOrg;

  const rows = await db
    .select({ id: area.id, orgId: area.orgId, name: area.name })
    .from(area)
    .where(inArray(area.orgId, orgIds))
    .orderBy(asc(area.name));

  for (const row of rows) byOrg.get(row.orgId)?.push({ id: row.id, name: row.name });
  return byOrg;
}
