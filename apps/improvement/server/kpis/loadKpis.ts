// Los indicadores de cada empresa, ya con su número puesto.
//
// Lee las filas de org_kpi (la definición: qué mide esta empresa y de dónde sale) y las manda a
// sources.ts, que es quien sabe consultar cada tipo de conexión. Este archivo no sabe calcular nada:
// si mañana un indicador sale de una tabla de ventas, lo que cambia es el adaptador, no esto.
import { asc, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { orgKpi } from "@jotapuntoce/db/schema";
import { computeKpiValues, type KpiRow } from "./sources.ts";

/** Un indicador listo para dibujar. Trae `source`/`config` porque configuración edita estas mismas filas. */
export interface KpiCard {
  id: string;
  label: string;
  hint: string | null;
  source: string;
  config: unknown;
  manualValue: number | null;
  format: string;
  value: number;
}

/**
 * WHEN una empresa no tiene ninguna fila de la tabla que alimenta un indicador THE SYSTEM SHALL
 * devolver 0, no omitirlo — "0 objetivos activos" es información; un hueco se lee como un error del
 * panel. WHEN una empresa no definió ningún indicador THE SYSTEM SHALL devolver una lista vacía y la
 * tarjeta lo dice con palabras, no con seis cajas en blanco.
 */
export async function loadOrgKpis(orgIds: string[]): Promise<Map<string, KpiCard[]>> {
  const byOrg = new Map<string, KpiCard[]>(orgIds.map((id) => [id, []]));
  if (orgIds.length === 0) return byOrg;

  const rows = await db
    .select()
    .from(orgKpi)
    .where(inArray(orgKpi.orgId, orgIds))
    // created_at desempata: `position` no es única a propósito (reordenar con una restricción de
    // unicidad obliga a escribir posiciones temporales), así que dos filas empatadas se ordenan por
    // antigüedad en vez de quedar en un orden que cambia entre recargas.
    .orderBy(asc(orgKpi.position), asc(orgKpi.createdAt));

  const values = await computeKpiValues(rows as KpiRow[]);

  for (const row of rows) {
    byOrg.get(row.orgId)?.push({
      id: row.id,
      label: row.label,
      hint: row.hint,
      source: row.source,
      config: row.config,
      manualValue: row.manualValue,
      format: row.format,
      value: values.get(row.id) ?? 0,
    });
  }

  return byOrg;
}
