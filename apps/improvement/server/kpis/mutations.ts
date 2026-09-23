// El dueño arma los indicadores de SU empresa: qué mide, cómo se llama y de dónde sale el número.
//
// Solo el dueño, no cualquier miembro: qué mide la empresa es una decisión de quien la dirige, y un
// empleado que pudiera cambiarla reescribiría el tablero de su jefe. La segunda capa es la política
// RLS de org_kpi (migración 0013), que ya solo concede SELECT — ninguna escritura llega por un
// cliente con rol `authenticated`.
import { and, count, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { orgKpi } from "@jotapuntoce/db/schema";
import { MAX_KPIS, MIN_KPIS } from "@jotapuntoce/ui/building/kpis.ts";
import { findOwnerMembership } from "../auth/guard.ts";
import { kpiSource } from "./sources.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

/** 404 si no es miembro (findOwnerMembership), error tipado si es miembro pero no dueño. */
async function requireOwner(userId: string, orgId: string): Promise<Result<true>> {
  const row = await findOwnerMembership(userId, orgId);
  if (!row) return fail("Solo el dueño configura los indicadores.", "FORBIDDEN");
  return { ok: true, data: true };
}

export interface KpiInput {
  label: string;
  hint?: string | null;
  source: string;
  config?: unknown;
  manualValue?: number | null;
  format?: string;
}

const FORMATS = new Set(["numero", "porcentaje", "dinero"]);

function validate(input: KpiInput): Result<Required<Pick<KpiInput, "label" | "source">> & KpiInput> {
  const label = input.label?.trim();
  if (!label) return fail("El indicador necesita un nombre.");
  if (!kpiSource(input.source)) return fail("Esa fuente no existe.");
  if (input.format && !FORMATS.has(input.format)) return fail("Ese formato no existe.");
  return { ok: true, data: { ...input, label, source: input.source } };
}

/**
 * WHEN la empresa ya tiene MAX_KPIS indicadores THE SYSTEM SHALL rechazar el alta — la tarjeta dibuja
 * una rejilla de seis y el séptimo no se vería; que el dueño borre uno es una decisión suya, no algo
 * que el panel deba resolver truncando en silencio.
 */
export async function addOrgKpi(userId: string, orgId: string, input: KpiInput): Promise<Result<string>> {
  const owner = await requireOwner(userId, orgId);
  if (!owner.ok) return owner;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const [tally] = await db.select({ value: count() }).from(orgKpi).where(eq(orgKpi.orgId, orgId));
  const existing = tally?.value ?? 0;

  if (existing >= MAX_KPIS) {
    return fail(`Ya tienes ${MAX_KPIS} indicadores. Borra uno para agregar otro.`);
  }

  const [row] = await db
    .insert(orgKpi)
    .values({
      orgId,
      label: checked.data.label,
      hint: checked.data.hint ?? null,
      source: checked.data.source,
      config: checked.data.config ?? {},
      manualValue: checked.data.manualValue ?? null,
      format: checked.data.format ?? "numero",
      position: existing,
    })
    .returning({ id: orgKpi.id });

  return row ? { ok: true, data: row.id } : fail("No se pudo guardar el indicador.", "NOT_FOUND");
}

export async function updateOrgKpi(
  userId: string,
  orgId: string,
  kpiId: string,
  input: KpiInput,
): Promise<Result<true>> {
  const owner = await requireOwner(userId, orgId);
  if (!owner.ok) return owner;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const [row] = await db
    .update(orgKpi)
    .set({
      label: checked.data.label,
      hint: checked.data.hint ?? null,
      source: checked.data.source,
      config: checked.data.config ?? {},
      manualValue: checked.data.manualValue ?? null,
      format: checked.data.format ?? "numero",
      updatedAt: new Date(),
    })
    // orgId en el where y no solo el id: sin él, el id de un indicador de otra empresa sería
    // editable por quien fuera dueño de cualquier org.
    .where(and(eq(orgKpi.id, kpiId), eq(orgKpi.orgId, orgId)))
    .returning({ id: orgKpi.id });

  return row ? { ok: true, data: true } : fail("Ese indicador no existe.", "NOT_FOUND");
}

/**
 * WHEN borrar dejaría a la empresa con menos de MIN_KPIS THE SYSTEM SHALL rechazarlo — una tarjeta
 * con dos números no dice nada de una empresa, y el mínimo de 4 es el mismo criterio que traía la
 * selección anterior.
 */
export async function removeOrgKpi(userId: string, orgId: string, kpiId: string): Promise<Result<true>> {
  const owner = await requireOwner(userId, orgId);
  if (!owner.ok) return owner;

  const [tally] = await db.select({ value: count() }).from(orgKpi).where(eq(orgKpi.orgId, orgId));
  const existing = tally?.value ?? 0;

  if (existing <= MIN_KPIS) {
    return fail(`Necesitas al menos ${MIN_KPIS} indicadores. Cambia uno en vez de borrarlo.`);
  }

  const [row] = await db
    .delete(orgKpi)
    .where(and(eq(orgKpi.id, kpiId), eq(orgKpi.orgId, orgId)))
    .returning({ id: orgKpi.id });

  return row ? { ok: true, data: true } : fail("Ese indicador no existe.", "NOT_FOUND");
}
