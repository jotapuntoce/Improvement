// People Analyzer (blueprint summum-improvement, E5-T3): valores centrales de la Visión × GWC, por
// trimestre. Privado como responsibility_level: la persona y el dueño. Sin totales ni orden por puntaje.
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { membership, orgVision, PEOPLE_RATINGS, peopleReview, profile } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";

// Las rutas no importan packages/db: leen las calificaciones posibles de aquí.
export { PEOPLE_RATINGS };

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

const isUuid = (id: unknown): id is string => z.uuid().safeParse(id).success;

const quarterStart = z.iso.date().refine((d) => /-(01|04|07|10)-01$/.test(d), "El periodo empieza el primer día de un trimestre.");

const reviewSchema = z.object({
  periodStart: quarterStart,
  ratings: z.record(z.string(), z.enum(PEOPLE_RATINGS)),
  gwc: z.object({ entiende: z.boolean(), quiere: z.boolean(), capacidad: z.boolean() }),
  note: z.string().trim().max(2000).nullable().default(null),
});

/** Los valores centrales de la Visión (solo lectura). */
async function coreValues(orgId: string): Promise<string[]> {
  const [row] = await db.select({ coreValues: orgVision.coreValues }).from(orgVision).where(eq(orgVision.orgId, orgId)).limit(1);
  const parsed = z.array(z.string()).safeParse(row?.coreValues);
  return parsed.success ? parsed.data.map((v) => v.trim()).filter(Boolean) : [];
}

export async function saveReview(userId: string, orgId: string, employeeId: unknown, input: unknown): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño evalúa al equipo.", "FORBIDDEN");
  if (!isUuid(employeeId)) return fail("Esa persona no es parte de esta empresa.", "NOT_FOUND");
  const member = await db
    .select({ id: membership.userId })
    .from(membership)
    .where(and(eq(membership.orgId, orgId), eq(membership.userId, employeeId)));
  if (member.length === 0) return fail("Esa persona no es parte de esta empresa.", "NOT_FOUND");

  const values = await coreValues(orgId);
  if (values.length === 0) return fail("Primero escribe los valores en la Visión.");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const keys = Object.keys(parsed.data.ratings);
  if (keys.some((k) => !values.includes(k)) || values.some((v) => !keys.includes(v))) {
    return fail("Califica cada valor central de la Visión, y solo esos.");
  }

  const [row] = await db
    .insert(peopleReview)
    .values({ orgId, employeeId, reviewerId: userId, ...parsed.data })
    .onConflictDoUpdate({
      target: [peopleReview.orgId, peopleReview.employeeId, peopleReview.periodStart],
      set: { ratings: parsed.data.ratings, gwc: parsed.data.gwc, note: parsed.data.note, reviewerId: userId, updatedAt: new Date() },
    })
    .returning({ id: peopleReview.id });
  return { ok: true, data: row! };
}

/** Del periodo, ordenadas por nombre. Nunca un total ni un orden por calificación. */
export async function reviewsForOwner(userId: string, orgId: string, periodStart: unknown) {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño ve el People Analyzer del equipo.", "FORBIDDEN");
  const period = quarterStart.safeParse(periodStart);
  if (!period.success) return fail(period.error.issues[0]?.message ?? "Revisa el periodo.");
  const rows = await db
    .select({
      id: peopleReview.id,
      employeeId: peopleReview.employeeId,
      employeeName: profile.fullName,
      periodStart: peopleReview.periodStart,
      ratings: peopleReview.ratings,
      gwc: peopleReview.gwc,
      note: peopleReview.note,
    })
    .from(peopleReview)
    .innerJoin(profile, eq(profile.id, peopleReview.employeeId))
    .where(and(eq(peopleReview.orgId, orgId), eq(peopleReview.periodStart, period.data)))
    .orderBy(asc(profile.fullName), asc(profile.email));
  return { ok: true as const, data: rows };
}

export async function myReviews(userId: string, orgId: string) {
  await assertMembership(userId, orgId);
  return db
    .select({ id: peopleReview.id, periodStart: peopleReview.periodStart, ratings: peopleReview.ratings, gwc: peopleReview.gwc, note: peopleReview.note })
    .from(peopleReview)
    .where(and(eq(peopleReview.orgId, orgId), eq(peopleReview.employeeId, userId)))
    .orderBy(desc(peopleReview.periodStart));
}
