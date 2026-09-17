// De dónde sale el número de cada indicador del panel.
//
// Una fila de org_kpi no guarda un número: guarda una CONEXIÓN — qué adaptador lo calcula (`source`)
// y con qué filtro (`config`). Por eso dos indicadores que usan el mismo adaptador no son el mismo
// indicador: "Objetivos del área de Ventas" y "Objetivos vencidos" salen los dos de `objetivos` y
// miden cosas distintas. Cada fila trae su propia conexión, que es justo lo que el catálogo fijo
// anterior no podía expresar.
//
// Agregar una fuente nueva = una entrada más en KPI_SOURCES y su valor en el check de la migración.
// Ningún adaptador nombra un org, empresa o empleado literal: todo entra por `orgIds` y `config`
// (.claude/rules/motor-generico.md).
import { z } from "zod";
import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, client, employeePointsLedger, membership, objective, profile } from "@jotapuntoce/db/schema";

/** Una fila de org_kpi tal como la usa el panel. */
export interface KpiRow {
  id: string;
  orgId: string;
  label: string;
  hint: string | null;
  source: string;
  config: unknown;
  manualValue: number | null;
  format: string;
}

const count = sql<number>`count(*)`;

const objetivosConfig = z.object({
  estado: z.enum(["abiertos", "completados", "vencidos"]).default("abiertos"),
  areaId: z.uuid().nullish(),
});
const clientesConfig = z.object({ enRiesgo: z.boolean().default(false) });

/**
 * La config guardada, o la que sale de `{}` si la fila trae basura. Nunca lanza: un jsonb escrito a
 * mano con una llave mal no debe tumbar el panel entero, solo caer al comportamiento por defecto de
 * su adaptador.
 */
function parseConfig<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : schema.parse({});
}

/** Indexa un resultado ya agrupado por org_id. */
function byOrg(rows: { orgId: string; value: unknown }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.orgId, Number(r.value ?? 0)]));
}

const ESTADO_TEXTO: Record<string, string> = {
  abiertos: "Objetivos abiertos",
  completados: "Objetivos completados",
  vencidos: "Objetivos vencidos",
};

export interface KpiSource {
  id: string;
  label: string;
  /** Qué alimenta a un indicador con esta fuente — se le enseña al dueño en configuración. */
  describe: (config: unknown, areaName?: string | null) => string;
  /** null para las fuentes que no consultan la base (manual). */
  load: ((orgIds: string[], config: unknown) => Promise<Map<string, number>>) | null;
}

