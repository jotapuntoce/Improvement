// Issues de Dirección: filas de org_need, sin tabla nueva. `status` ES el flujo IDS — abierta
// (Identificar) → en_progreso (Discutir) → resuelta (Resolver). `derivada` es de Summum y queda fuera.
//
// Crear un issue pasa por createNeed() y un pendiente por createObjective(): no se duplica ningún
// insert ni fórmula de puntos (.claude/rules/direccion.md). server/needs y server/objectives no se editan.
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, orgNeed, profile } from "@jotapuntoce/db/schema";
import { findMembership, findOwnerMembership, resolveSection } from "../../auth/guard.ts";
import { createNeed } from "../../needs/mutations.ts";
import { createObjective } from "../../objectives/mutations.ts";
import { weekStart } from "../scorecard/week.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export const ISSUE_TRANSITIONS: Record<string, readonly string[]> = {
  abierta: ["en_progreso"],
  en_progreso: ["abierta", "resuelta"],
  resuelta: [],
  derivada: [],
};

export interface IssueRow {
  id: string;
  title: string;
  detail: string | null;
  severity: number;
  status: string;
  areaId: string | null;
  areaName: string | null;
  ownerProfileId: string | null;
  ownerName: string | null;
  priorityWeek: string | null;
  onPriorityList: boolean;
}

export interface IssuesView {
  currentWeek: string;
  issues: IssueRow[];
  canManage: boolean;
  canCreate: boolean;
}

export async function listIssues(userId: string, orgId: string, now = new Date()): Promise<IssuesView> {
  const { membership, scope } = await resolveSection(userId, orgId, "issues");
  const currentWeek = weekStart(now);
  const isOwner = membership.role === "owner";
  if (scope === "ninguno") return { currentWeek, issues: [], canManage: false, canCreate: false };

  const rows = await db
    .select({ need: orgNeed, areaName: area.name, fullName: profile.fullName, email: profile.email })
    .from(orgNeed)
    .leftJoin(area, eq(area.id, orgNeed.areaId))
    .leftJoin(profile, eq(profile.id, orgNeed.ownerProfileId))
    .where(
      and(
        eq(orgNeed.orgId, orgId),
        ne(orgNeed.status, "derivada"),
        scope === "propio" ? eq(orgNeed.ownerProfileId, userId) : undefined,
      ),
    )
    .orderBy(desc(orgNeed.severity), desc(orgNeed.createdAt));

  const issues = rows.map(({ need, areaName, fullName, email }) => ({
    id: need.id,
    title: need.title,
    detail: need.detail,
    severity: need.severity,
    status: need.status,
    areaId: need.areaId,
    areaName,
    ownerProfileId: need.ownerProfileId,
    ownerName: fullName ?? email,
    priorityWeek: need.priorityWeek,
    onPriorityList: need.priorityWeek === currentWeek,
  }));
  // Estable: dentro de cada grupo se queda el orden por severidad de la consulta.
  issues.sort((a, b) => Number(b.onPriorityList) - Number(a.onPriorityList));

  return { currentWeek, issues, canManage: isOwner || scope === "empresa", canCreate: isOwner };
}

