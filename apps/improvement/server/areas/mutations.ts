// El dueño arma las áreas de SU empresa. Solo el dueño: el organigrama es una decisión de quien
// dirige, y el área de cada empleado es lo que después decide qué ve (alcance `area`).
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective } from "@jotapuntoce/db/schema";
import { AREA_ICONS } from "@jotapuntoce/ui/building/areaIcons.ts";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

// Los colores que el panel ya sabe dibujar. No es un hex libre: un color arbitrario rompe el
// contraste del mapa y de las tarjetas (.claude/rules/tokens-de-diseno.md).
const COLORES = ["#7c5cff", "#22d3ee", "#f59e0b", "#10b981", "#f87171"];

/**
 * WHEN ya existe un área con ese nombre en el mismo org THE SYSTEM SHALL devolver true. Pre-check y
 * no try/catch sobre un código de Postgres como en permissions/mutations.ts: `area` no tiene un
 * uniqueIndex(org_id, name) — nada en la base rechaza el duplicado, así que no hay excepción que
 * atrapar. Es la misma carrera potencial que un uniqueIndex cerraría del todo, pero agregar uno es un
 * cambio de esquema que esta tarea no pidió; este chequeo iguala el comportamiento que sí pidieron
 * (rechazar el nombre repetido con un mensaje, no una excepción) sin tocar una migración.
 */
async function nameTaken(orgId: string, name: string, excludeAreaId?: string): Promise<boolean> {
  const filters = [eq(area.orgId, orgId), eq(area.name, name)];
  if (excludeAreaId) filters.push(ne(area.id, excludeAreaId));
  const [row] = await db.select({ value: count() }).from(area).where(and(...filters));
  return (row?.value ?? 0) > 0;
}

/**
 * Qué responde el área y con qué glifo se dibuja. Los dos son opcionales: un área sin descripción
 * sigue siendo un área, y obligar a escribirla al darla de alta convertiría el organigrama en un
 * trámite. Lo que sí hace la descripción es que Improvement sepa a quién le toca qué — sin ella,
 * el Director General ve el nombre y nada más.
 */
export interface AreaDetalle {
  description?: string | null;
  /** Uno de AREA_ICONS. Cualquier otra cosa se guarda como null: el check de la base la rechazaría. */
  icon?: string | null;
}

/** Normaliza descripción e icono a lo que la base acepta, sin lanzar por un valor viejo o inventado. */
function detalle(d: AreaDetalle | undefined): { description: string | null; icon: string | null } {
  const desc = d?.description?.trim();
  const icon = d?.icon?.trim();
  return {
    description: desc ? desc.slice(0, 300) : null,
    icon: icon && (AREA_ICONS as readonly string[]).includes(icon) ? icon : null,
  };
}

export async function createArea(
  userId: string,
  orgId: string,
  name: string,
  color: string,
  extra?: AreaDetalle,
): Promise<Result<string>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define las áreas.", "FORBIDDEN");
  }

  const nombre = name.trim();
  if (!nombre) return fail("El área necesita un nombre.");
  if (await nameTaken(orgId, nombre)) return fail("Ya tienes un área con ese nombre.", "DUPLICATE_NAME");
  const tono = COLORES.includes(color) ? color : COLORES[0]!;

  const [row] = await db
    .insert(area)
    .values({ orgId, name: nombre, color: tono, ...detalle(extra) })
    .returning({ id: area.id });
  return row ? { ok: true, data: row.id } : fail("No se pudo crear el área.", "NOT_FOUND");
}

/**
 * Cambia qué responde un área y con qué glifo se dibuja, sin tocar su nombre ni su color.
 *
 * Separado de renameArea a propósito: renombrar un área es un cambio de organigrama que la gente
 * nota, y describirla es información que el dueño va afinando. Meterlos en la misma función
 * obligaría a mandar el nombre cada vez que solo se quiere corregir una línea de texto.
 */
export async function describeArea(
  userId: string,
  orgId: string,
  areaId: string,
  extra: AreaDetalle,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define las áreas.", "FORBIDDEN");
  }

  // orgId en el where además del id: un areaId de otra empresa no alcanza para escribir (mismo
  // criterio que renameArea, abajo).
  const [row] = await db
    .update(area)
    .set(detalle(extra))
    .where(and(eq(area.id, areaId), eq(area.orgId, orgId)))
    .returning({ id: area.id });

  return row ? { ok: true, data: true } : fail("Esa área no existe.", "NOT_FOUND");
}

export async function renameArea(
  userId: string,
  orgId: string,
  areaId: string,
  name: string,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define las áreas.", "FORBIDDEN");
  }

  const nombre = name.trim();
  if (!nombre) return fail("El área necesita un nombre.");
  if (await nameTaken(orgId, nombre, areaId)) {
    return fail("Ya tienes un área con ese nombre.", "DUPLICATE_NAME");
  }

  // orgId en el where y no solo el id: sin él, el id de un área de otra empresa sería editable por
  // quien fuera dueño de cualquier org (mismo criterio que server/kpis/mutations.ts).
  const [row] = await db
    .update(area)
    .set({ name: nombre })
    .where(and(eq(area.id, areaId), eq(area.orgId, orgId)))
    .returning({ id: area.id });

  return row ? { ok: true, data: true } : fail("Esa área no existe.", "NOT_FOUND");
}

/**
 * WHEN el área todavía tiene gente u objetivos THE SYSTEM SHALL negarse — la FK los dejaría en null
 * en silencio, y un empleado sin área con alcance `area` deja de ver su propio trabajo.
 */
export async function removeArea(userId: string, orgId: string, areaId: string): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño define las áreas.", "FORBIDDEN");
  }

  // orgId en ambos where y no solo areaId: sin él, un areaId de otra empresa cuenta filas reales de
  // esa otra empresa y la respuesta ("todavía tiene objetivos") le confirma a un dueño que un área
  // ajena existe y está ocupada — mismo criterio que ya aplicaba el delete de abajo.
  const [objetivos] = await db
    .select({ value: count() })
    .from(objective)
    .where(and(eq(objective.areaId, areaId), eq(objective.orgId, orgId)));
  if ((objetivos?.value ?? 0) > 0) {
    return fail("Esa área todavía tiene objetivos. Muévelos antes de borrarla.");
  }

  const [gente] = await db
    .select({ value: count() })
    .from(membership)
    .where(and(eq(membership.areaId, areaId), eq(membership.orgId, orgId)));
  if ((gente?.value ?? 0) > 0) {
    return fail("Esa área todavía tiene gente. Cámbialos de área antes de borrarla.");
  }

  const [row] = await db
    .delete(area)
    .where(and(eq(area.id, areaId), eq(area.orgId, orgId)))
    .returning({ id: area.id });

  return row ? { ok: true, data: true } : fail("Esa área no existe.", "NOT_FOUND");
}

export { COLORES as AREA_COLORS };
