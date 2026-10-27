// Accountability Chart (blueprint summum-improvement, E5-T1): asientos con roles y responsable, en árbol
// por parent_seat_id. Leer es de la sección `equipo`; escribir, solo del dueño.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, membership, profile, seat } from "@jotapuntoce/db/schema";
import { findOwnerMembership, resolveSection } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

type SeatRow = typeof seat.$inferSelect;
export type SeatNode = SeatRow & { holderName: string | null; children: SeatNode[] };

const isUuid = (id: unknown): id is string => z.uuid().safeParse(id).success;

const seatSchema = z.object({
  title: z.string().trim().min(2, "El asiento lleva al menos 2 letras.").max(120),
  roles: z.array(z.string().trim().min(1).max(120)).min(1, "Agrega al menos un rol.").max(5, "Máximo 5 roles."),
  areaId: z.uuid().nullable().default(null),
  parentSeatId: z.uuid().nullable().default(null),
  holderProfileId: z.uuid().nullable().default(null),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

/** Árbol del org (raíces y sus hijos por `position`). Sin alcance en `equipo`: []. */
export async function listSeats(userId: string, orgId: string): Promise<SeatNode[]> {
  const { scope } = await resolveSection(userId, orgId, "equipo");
  if (scope === "ninguno") return [];
  const rows = await db
    .select({ seat, holderName: profile.fullName })
    .from(seat)
    .leftJoin(profile, eq(profile.id, seat.holderProfileId))
    .where(eq(seat.orgId, orgId))
    .orderBy(asc(seat.position), asc(seat.title));
  const nodes = new Map<string, SeatNode>(rows.map((r) => [r.seat.id, { ...r.seat, holderName: r.holderName, children: [] }]));
  const roots: SeatNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentSeatId ? nodes.get(node.parentSeatId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

async function findSeat(orgId: string, seatId: unknown) {
  if (!isUuid(seatId)) return null;
  const [row] = await db.select().from(seat).where(and(eq(seat.id, seatId), eq(seat.orgId, orgId)));
  return row ?? null;
}

/** Que los ids de area, padre y responsable sean de este org; null si todo cuadra. */
async function checkRefs(orgId: string, input: z.infer<typeof seatSchema>): Promise<Result<never> | null> {
  const [areaOk, parentOk, holderOk] = await Promise.all([
    input.areaId ? db.select({ id: area.id }).from(area).where(and(eq(area.id, input.areaId), eq(area.orgId, orgId))).then((r) => r.length > 0) : true,
    input.parentSeatId ? findSeat(orgId, input.parentSeatId).then(Boolean) : true,
    input.holderProfileId
      ? db.select({ id: membership.userId }).from(membership).where(and(eq(membership.userId, input.holderProfileId), eq(membership.orgId, orgId))).then((r) => r.length > 0)
      : true,
  ]);
  if (!areaOk) return fail("Esa área no es de esta empresa.", "NOT_FOUND");
  if (!parentOk) return fail("Ese asiento no existe en esta empresa.", "NOT_FOUND");
  if (!holderOk) return fail("El responsable no es parte de esta empresa.", "NOT_FOUND");
  return null;
}

export async function createSeat(userId: string, orgId: string, input: unknown): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño arma el Accountability Chart.", "FORBIDDEN");
  const parsed = seatSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const refError = await checkRefs(orgId, parsed.data);
  if (refError) return refError;
  const [row] = await db.insert(seat).values({ orgId, ...parsed.data }).returning({ id: seat.id });
  return { ok: true, data: row! };
}

export async function updateSeat(userId: string, orgId: string, seatId: unknown, input: unknown): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño arma el Accountability Chart.", "FORBIDDEN");
  const current = await findSeat(orgId, seatId);
  if (!current) return fail("Ese asiento no existe en esta empresa.", "NOT_FOUND");
  const parsed = seatSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const refError = await checkRefs(orgId, parsed.data);
  if (refError) return refError;

  // Subir por los padres del nuevo padre: si aparece este asiento, colgarlo ahí cerraría un ciclo.
  if (parsed.data.parentSeatId) {
    const parents = new Map(
      (await db.select({ id: seat.id, parentSeatId: seat.parentSeatId }).from(seat).where(eq(seat.orgId, orgId))).map((r) => [r.id, r.parentSeatId]),
    );
    for (let at: string | null | undefined = parsed.data.parentSeatId; at; at = parents.get(at)) {
      if (at === current.id) return fail("Ese asiento no puede colgar de sí mismo.");
    }
  }

  await db.update(seat).set({ ...parsed.data, updatedAt: new Date() }).where(eq(seat.id, current.id));
  return { ok: true, data: { id: current.id } };
}

/** Los hijos quedan como raíces (parent_seat_id `set null`). */
export async function removeSeat(userId: string, orgId: string, seatId: unknown): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño arma el Accountability Chart.", "FORBIDDEN");
  const current = await findSeat(orgId, seatId);
  if (!current) return fail("Ese asiento no existe en esta empresa.", "NOT_FOUND");
  await db.delete(seat).where(eq(seat.id, current.id));
  return { ok: true, data: { id: current.id } };
}