/** El issue de ESTE org, o null. Toda escritura de abajo empieza aquí: el id llega del navegador. */
async function findIssue(orgId: string, issueId: string) {
  if (!z.uuid().safeParse(issueId).success) return null;
  const [row] = await db
    .select({ id: orgNeed.id, status: orgNeed.status, areaId: orgNeed.areaId, ownerProfileId: orgNeed.ownerProfileId })
    .from(orgNeed)
    .where(and(eq(orgNeed.id, issueId), eq(orgNeed.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

/** Dueño o alcance `empresa`: los únicos que reparten responsables y arman la lista de la semana. */
async function canManage(userId: string, orgId: string): Promise<boolean> {
  const { membership, scope } = await resolveSection(userId, orgId, "issues");
  return membership.role === "owner" || scope === "empresa";
}

// Solo la forma y el responsable: título, detalle, área y severidad los valida createNeed.
const issueSchema = z.object({
  title: z.unknown(),
  detail: z.unknown(),
  areaId: z.unknown(),
  severity: z.unknown(),
  ownerProfileId: z.uuid().nullable().optional(),
});

export async function createIssue(userId: string, orgId: string, input: unknown): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño crea issues.", "FORBIDDEN");
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return fail("El responsable no es válido.");
  const { ownerProfileId, ...need } = parsed.data;
  if (ownerProfileId && !(await findMembership(ownerProfileId, orgId))) {
    return fail("El responsable no es parte de esta empresa.", "NOT_FOUND");
  }

  const created = await createNeed(userId, orgId, { ...need, source: "dueno" });
  if (!created.ok) return created;
  if (ownerProfileId) {
    await db
      .update(orgNeed)
      .set({ ownerProfileId, updatedAt: new Date() })
      .where(and(eq(orgNeed.id, created.data.id), eq(orgNeed.orgId, orgId)));
  }
  return { ok: true, data: { id: created.data.id } };
}

export async function setIssueOwner(
  userId: string,
  orgId: string,
  issueId: string,
  ownerProfileId: string | null,
): Promise<Result<true>> {
  if (!(await canManage(userId, orgId))) return fail("No puedes asignar issues.", "FORBIDDEN");
  if (!(await findIssue(orgId, issueId))) return fail("Ese issue no existe.", "NOT_FOUND");
  if (ownerProfileId && !(z.uuid().safeParse(ownerProfileId).success && (await findMembership(ownerProfileId, orgId)))) {
    return fail("El responsable no es parte de esta empresa.", "NOT_FOUND");
  }
  await db
    .update(orgNeed)
    .set({ ownerProfileId, updatedAt: new Date() })
    .where(and(eq(orgNeed.id, issueId), eq(orgNeed.orgId, orgId)));
  return { ok: true, data: true };
}

export async function setIssuePriority(
  userId: string,
  orgId: string,
  issueId: string,
  onList: boolean,
  now = new Date(),
): Promise<Result<true>> {
  if (!(await canManage(userId, orgId))) return fail("No puedes armar la lista de la semana.", "FORBIDDEN");
  if (!(await findIssue(orgId, issueId))) return fail("Ese issue no existe.", "NOT_FOUND");
  await db
    .update(orgNeed)
    .set({ priorityWeek: onList ? weekStart(now) : null, updatedAt: new Date() })
    .where(and(eq(orgNeed.id, issueId), eq(orgNeed.orgId, orgId)));
  return { ok: true, data: true };
}

export async function moveIssue(userId: string, orgId: string, issueId: string, to: unknown): Promise<Result<true>> {
  const target = z.enum(["abierta", "en_progreso", "resuelta"]).safeParse(to);
  if (!target.success) return fail("Ese estado no existe.");
  const { scope } = await resolveSection(userId, orgId, "issues");
  if (scope === "ninguno") return fail("No tienes acceso a issues.", "FORBIDDEN");

  const issue = await findIssue(orgId, issueId);
  if (!issue) return fail("Ese issue no existe.", "NOT_FOUND");
  if (scope === "propio" && issue.ownerProfileId !== userId) {
    return fail("Solo el responsable mueve este issue.", "FORBIDDEN");
  }
  if (!ISSUE_TRANSITIONS[issue.status]?.includes(target.data)) {
    return fail("Ese issue no puede pasar a ese estado.", "INVALID_TRANSITION");
  }

  await db
    .update(orgNeed)
    .set({ status: target.data, updatedAt: new Date() })
    .where(and(eq(orgNeed.id, issueId), eq(orgNeed.orgId, orgId)));
  return { ok: true, data: true };
}

// Solo la forma: título, fecha y peso los valida createObjective, que es su dueño.
const todoSchema = z.object({
  title: z.unknown(),
  assignedEmployeeId: z.uuid().nullable(),
  dueDate: z.unknown(),
  impactWeight: z.unknown(),
});

/** Un pendiente nacido de un issue. Quién puede lo decide createObjective() — hoy, solo el dueño. */
export async function createTodoFromIssue(
  userId: string,
  orgId: string,
  issueId: string,
  input: unknown,
): Promise<Result<{ objectiveId: string }>> {
  const parsed = todoSchema.safeParse(input);
  if (!parsed.success) return fail("Faltan datos del pendiente.");
  const issue = await findIssue(orgId, issueId);
  if (!issue) return fail("Ese issue no existe.", "NOT_FOUND");

  const created = await createObjective(userId, orgId, {
    ...parsed.data,
    description: null,
    areaId: issue.areaId,
    needId: issue.id,
    kind: "non_ipa",
    evidenceType: "ninguna",
  });
  if (!created.ok) return created;
  return { ok: true, data: { objectiveId: created.data.id } };
}
