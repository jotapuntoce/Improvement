// Las áreas de la empresa con lo que cuelga de cada una: cuánta gente, cuántos objetivos abiertos,
// cuántos proyectos, cuántos clientes.
//
// Es la "Pared de Áreas" de la recepción, y también el contexto que Improvement necesita antes de
// sugerir nada: un Director General que no sabe cuánta gente tiene Ventas no puede proponer mover
// a nadie a Ventas.
//
// Cuatro consultas agregadas y no un join de cuatro tablas: un `count(*)` sobre un join con cuatro
// ramas cuenta el producto cartesiano, no las filas — es el bug clásico de este tipo de tablero, y
// aquí no puede ocurrir porque cada número sale de su propia consulta.
//
// El alcance se resuelve ADENTRO, como todo loader de la casa: quien no pertenece a la empresa
// recibe 404 de assertMembership, y a quien solo alcanza su área se le manda su área sola.
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, client, membership, objective, profile, project } from "@jotapuntoce/db/schema";
import { assertMembership, resolveSection } from "../auth/guard.ts";

export interface AreaCard {
  id: string;
  name: string;
  color: string;
  description: string | null;
  /** Id de AREA_ICONS (packages/ui/src/building/areaIcons.ts), o null para el glifo neutro. */
  icon: string | null;
  members: number;
  objectivesOpen: number;
  projects: number;
  clients: number;
}

/** Vuelca el resultado de un `group by area_id` en un mapa, saltándose las filas sin área. */
function countByArea(rows: { areaId: string | null; n: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.areaId) m.set(r.areaId, Number(r.n));
  return m;
}

/**
 * El tablero de áreas de una empresa.
 *
 * `soloMiArea` no es un parámetro: sale del alcance que tenga la persona sobre la sección Equipo,
 * que es la que decide si alguien puede ver más allá de su propia área. Si el llamador pudiera
 * pedir "todas", una pantalla nueva podría pedirlo por descuido.
 */
export async function loadAreaBoard(userId: string, orgId: string): Promise<AreaCard[]> {
  const member = await assertMembership(userId, orgId);
  const { scope } = await resolveSection(userId, orgId, "equipo");

  const areas = await db
    .select({
      id: area.id,
      name: area.name,
      color: area.color,
      description: area.description,
      icon: area.icon,
    })
    .from(area)
    .where(eq(area.orgId, orgId))
    .orderBy(asc(area.createdAt));

  // Alcance `area`: solo la suya. Sin área asignada: ninguna — el mismo criterio de areaScope.ts,
  // ver de menos y nunca de más. El dueño y quien alcanza `empresa` las ven todas.
  const visibles =
    scope === "empresa"
      ? areas
      : scope === "area" && member.areaId
        ? areas.filter((a) => a.id === member.areaId)
        : [];

  if (visibles.length === 0) return [];
  const ids = visibles.map((a) => a.id);

  const [gente, metas, proyectos, cuentas] = await Promise.all([
    db
      .select({ areaId: membership.areaId, n: count() })
      .from(membership)
      .innerJoin(profile, eq(profile.id, membership.userId))
      // Los platform admins no cuentan como personal de la empresa del cliente — mismo filtro que
      // loadTeamStatus y listTeammates, los otros dos lugares que listan gente de un org.
      .where(
        and(
          eq(membership.orgId, orgId),
          eq(profile.isPlatformAdmin, false),
          inArray(membership.areaId, ids),
        ),
      )
      .groupBy(membership.areaId),
    db
      .select({ areaId: objective.areaId, n: count() })
      .from(objective)
      .where(
        and(
          eq(objective.orgId, orgId),
          ne(objective.status, "completed"),
          inArray(objective.areaId, ids),
        ),
      )
      .groupBy(objective.areaId),
    db
      .select({ areaId: project.areaId, n: count() })
      .from(project)
      .where(
        and(eq(project.orgId, orgId), eq(project.status, "activo"), inArray(project.areaId, ids)),
      )
      .groupBy(project.areaId),
    db
      .select({ areaId: client.areaId, n: count() })
      .from(client)
      .where(and(eq(client.orgId, orgId), inArray(client.areaId, ids)))
      .groupBy(client.areaId),
  ]);

  const porGente = countByArea(gente);
  const porMetas = countByArea(metas);
  const porProyectos = countByArea(proyectos);
  const porCuentas = countByArea(cuentas);

  return visibles.map((a) => ({
    ...a,
    members: porGente.get(a.id) ?? 0,
    objectivesOpen: porMetas.get(a.id) ?? 0,
    projects: porProyectos.get(a.id) ?? 0,
    clients: porCuentas.get(a.id) ?? 0,
  }));
}

/**
 * Los proyectos de UN área. Lo usa el tablero de áreas cuando el dueño abre una, y la fase de
 * observación del motor cuando el ciclo gira sobre un área concreta.
 *
 * Scoped por orgId además de areaId: un areaId válido de otra empresa no alcanza para leer nada
 * (no negociable #2 de CLAUDE.md, mismo criterio que renameArea).
 */
export async function listProjectsByArea(userId: string, orgId: string, areaId: string) {
  await assertMembership(userId, orgId);

  return db
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      progress: project.progress,
      risk: project.risk,
      dueAt: project.dueAt,
    })
    .from(project)
    .where(and(eq(project.orgId, orgId), eq(project.areaId, areaId)))
    .orderBy(sql`${project.progress} desc`, asc(project.createdAt));
}
