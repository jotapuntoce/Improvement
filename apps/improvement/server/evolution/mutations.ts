// En qué nivel de evolución va la empresa REAL, y cómo se mueve.
//
// No confundir con el tracker de construcción (BUILD_STAGES / org_build_stage): ese mide qué tan
// construida está la empresa DIGITAL y es idéntico para todo cliente. Esto mide el negocio, cada
// empresa empieza en un punto distinto y llega al siguiente nivel por un camino distinto.
//
// El camino son sus filas de org_need. Por eso aquí no hay una lista de requisitos por nivel: qué le
// falta a ESTA empresa es diagnóstico, y el diagnóstico es dato de esa empresa, nunca una rama de
// código (.claude/rules/motor-generico.md).
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { organization, orgNeed } from "@jotapuntoce/db/schema";
import { EVOLUTION_LEVELS, evolutionLevelAt } from "@jotapuntoce/ui/building/evolutionLevels.ts";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface EvolutionState {
  level: number;
  name: string;
  description: string;
  /** El siguiente nivel, o null si ya está en el último. */
  nextName: string | null;
  /** Cuántas necesidades siguen sin cerrar. Es lo que separa a la empresa del siguiente nivel. */
  openNeeds: number;
  resolvedNeeds: number;
}

/**
 * El nivel de la empresa y qué tan cerca está del siguiente.
 *
 * Solo el dueño: mismo criterio que listNeeds — el número resume el diagnóstico, y el diagnóstico es
 * suyo. Devuelve null a quien no lo sea, en vez de confiar en que la pantalla filtre.
 */
export async function getEvolution(userId: string, orgId: string): Promise<EvolutionState | null> {
  if (!(await findOwnerMembership(userId, orgId))) return null;

  const [org] = await db
    .select({ level: organization.evolutionLevel })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) return null;

  const needs = await db
    .select({ status: orgNeed.status })
    .from(orgNeed)
    .where(eq(orgNeed.orgId, orgId));

  const nivel = evolutionLevelAt(org.level);
  const siguiente = EVOLUTION_LEVELS[org.level + 1];

  return {
    level: org.level,
    name: nivel.name,
    description: nivel.description,
    nextName: siguiente?.name ?? null,
    // Derivado, no una columna: un contador guardado se desincroniza en cuanto alguien escriba una
    // necesidad sin actualizarlo.
    openNeeds: needs.filter((n) => n.status === "abierta" || n.status === "en_progreso").length,
    resolvedNeeds: needs.filter((n) => n.status === "resuelta").length,
  };
}

const nivelSchema = z.coerce.number().int().min(0).max(EVOLUTION_LEVELS.length - 1);

/**
 * Mueve el nivel de la empresa.
 *
 * Hoy lo mueve el dueño a mano y a propósito: el Improvement de esta empresa todavía no tiene de qué
 * aprender para decidirlo solo. Cuando lo tenga, este es el punto de entrada que va a llamar — el
 * esqueleto ya está puesto y no hay nada que migrar.
 */
export async function setEvolutionLevel(
  userId: string,
  orgId: string,
  level: unknown,
): Promise<Result<number>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño mueve el nivel." } };
  }

  const parsed = nivelSchema.safeParse(level);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Ese nivel no existe." } };
  }

  const [row] = await db
    .update(organization)
    .set({ evolutionLevel: parsed.data, updatedAt: new Date() })
    .where(eq(organization.id, orgId))
    .returning({ level: organization.evolutionLevel });

  return row
    ? { ok: true, data: row.level }
    : { ok: false, error: { code: "NOT_FOUND", message: "Esa empresa no existe." } };
}
