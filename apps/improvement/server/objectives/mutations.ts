// Lecturas y escrituras de objetivos. "mutations.ts" es el nombre de módulo fijado por el blueprint
// (§9.6) aunque también exponga listObjectives — una lectura server-side, no un segundo archivo.
// Cada función empieza validando tenencia con assertMembership(userId, orgId): la regla de
// server/auth/guard.ts es que ninguna query nueva confíe solo en RLS o solo en el guard de la ruta.
import { and, asc, count, desc, eq, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, employeePointsLedger, membership, objective, orgNeed } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership, resolveSection } from "../auth/guard.ts";
import { belongsToOrg } from "../db/belongsToOrg.ts";
import { areaScopeFilter } from "../permissions/areaScope.ts";
import { needSeverity } from "../needs/mutations.ts";
import { validateEvidence, evidenceTypeSchema, type EvidenceType } from "./evidence.ts";
import { enablementPoints, scoreObjective } from "./points.ts";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type ObjectiveRow = typeof objective.$inferSelect;
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

function decodeCursor(cursor?: string | null): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [createdAtIso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAtIso || !id) return null;
    const createdAt = new Date(createdAtIso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(row: ObjectiveRow): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

/**
 * WHEN un empleado del org A solicita la lista de objetivos del org B THE SYSTEM SHALL devolver 404
 * (criterio #3, vía resolveSection → assertMembership). WHEN se piden más de 100 objetivos por
 * página THE SYSTEM SHALL limitar la respuesta a 100 (criterio #4, vía el Math.min de abajo).
 *
 * El alcance se resuelve ADENTRO y no lo pasa el llamador: así ninguna pantalla futura puede
 * olvidarse de filtrar. Sin RLS corriendo en runtime (packages/db/src/client.ts conecta con una
 * connection string fija, no por-usuario) este filtro es la única capa que hay.
 */
export async function listObjectives(
  userId: string,
  orgId: string,
  opts: { cursor?: string | null; limit?: number } = {},
) {
  const { membership: member, scope } = await resolveSection(userId, orgId, "objetivos");
  if (scope === "ninguno") {
    return { ok: true as const, data: { objectives: [], nextCursor: null } };
  }

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = decodeCursor(opts.cursor);

  // El recorte por alcance lo arma areaScopeFilter, una sola vez para toda la casa — incluido el
  // caso del miembro sin área, que devuelve cero y nunca la empresa entera (ver areaScope.ts).
  const conditions = [
    eq(objective.orgId, orgId),
    areaScopeFilter(scope, { areaId: member.areaId, userId }, {
      areaId: objective.areaId,
      ownerId: objective.assignedEmployeeId,
    }),
  ];

  if (cursor) {
    const beforeCursor = or(
      lt(objective.createdAt, cursor.createdAt),
      and(eq(objective.createdAt, cursor.createdAt), lt(objective.id, cursor.id)),
    );
    if (beforeCursor) conditions.push(beforeCursor);
  }

  const rows = await db
    .select()
    .from(objective)
    .where(and(...conditions))
    .orderBy(desc(objective.createdAt), desc(objective.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last) : null;

  return { ok: true as const, data: { objectives: page, nextCursor } };
}

/**
 * Los objetivos abiertos de ESTA persona, sin pasar por el alcance de la sección.
 *
 * `listObjectives` contesta "qué me dejan ver"; esta contesta "qué me toca". No son la misma
 * pregunta: al dueño el alcance le concede la empresa entera, y su bandeja de pendientes no son
 * los objetivos de todos — son los suyos. El filtro es `assigned_employee_id = userId`, así que
 * nadie puede ver por aquí nada que no sea propio, tenga el alcance que tenga.
 *
 * Sin `requireSection`: tu propio trabajo no es una sección que el dueño te pueda apagar, por la
 * misma razón que /[org]/tareas no la tiene.
 */
export async function listMyObjectives(userId: string, orgId: string) {
  await assertMembership(userId, orgId);

  return db
    .select()
    .from(objective)
    .where(
      and(
        eq(objective.orgId, orgId),
        eq(objective.assignedEmployeeId, userId),
        ne(objective.status, "completed"),
      ),
    )
    .orderBy(asc(objective.dueDate));
}

/** Cuántos objetivos abiertos tiene esta persona. Mismo where que `listMyObjectives` — el
 *  contador y la lista no pueden discrepar, así que se leen uno al lado del otro. */
export async function countMyOpenObjectives(userId: string, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(objective)
    .where(
      and(
        eq(objective.orgId, orgId),
        eq(objective.assignedEmployeeId, userId),
        ne(objective.status, "completed"),
      ),
    );
  return Number(row?.n ?? 0);
}

/** ¿Esta persona es de esta empresa? Un objetivo se le asigna a alguien de adentro, o a nadie. */
async function isMember(targetUserId: string, orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(and(eq(membership.userId, targetUserId), eq(membership.orgId, orgId)))
    .limit(1);
  return Boolean(row);
}

const nuevoObjetivoSchema = z.object({
  title: z.string().trim().min(3, "Escribe qué hay que lograr."),
  description: z.string().trim().max(2000).nullable(),
  impactWeight: z.coerce.number().int().min(0).max(100),
  dueDate: z.coerce.date(),
  areaId: z.uuid().nullable(),
  assignedEmployeeId: z.uuid().nullable(),
  needId: z.uuid().nullable(),
  kind: z.enum(["ipa", "non_ipa"]),
  evidenceType: evidenceTypeSchema,
});

/**
 * El dueño emite trabajo.
 *
 * Sin esta función una empresa digital se puede entregar completa — configurada, con sus áreas, su
 * equipo adentro y su tracker al día — y aun así nadie puede pedirle nada a nadie. Era el hueco más
 * grande del esqueleto: los objetivos existían solo porque el seed los insertaba.
 *
 * Solo el dueño. Un empleado que pudiera crearse sus propios objetivos se pondría los puntos que
 * quisiera, y el ledger es moneda canjeable (server/powerups/mutations.ts), no una bitácora.
 *
 * Los tres ids (área, persona, necesidad) llegan de un <select>, o sea del navegador: cada uno se
 * comprueba contra ESTA empresa antes de escribir, aunque quien los mande sea el dueño.
 */
export async function createObjective(
  userId: string,
  orgId: string,
  input: unknown,
): Promise<Result<ObjectiveRow>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño emite objetivos.", "FORBIDDEN");
  }

  const parsed = nuevoObjetivoSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Faltan datos del formulario.");
  const { areaId, assignedEmployeeId, needId, ...rest } = parsed.data;

  const [areaOk, needOk, personaOk] = await Promise.all([
    areaId ? belongsToOrg(area, areaId, orgId) : true,
    needId ? belongsToOrg(orgNeed, needId, orgId) : true,
    assignedEmployeeId ? isMember(assignedEmployeeId, orgId) : true,
  ]);
  if (!areaOk) return fail("Esa área no es de esta empresa.", "NOT_FOUND");
  if (!needOk) return fail("Esa necesidad no es de esta empresa.", "NOT_FOUND");
  if (!personaOk) return fail("Esa persona no es de tu equipo.", "NOT_FOUND");

  const [row] = await db
    .insert(objective)
    .values({ ...rest, orgId, areaId, assignedEmployeeId, needId, createdBy: userId })
    .returning();
  if (!row) return fail("No se pudo crear el objetivo.", "DB_ERROR");
  return { ok: true, data: row };
}

