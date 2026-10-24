// El Scorecard semanal: medibles con meta y su valor de cada semana, capturado a mano.
//
// No es "Indicadores" (org_kpi, calculado): no se mezclan. Definir y archivar medibles es solo del
// dueño; capturar, de quien tenga `scorecard: empresa` o sea el responsable con `propio`. Archivar y
// no borrar: la historia de measurable_value se queda.
import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { MEASURABLE_DIRECTIONS, MEASURABLE_UNITS, measurableValue, orgMeasurable, profile } from "@jotapuntoce/db/schema";
import { findMembership, findOwnerMembership, resolveSection } from "../../auth/guard.ts";
import { SCORECARD_WEEKS, isOnTrack, recentWeeks, weekStart } from "./week.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export interface ScorecardRow {
  id: string;
  title: string;
  ownerProfileId: string;
  ownerName: string;
  goal: number;
  goalDirection: (typeof MEASURABLE_DIRECTIONS)[number];
  unit: (typeof MEASURABLE_UNITS)[number];
  values: Record<string, { value: number; onTrack: boolean }>;
  canEnter: boolean;
}

export interface ScorecardView {
  currentWeek: string;
  weeks: string[];
  rows: ScorecardRow[];
  canDefine: boolean;
}

export async function listScorecard(userId: string, orgId: string, now = new Date()): Promise<ScorecardView> {
  const { membership, scope } = await resolveSection(userId, orgId, "scorecard");
  const currentWeek = weekStart(now);
  const weeks = recentWeeks(currentWeek, SCORECARD_WEEKS);
  if (scope === "ninguno") return { currentWeek, weeks, rows: [], canDefine: false };

  const measurables = await db
    .select({ m: orgMeasurable, fullName: profile.fullName, email: profile.email })
    .from(orgMeasurable)
    .innerJoin(profile, eq(profile.id, orgMeasurable.ownerProfileId))
    .where(
      and(
        eq(orgMeasurable.orgId, orgId),
        isNull(orgMeasurable.archivedAt),
        scope === "propio" ? eq(orgMeasurable.ownerProfileId, userId) : undefined,
      ),
    )
    .orderBy(asc(orgMeasurable.position), asc(orgMeasurable.createdAt));

  const ids = measurables.map((r) => r.m.id);
  const values = ids.length
    ? await db
        .select()
        .from(measurableValue)
        .where(and(inArray(measurableValue.measurableId, ids), inArray(measurableValue.weekStart, weeks)))
    : [];

  const rows = measurables.map(({ m, fullName, email }) => {
    const byWeek: ScorecardRow["values"] = {};
    for (const v of values) {
      if (v.measurableId === m.id) {
        byWeek[v.weekStart] = { value: v.value, onTrack: isOnTrack(v.value, m.goal, m.goalDirection) };
      }
    }
    return {
      id: m.id,
      title: m.title,
      ownerProfileId: m.ownerProfileId,
      ownerName: fullName ?? email,
      goal: m.goal,
      goalDirection: m.goalDirection,
      unit: m.unit,
      values: byWeek,
      canEnter: scope === "empresa" || m.ownerProfileId === userId,
    };
  });

  return { currentWeek, weeks, rows, canDefine: membership.role === "owner" };
}

const measurableSchema = z.object({
  title: z.string().trim().min(3, "Ponle un nombre de al menos 3 letras.").max(120),
  ownerProfileId: z.uuid(),
  goal: z.coerce.number().finite(),
  goalDirection: z.enum(MEASURABLE_DIRECTIONS),
  unit: z.enum(MEASURABLE_UNITS),
});

export async function createMeasurable(userId: string, orgId: string, input: unknown): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño define medibles.", "FORBIDDEN");
  const parsed = measurableSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa el medible.");
  if (!(await findMembership(parsed.data.ownerProfileId, orgId))) {
    return fail("El responsable no es parte de esta empresa.", "NOT_FOUND");
  }

  const [top] = await db
    .select({ n: max(orgMeasurable.position) })
    .from(orgMeasurable)
    .where(eq(orgMeasurable.orgId, orgId));
  const [row] = await db
    .insert(orgMeasurable)
    .values({ ...parsed.data, orgId, position: (top?.n ?? -1) + 1 })
    .returning({ id: orgMeasurable.id });
  if (!row) return fail("No se pudo guardar el medible.", "INTERNAL_ERROR");
  return { ok: true, data: { id: row.id } };
}

export async function archiveMeasurable(userId: string, orgId: string, measurableId: string): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño archiva medibles.", "FORBIDDEN");
  if (!z.uuid().safeParse(measurableId).success) return fail("Ese medible no existe.", "NOT_FOUND");
  const archived = await db
    .update(orgMeasurable)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(orgMeasurable.id, measurableId), eq(orgMeasurable.orgId, orgId), isNull(orgMeasurable.archivedAt)))
    .returning({ id: orgMeasurable.id });
  if (!archived.length) return fail("Ese medible no existe.", "NOT_FOUND");
  return { ok: true, data: true };
}

const valueSchema = z.object({
  weekStart: z.iso.date(),
  value: z.coerce.number().finite(),
});

export async function enterValue(
  userId: string,
  orgId: string,
  measurableId: string,
  input: unknown,
  now = new Date(),
): Promise<Result<true>> {
  const { scope } = await resolveSection(userId, orgId, "scorecard");
  if (scope === "ninguno") return fail("No tienes acceso al scorecard.", "FORBIDDEN");
  if (!z.uuid().safeParse(measurableId).success) return fail("Ese medible no existe.", "NOT_FOUND");

  const [m] = await db
    .select({ ownerProfileId: orgMeasurable.ownerProfileId })
    .from(orgMeasurable)
    .where(and(eq(orgMeasurable.id, measurableId), eq(orgMeasurable.orgId, orgId), isNull(orgMeasurable.archivedAt)))
    .limit(1);
  if (!m) return fail("Ese medible no existe.", "NOT_FOUND");
  if (scope === "propio" && m.ownerProfileId !== userId) {
    return fail("Solo el responsable captura este medible.", "FORBIDDEN");
  }

  const parsed = valueSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa el valor.");
  const ws = parsed.data.weekStart;
  if (weekStart(new Date(`${ws}T12:00:00Z`)) !== ws) return fail("La semana debe empezar en lunes.");
  if (ws > weekStart(now)) return fail("No se captura una semana que todavía no llega.");

  const enteredAt = new Date();
  await db
    .insert(measurableValue)
    .values({ measurableId, weekStart: ws, value: parsed.data.value, enteredBy: userId, enteredAt })
    .onConflictDoUpdate({
      target: [measurableValue.measurableId, measurableValue.weekStart],
      set: { value: parsed.data.value, enteredBy: userId, enteredAt },
    });
  return { ok: true, data: true };
}
