// "Hasta dónde alcanza a ver esta persona", escrito UNA vez.
//
// La regla de alcance ya vivía repetida en tres loaders (listObjectives, listTeammates,
// listProjects): las mismas cuatro líneas, con el mismo `sql\`false\`` para el caso del miembro sin
// área. Repetida no es solo fea — es la clase de cosa que se arregla en dos de los tres lugares.
// Y el tercero fuga de verdad: sin RLS corriendo en el camino de la app
// (packages/db/src/client.ts conecta con el rol dueño de las tablas), este filtro es la ÚNICA capa
// que hay. Aquí está una vez y la usan todos.
//
// Las tres reglas que sostiene, y por qué:
//
//  1. `empresa` no agrega filtro: ya viene filtrado por org_id desde el llamador.
//  2. `area` sin área asignada devuelve CERO, nunca la empresa entera. Un miembro a medio
//     configurar —o alguien cuya área borró el dueño, onDelete: set null— tiene que ver de menos,
//     jamás de más.
//  3. `propio` sin columna de dueño en esa tabla también devuelve cero. Una tabla que no sabe de
//     quién es cada fila no puede honrar "solo lo tuyo", y aparentar que sí sería la fuga.
import { eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Scope } from "./sections.ts";

export interface AreaScopeColumns {
  /** La columna de área de la tabla que se está consultando. */
  areaId?: PgColumn;
  /** La columna que dice de quién es la fila (asignado, dueño de la tarea, empleado). */
  ownerId?: PgColumn;
}

/**
 * El pedazo de `where` que le toca a este alcance. Siempre devuelve una condición — nunca
 * `undefined`— para que ningún llamador pueda "olvidarse" de agregarla con un `if`.
 */
export function areaScopeFilter(
  scope: Scope,
  member: { areaId: string | null; userId: string },
  cols: AreaScopeColumns,
): SQL {
  if (scope === "ninguno") return sql`false`;
  if (scope === "empresa") return sql`true`;

  if (scope === "area") {
    if (!cols.areaId || !member.areaId) return sql`false`;
    return eq(cols.areaId, member.areaId);
  }

  // scope === "propio"
  if (!cols.ownerId) return sql`false`;
  return eq(cols.ownerId, member.userId);
}

/**
 * Cómo se le dice al usuario hasta dónde ve. Es el texto del Panel de Alcance de la recepción: la
 * persona tiene derecho a saber que está viendo un recorte y no la empresa entera — un número
 * parcial que se lee como total es peor que no enseñarlo.
 */
export const SCOPE_LABEL: Record<Scope, string> = {
  empresa: "Toda la empresa",
  area: "Tu área",
  propio: "Tu trabajo",
  ninguno: "Sin acceso",
};