/**
 * Le pasa un objetivo a otra persona, o lo deja sin responsable.
 *
 * Existe porque dar de baja a alguien deja sus objetivos huérfanos a propósito (el trabajo planeado
 * sobrevive a quien se va, ver employees/mutations.ts) y esa pantalla se lo promete al dueño con
 * todas sus letras: "quedan sin responsable para que se los pases a alguien más". Sin esto la
 * promesa no se podía cumplir.
 */
export async function assignObjective(
  userId: string,
  orgId: string,
  objectiveId: string,
  targetUserId: string | null,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño reparte el trabajo.", "FORBIDDEN");
  }
  if (targetUserId && !(await isMember(targetUserId, orgId))) {
    return fail("Esa persona no es de tu equipo.", "NOT_FOUND");
  }

  const [row] = await db
    .update(objective)
    .set({ assignedEmployeeId: targetUserId })
    .where(and(eq(objective.id, objectiveId), eq(objective.orgId, orgId)))
    .returning({ id: objective.id });

  return row ? { ok: true, data: true } : fail("Ese objetivo no es de esta empresa.", "NOT_FOUND");
}

/**
 * Transacción: valida tenencia, estado y evidencia, marca el objetivo completed, y escribe al ledger
 * append-only lo que se ganó — lo del responsable, y lo que les toca a quienes lo habilitaron.
 *
 * Todo pasa dentro de la misma transacción a propósito. La comprobación de estado y el update
 * condicional ya cerraban la doble inserción (criterios #1 y #2); ahora además el pago de
 * habilitación no puede quedar a medias si algo falla después de marcarlo completado.
 */
