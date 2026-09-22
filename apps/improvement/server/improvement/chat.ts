// La conversación entre el dueño y su Director General.
//
// Es la vía por la que el dueño le cuenta a Improvement lo que ningún dato de la base dice: que un
// cliente llamó enojado, que se va a ir alguien, que este mes hay que apretar. Sin el chat,
// Improvement solo ve filas; con él, ve el negocio.
//
// SOLO EL DUEÑO ESCRIBE AQUÍ, y no es una restricción de permisos sino de producto (decisión de
// diseño #1 del plan): cada Improvement dirige como dirige SU dueño, y un hilo con ocho voces
// distintas le enseñaría a dirigir como un comité. Los empleados sí ven lo que sale del ciclo —las
// tareas delegadas—, nunca el razonamiento.
//
// Distinto de owner_memory: allá vive lo que Improvement SABE del dueño (su retrato, append-only,
// se lee entero); aquí lo que se DIJERON (un hilo, se lee por tramos). Ver el comentario de
// owner_message en packages/db/src/schema.ts.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { improvementCycle, ownerMessage } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export type OwnerMessageRow = typeof ownerMessage.$inferSelect;

/** Cuántos mensajes trae una página del hilo. */
const PAGINA = 50;

const mensajeSchema = z.object({
  content: z.string().trim().min(1, "Escribe algo.").max(4000),
  cycleId: z.uuid().nullable().optional(),
});

/**
 * Guarda lo que el dueño acaba de decirle a Improvement.
 *
 * No llama al modelo. La respuesta de Improvement la escribe `replyFromImprovement`, y la decide
 * el motor: separar las dos cosas es lo que permite que el dueño escriba tres mensajes seguidos
 * sin disparar tres llamadas al proveedor, y que el cron conteste cuando tenga algo que decir en
 * vez de contestar por cortesía.
 */
export async function sendOwnerMessage(
  userId: string,
  orgId: string,
  input: unknown,
): Promise<Result<OwnerMessageRow>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Improvement solo conversa con el dueño de la empresa.", "FORBIDDEN");
  }

  const parsed = mensajeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Faltan datos.");

  // El ciclo se valida contra ESTA empresa y ESTE dueño antes de escribir: un cycleId de otra
  // organización en el cuerpo del POST no puede quedar colgado de un mensaje (no negociable #2).
  let cycleId: string | null = parsed.data.cycleId ?? null;
  if (cycleId && !(await cicloDelDueno(userId, orgId, cycleId))) {
    return fail("Ese ciclo no es de esta empresa.", "NOT_FOUND");
  }

  const [row] = await db
    .insert(ownerMessage)
    .values({ orgId, ownerId: userId, role: "dueno", content: parsed.data.content, cycleId })
    .returning();

  return row ? { ok: true, data: row } : fail("No se pudo guardar el mensaje.", "DB_ERROR");
}

/**
 * Guarda lo que Improvement contesta.
 *
 * No recibe userId de sesión: lo escribe el motor, que corre desde un cron y no en nombre de
 * nadie. La tenencia la garantiza el llamador, que ya cargó el ciclo de este org.
 */
export async function replyFromImprovement(
  orgId: string,
  ownerId: string,
  content: string,
  cycleId: string | null = null,
): Promise<OwnerMessageRow | null> {
  const texto = content.trim();
  if (!texto) return null;

  const [row] = await db
    .insert(ownerMessage)
    .values({ orgId, ownerId, role: "improvement", content: texto.slice(0, 4000), cycleId })
    .returning();
  return row ?? null;
}

/** ¿Este ciclo es de esta empresa y de este dueño? */
async function cicloDelDueno(userId: string, orgId: string, cycleId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: improvementCycle.id })
    .from(improvementCycle)
    .where(
      and(
        eq(improvementCycle.id, cycleId),
        eq(improvementCycle.orgId, orgId),
        eq(improvementCycle.ownerId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * El hilo, lo más reciente primero.
 *
 * Devuelve lista vacía a quien no es el dueño en vez de lanzar: el alcance se resuelve ADENTRO
 * (convención de la casa), igual que listOwnerMemory. Quien protege una ruta usa el guard.
 */
export async function listConversation(
  userId: string,
  orgId: string,
  opts: { cycleId?: string; limit?: number } = {},
): Promise<OwnerMessageRow[]> {
  if (!(await findOwnerMembership(userId, orgId))) return [];

  const conditions = [eq(ownerMessage.orgId, orgId), eq(ownerMessage.ownerId, userId)];
  if (opts.cycleId) conditions.push(eq(ownerMessage.cycleId, opts.cycleId));

  return db
    .select()
    .from(ownerMessage)
    .where(and(...conditions))
    .orderBy(desc(ownerMessage.createdAt))
    .limit(Math.min(Math.max(opts.limit ?? PAGINA, 1), 200));
}
