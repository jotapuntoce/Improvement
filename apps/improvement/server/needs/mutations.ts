// El diagnóstico de una empresa: qué le falta para evolucionar, crecer, mejorar y sostener.
//
// Es la pieza de la que cuelga todo lo demás. Un objetivo existe porque atiende una necesidad; los
// puntos que vale dependen de la severidad de esa necesidad (server/objectives/points.ts); y cuando
// una necesidad pide un experto de fuera, se deriva a Summum desde aquí.
//
// Solo el dueño lee y escribe: el diagnóstico incluye el juicio de Improvement sobre áreas y, por
// tanto, sobre el trabajo de personas concretas. Misma razón por la que la política RLS de 0018 es
// owner-only y no "miembro del org".
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, orgNeed } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { belongsToOrg } from "../db/belongsToOrg.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export type NeedRow = typeof orgNeed.$inferSelect;

export interface NeedWithArea extends NeedRow {
  areaName: string | null;
}

export const SEVERITY_LABEL: Record<number, string> = {
  1: "Leve",
  2: "Moderada",
  3: "Crítica",
};

const needSchema = z.object({
  title: z.string().trim().min(3, "Escribe qué necesita la empresa."),
  detail: z.string().trim().max(2000).nullable(),
  areaId: z.uuid().nullable(),
  severity: z.coerce.number().int().min(1).max(3),
  source: z.enum(["improvement", "dueno"]),
});

/**
 * Las necesidades de una empresa, las abiertas primero y dentro de ellas las más graves arriba.
 *
 * El alcance se resuelve ADENTRO (convención de la casa desde la revisión de la Tarea 8): devuelve
 * lista vacía a quien no es dueño en vez de confiar en que la pantalla se acuerde de filtrar.
 */
export async function listNeeds(userId: string, orgId: string): Promise<NeedWithArea[]> {
  if (!(await findOwnerMembership(userId, orgId))) return [];

  const rows = await db
    .select({ need: orgNeed, areaName: area.name })
    .from(orgNeed)
    .leftJoin(area, eq(area.id, orgNeed.areaId))
    .where(eq(orgNeed.orgId, orgId))
    .orderBy(desc(orgNeed.severity), asc(orgNeed.createdAt));

  // Abiertas y en progreso antes que resueltas y derivadas: lo que todavía duele va arriba.
  const pesoEstado: Record<string, number> = { abierta: 0, en_progreso: 1, derivada: 2, resuelta: 3 };
  return rows
    .map((r) => ({ ...r.need, areaName: r.areaName }))
    .sort((a, b) => (pesoEstado[a.status] ?? 9) - (pesoEstado[b.status] ?? 9));
}

/** La severidad de una necesidad de ESTE org, o null si no existe aquí. Lo que points.ts necesita. */
export async function needSeverity(needId: string, orgId: string): Promise<number | null> {
  const [row] = await db
    .select({ severity: orgNeed.severity })
    .from(orgNeed)
    .where(and(eq(orgNeed.id, needId), eq(orgNeed.orgId, orgId)))
    .limit(1);
  return row?.severity ?? null;
}

export async function createNeed(
  userId: string,
  orgId: string,
  input: unknown,
): Promise<Result<NeedRow>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño registra lo que su empresa necesita.", "FORBIDDEN");
  }

  const parsed = needSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Faltan datos del formulario.");

  const { areaId, ...rest } = parsed.data;
  // El areaId llega de un <select>, o sea del navegador: no es de confianza aunque lo mande el dueño.
  if (areaId && !(await belongsToOrg(area, areaId, orgId))) {
    return fail("Esa área no es de esta empresa.", "NOT_FOUND");
  }

  const [row] = await db
    .insert(orgNeed)
    .values({ ...rest, areaId, orgId })
    .returning();
  if (!row) return fail("No se pudo guardar la necesidad.", "DB_ERROR");
  return { ok: true, data: row };
}

const estadoSchema = z.enum(["abierta", "en_progreso", "resuelta", "derivada"]);

export async function updateNeedStatus(
  userId: string,
  orgId: string,
  needId: string,
  status: unknown,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño cambia el estado de una necesidad.", "FORBIDDEN");
  }

  const parsed = estadoSchema.safeParse(status);
  if (!parsed.success) return fail("Ese estado no existe.");

  const [row] = await db
    .update(orgNeed)
    .set({ status: parsed.data, updatedAt: new Date() })
    .where(and(eq(orgNeed.id, needId), eq(orgNeed.orgId, orgId)))
    .returning({ id: orgNeed.id });

  return row ? { ok: true, data: true } : fail("Esa necesidad no es de esta empresa.", "NOT_FOUND");
}

/**
 * Deriva una necesidad a Summum System: Improvement ya diagnosticó desde adentro y ahora entrega la
 * necesidad con sus patógenos para que Summum haga el match con su empresa afiliada de esa área.
 *
 * La flecha va en UN solo sentido. Summum recibe; nunca escribe aquí ni le dice a Improvement qué
 * está mal — quien está adentro de la empresa es Improvement.
 *
 * Hoy la derivación solo deja la marca (referred_at + nota): el canal real hacia Summum todavía no
 * existe. Cuando exista, lee estas filas; no hay nada más que migrar.
 */
export async function referNeedToSummum(
  userId: string,
  orgId: string,
  needId: string,
  note: unknown,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño deriva una necesidad.", "FORBIDDEN");
  }

  const parsed = z.string().trim().max(2000).nullable().safeParse(note);
  if (!parsed.success) return fail("Esa nota no es válida.");

  const [row] = await db
    .update(orgNeed)
    .set({
      status: "derivada",
      referredAt: new Date(),
      referralNote: parsed.data,
      updatedAt: new Date(),
    })
    .where(and(eq(orgNeed.id, needId), eq(orgNeed.orgId, orgId)))
    .returning({ id: orgNeed.id });

  return row ? { ok: true, data: true } : fail("Esa necesidad no es de esta empresa.", "NOT_FOUND");
}

/**
 * El expediente que se le entrega a Summum: la necesidad, su área y sus patógenos, en texto plano.
 *
 * Existe como función y no como plantilla dentro de una pantalla porque es el contrato de salida:
 * el día que el canal a Summum sea un correo, un webhook o una llamada, todos leen esto.
 */
export function summumBrief(need: NeedWithArea): string {
  const lineas = [
    `Empresa: necesita apoyo en ${need.areaName ?? "un área sin asignar"}.`,
    `Necesidad: ${need.title}`,
    `Severidad: ${SEVERITY_LABEL[need.severity] ?? need.severity}`,
  ];
  if (need.detail) lineas.push(`Patógenos: ${need.detail}`);
  if (need.referralNote) lineas.push(`Nota de Improvement: ${need.referralNote}`);
  return lineas.join("\n");
}