export async function completeObjective(
  userId: string,
  orgId: string,
  objectiveId: string,
  evidenceInput?: unknown,
) {
  await assertMembership(userId, orgId);

  // Fuera de la transacción: son lecturas, y dejarlas adentro alargaría el candado sobre la fila
  // del objetivo sin que ninguna de las dos pueda cambiar el veredicto.
  const [obj] = await db
    .select()
    .from(objective)
    .where(and(eq(objective.id, objectiveId), eq(objective.orgId, orgId)))
    .limit(1);

  if (!obj) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "El objetivo no existe en este org." },
    };
  }
  if (obj.status === "completed") {
    return {
      ok: false as const,
      error: { code: "VALIDATION_ERROR" as const, message: "El objetivo ya está completado." },
    };
  }
  if (!obj.assignedEmployeeId) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION_ERROR" as const,
        message: "El objetivo no tiene un empleado asignado.",
      },
    };
  }

  const employeeId = obj.assignedEmployeeId;

  const evidencia = validateEvidence(obj.evidenceType as EvidenceType, evidenceInput);
  if (!evidencia.ok) {
    return {
      ok: false as const,
      error: { code: "VALIDATION_ERROR" as const, message: evidencia.message },
    };
  }

  // Lo que la fórmula necesita saber del contexto: qué tan grave es lo que atiende, y cuántas veces
  // esta persona ya hizo este mismo trabajo antes. Ver server/objectives/points.ts.
  const severity = obj.needId ? await needSeverity(obj.needId, orgId) : null;
  const repetitions = obj.needId ? await countRepetitions(employeeId, orgId, obj.needId, obj.id) : 0;

  const points = scoreObjective({
    impactWeight: obj.impactWeight,
    kind: obj.kind === "ipa" ? "ipa" : "non_ipa",
    needSeverity: severity,
    repetitions,
  });

  // Un IPA realiza el ingreso; el trabajo indirecto que lo hizo posible cobra aquí su parte. Se
  // resuelve antes de abrir la transacción porque es una lectura sobre filas ya completadas.
  const enablers =
    obj.kind === "ipa" && obj.needId ? await findEnablers(orgId, obj.needId) : [];
  const share = enablementPoints(points, enablers.length);

  return db.transaction(async (tx) => {
    // Update condicionado al status leído arriba: si otra transacción concurrente ya lo completó,
    // esta fila no matchea y `updated` sale vacío — la doble inserción en el ledger queda cerrada
    // por la base de datos, no solo por el chequeo de arriba.
    const [updated] = await tx
      .update(objective)
      .set({
        status: "completed",
        completedAt: new Date(),
        evidenceValue: evidencia.value,
        evidenceSubmittedAt: evidencia.value === null ? null : new Date(),
      })
      .where(and(eq(objective.id, objectiveId), eq(objective.status, obj.status)))
      .returning();
    if (!updated) {
      return {
        ok: false as const,
        error: { code: "VALIDATION_ERROR" as const, message: "El objetivo ya está completado." },
      };
    }

    await tx.insert(employeePointsLedger).values({
      employeeId,
      objectiveId: updated.id,
      orgId,
      points,
    });

    // Las filas de habilitación apuntan al IPA que las disparó, no al objetivo viejo de cada quien:
    // es lo que hace rastreable de dónde salió ese pago. El ledger no tiene unicidad por
    // (empleado, objetivo) justamente porque una persona puede haber habilitado con varios.
    if (share > 0) {
      await tx.insert(employeePointsLedger).values(
        enablers.map((e) => ({
          employeeId: e.employeeId,
          objectiveId: updated.id,
          orgId,
          points: share,
        })),
      );
    }

    return {
      ok: true as const,
      data: { objective: updated, points, enablementShare: share, enablers: enablers.length },
    };
  });
}

/**
 * Cuántas veces esta persona ya completó trabajo de ESTA misma necesidad. Es "el volumen de esa
 * tarea": lo que convierte trabajo suelto en un sistema y lo que la fórmula premia.
 */
async function countRepetitions(
  employeeId: string,
  orgId: string,
  needId: string,
  exceptId: string,
): Promise<number> {
  const rows = await db
    .select({ id: objective.id })
    .from(objective)
    .where(
      and(
        eq(objective.orgId, orgId),
        eq(objective.needId, needId),
        eq(objective.assignedEmployeeId, employeeId),
        eq(objective.status, "completed"),
      ),
    );
  return rows.filter((r) => r.id !== exceptId).length;
}

/**
 * Quiénes habilitaron este ingreso: las personas con trabajo non-IPA ya completado sobre la misma
 * necesidad. Una persona aparece una sola vez aunque haya hecho tres — cobra por haber habilitado,
 * no por cuántas veces (la repetición ya se le pagó en cada uno de esos objetivos).
 */
async function findEnablers(orgId: string, needId: string): Promise<{ employeeId: string }[]> {
  const rows = await db
    .select({ employeeId: objective.assignedEmployeeId })
    .from(objective)
    .where(
      and(
        eq(objective.orgId, orgId),
        eq(objective.needId, needId),
        eq(objective.kind, "non_ipa"),
        eq(objective.status, "completed"),
      ),
    );

  const vistos = new Set<string>();
  const enablers: { employeeId: string }[] = [];
  for (const row of rows) {
    if (!row.employeeId || vistos.has(row.employeeId)) continue;
    vistos.add(row.employeeId);
    enablers.push({ employeeId: row.employeeId });
  }
  return enablers;
}