export const KPI_SOURCES: KpiSource[] = [
  {
    id: "objetivos",
    label: "Objetivos",
    describe: (raw, areaName) => {
      const c = parseConfig(objetivosConfig, raw);
      const base = ESTADO_TEXTO[c.estado] ?? "Objetivos";
      return c.areaId ? `${base} del área ${areaName ?? "elegida"}` : `${base} de toda la empresa`;
    },
    load: async (orgIds, raw) => {
      const c = parseConfig(objetivosConfig, raw);
      const filters = [inArray(objective.orgId, orgIds)];
      if (c.areaId) filters.push(eq(objective.areaId, c.areaId));
      if (c.estado === "completados") filters.push(eq(objective.status, "completed"));
      else if (c.estado === "vencidos")
        filters.push(isNull(objective.completedAt), lt(objective.dueDate, new Date()));
      // pending e in_progress son ambos "abierto" para el dueño: le importa qué sigue sin cerrar, no
      // en qué subestado interno está.
      else filters.push(ne(objective.status, "completed"));

      return byOrg(
        await db
          .select({ orgId: objective.orgId, value: count })
          .from(objective)
          .where(and(...filters))
          .groupBy(objective.orgId),
      );
    },
  },
  {
    id: "puntos",
    label: "Puntos del equipo",
    describe: () => "Suma de los puntos que ganó tu gente al cerrar objetivos",
    load: async (orgIds) =>
      byOrg(
        await db
          .select({
            orgId: employeePointsLedger.orgId,
            value: sql<number>`coalesce(sum(${employeePointsLedger.points}), 0)`,
          })
          .from(employeePointsLedger)
          .where(inArray(employeePointsLedger.orgId, orgIds))
          .groupBy(employeePointsLedger.orgId),
      ),
  },
  {
    id: "equipo",
    label: "Personas en el equipo",
    describe: () => "Personas con acceso a la empresa, sin contar al equipo de Improvement",
    // Cuarto lugar que cuenta personas para el cliente, después de listTeamForOwner,
    // loadDashboardScene y el KPI equipo del catálogo anterior: lleva el mismo filtro. Los platform
    // admins entran por rol a dar soporte y no son parte del equipo del cliente — sin esto el
    // indicador diría 2 donde el dueño trabaja solo.
    load: async (orgIds) =>
      byOrg(
        await db
          .select({ orgId: membership.orgId, value: count })
          .from(membership)
          .innerJoin(profile, eq(profile.id, membership.userId))
          .where(and(inArray(membership.orgId, orgIds), eq(profile.isPlatformAdmin, false)))
          .groupBy(membership.orgId),
      ),
  },
  {
    id: "areas",
    label: "Áreas",
    describe: () => "En cuántas áreas está dividida la empresa",
    load: async (orgIds) =>
      byOrg(
        await db
          .select({ orgId: area.orgId, value: count })
          .from(area)
          .where(inArray(area.orgId, orgIds))
          .groupBy(area.orgId),
      ),
  },
  {
    id: "clientes",
    label: "Clientes",
    describe: (raw) =>
      parseConfig(clientesConfig, raw).enRiesgo
        ? "Clientes marcados en riesgo en tu cartera"
        : "Tamaño de tu cartera de clientes",
    load: async (orgIds, raw) => {
      const c = parseConfig(clientesConfig, raw);
      const filters = [inArray(client.orgId, orgIds)];
      if (c.enRiesgo) filters.push(eq(client.healthStatus, "at_risk"));
      return byOrg(
        await db
          .select({ orgId: client.orgId, value: count })
          .from(client)
          .where(and(...filters))
          .groupBy(client.orgId),
      );
    },
  },
  {
    id: "manual",
    label: "Capturado a mano",
    describe: () => "Un número que se captura a mano hasta que tenga de dónde salir solo",
    load: null,
  },
];

const SOURCES_BY_ID = new Map(KPI_SOURCES.map((s) => [s.id, s]));

export function kpiSource(id: string): KpiSource | undefined {
  return SOURCES_BY_ID.get(id);
}

/** El texto de la conexión de una fila: qué alimenta exactamente a ese indicador. */
export function describeKpi(
  row: Pick<KpiRow, "source" | "config">,
  areaName?: string | null,
): string {
  return kpiSource(row.source)?.describe(row.config, areaName) ?? "Fuente desconocida";
}

/**
 * El número de cada fila, indexado por id de fila.
 *
 * Una consulta por (fuente, config) distinta y no una por fila: seis indicadores que miran objetivos
 * con el mismo filtro son una sola consulta. Las filas manual no consultan nada.
 *
 * ponytail: agrupa por JSON.stringify(config), así que dos configs equivalentes con las llaves en
 * distinto orden hacen dos consultas. Con ≤6 indicadores por empresa no se nota; si un día una
 * cartera trae cientos de filas, aquí es donde se normaliza la llave.
 */
export async function computeKpiValues(rows: KpiRow[]): Promise<Map<string, number>> {
  const values = new Map<string, number>();
  const groups = new Map<string, { source: KpiSource; config: unknown; rows: KpiRow[] }>();

  for (const row of rows) {
    const source = kpiSource(row.source);
    if (!source) continue;
    if (!source.load) {
      values.set(row.id, row.manualValue ?? 0);
      continue;
    }
    const key = `${row.source}:${JSON.stringify(row.config ?? {})}`;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { source, config: row.config, rows: [row] });
  }

  await Promise.all(
    [...groups.values()].map(async ({ source, config, rows: groupRows }) => {
      const orgIds = [...new Set(groupRows.map((r) => r.orgId))];
      const load = source.load;
      if (!load) return;
      const perOrg = await load(orgIds, config);
      for (const row of groupRows) {
        // Sin fila en la base no es "sin dato": es cero. Una empresa sin objetivos tiene cero
        // objetivos abiertos, y un hueco en la tarjeta se leería como un error del panel.
        values.set(row.id, perOrg.get(row.orgId) ?? 0);
      }
    }),
  );

  return values;
}
