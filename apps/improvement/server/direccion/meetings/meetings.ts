// La junta semanal L10: se crea, se inicia, se recorre bloque por bloque, se califica y se cierra.
//
// Quien tenga la sección `junta` la maneja; un solo dispositivo lleva la pantalla, sin tiempo real
// (.claude/rules/direccion.md). Los pendientes salen de createTodoFromIssue / createObjective, el
// scorecard de listScorecard y los issues de listIssues: aquí no se repite ninguna de esas consultas.
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { MEETING_BLOCKS, meeting, meetingRating, profile } from "@jotapuntoce/db/schema";
import { findMembership, resolveSection } from "../../auth/guard.ts";
import { createObjective, listObjectives } from "../../objectives/mutations.ts";
import { createTodoFromIssue, listIssues, type IssueRow } from "../issues/issues.ts";
import { listScorecard, type ScorecardView } from "../scorecard/measurables.ts";
import { weekStart } from "../scorecard/week.ts";
import { AGENDA, nextBlock, type MeetingBlock } from "./agenda.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

type MeetingRow = typeof meeting.$inferSelect;
type ObjectiveRow = Awaited<ReturnType<typeof listObjectives>>["data"]["objectives"][number];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MeetingSummary {
  id: string;
  scheduledFor: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  currentBlock: MeetingBlock | null;
  averageRating: number | null;
}

export interface MeetingView {
  meeting: MeetingRow;
  agenda: typeof AGENDA;
  scorecard: ScorecardView;
  rocks: ObjectiveRow[];
  todos: ObjectiveRow[];
  issues: IssueRow[];
  ratings: { profileId: string; name: string; rating: number }[];
  averageRating: number | null;
}

function average(ratings: number[]): number | null {
  if (!ratings.length) return null;
  return Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10;
}

/** ¿Puede esta persona llevar la junta? Toda función de abajo empieza aquí. */
async function canRun(userId: string, orgId: string): Promise<boolean> {
  return (await resolveSection(userId, orgId, "junta")).scope !== "ninguno";
}

/** La junta de ESTE org, o null. El id llega del navegador. */
async function findMeeting(orgId: string, meetingId: string): Promise<MeetingRow | null> {
  if (!z.uuid().safeParse(meetingId).success) return null;
  const [row] = await db
    .select()
    .from(meeting)
    .where(and(eq(meeting.id, meetingId), eq(meeting.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function listMeetings(userId: string, orgId: string): Promise<MeetingSummary[]> {
  if (!(await canRun(userId, orgId))) return [];
  const rows = await db
    .select()
    .from(meeting)
    .where(eq(meeting.orgId, orgId))
    .orderBy(desc(meeting.scheduledFor))
    .limit(10);
  const ids = rows.map((r) => r.id);
  const ratings = ids.length
    ? await db.select().from(meetingRating).where(inArray(meetingRating.meetingId, ids))
    : [];
  return rows.map((r) => ({
    id: r.id,
    scheduledFor: r.scheduledFor,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    currentBlock: r.currentBlock,
    averageRating: average(ratings.filter((x) => x.meetingId === r.id).map((x) => x.rating)),
  }));
}

const createSchema = z.object({
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Elige fecha y hora de la junta."),
});

export async function createMeeting(userId: string, orgId: string, input: unknown): Promise<Result<{ id: string }>> {
  if (!(await canRun(userId, orgId))) return fail("No tienes acceso a la junta.", "FORBIDDEN");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa la fecha.");
  // ponytail: Ciudad de México fija (sin horario de verano desde 2022); zona por org cuando llegue otro huso
  const scheduledFor = new Date(`${parsed.data.scheduledFor}:00-06:00`);
  if (Number.isNaN(scheduledFor.getTime())) return fail("Esa fecha no existe.");

  const [row] = await db
    .insert(meeting)
    .values({ orgId, scheduledFor, facilitatorProfileId: userId, createdBy: userId })
    .returning({ id: meeting.id });
  if (!row) return fail("No se pudo crear la junta.", "DB_ERROR");
  return { ok: true, data: { id: row.id } };
}

export async function startMeeting(userId: string, orgId: string, meetingId: string, now = new Date()): Promise<Result<true>> {
  if (!(await canRun(userId, orgId))) return fail("No tienes acceso a la junta.", "FORBIDDEN");
  const m = await findMeeting(orgId, meetingId);
  if (!m) return fail("Esa junta no existe.", "NOT_FOUND");
  if (m.startedAt) return fail("La junta ya empezó.", "ALREADY_STARTED");
  await db
    .update(meeting)
    .set({ startedAt: now, currentBlock: "segue", updatedAt: new Date() })
    .where(and(eq(meeting.id, m.id), eq(meeting.orgId, orgId)));
  return { ok: true, data: true };
}

export async function advanceBlock(
  userId: string,
  orgId: string,
  meetingId: string,
): Promise<Result<{ currentBlock: MeetingBlock }>> {
  if (!(await canRun(userId, orgId))) return fail("No tienes acceso a la junta.", "FORBIDDEN");
  const m = await findMeeting(orgId, meetingId);
  if (!m) return fail("Esa junta no existe.", "NOT_FOUND");
  if (!m.startedAt || !m.currentBlock) return fail("La junta no ha empezado.", "NOT_STARTED");
  if (m.endedAt) return fail("La junta ya terminó.", "ALREADY_ENDED");
  const next = nextBlock(m.currentBlock);
  if (!next) return fail("Ya están en el último bloque.", "LAST_BLOCK");
  await db
    .update(meeting)
    .set({ currentBlock: next, updatedAt: new Date() })
    .where(and(eq(meeting.id, m.id), eq(meeting.orgId, orgId)));
  return { ok: true, data: { currentBlock: next } };
}

export async function saveBlockNotes(
  userId: string,
  orgId: string,
  meetingId: string,
  block: unknown,
  text: unknown,
): Promise<Result<true>> {
  if (!(await canRun(userId, orgId))) return fail("No tienes acceso a la junta.", "FORBIDDEN");
  const b = z.enum(MEETING_BLOCKS).safeParse(block);
  const t = z.string().max(4000, "Las notas no caben: máximo 4000 caracteres.").safeParse(text);
  if (!b.success) return fail("Ese bloque no existe.");
  if (!t.success) return fail(t.error.issues[0]?.message ?? "Revisa las notas.");
  const m = await findMeeting(orgId, meetingId);
  if (!m) return fail("Esa junta no existe.", "NOT_FOUND");
  if (m.endedAt) return fail("La junta ya terminó.", "ALREADY_ENDED");
  const notes = { ...(m.notes as Record<string, string>), [b.data]: t.data };
  await db
    .update(meeting)
    .set({ notes, updatedAt: new Date() })
    .where(and(eq(meeting.id, m.id), eq(meeting.orgId, orgId)));
  return { ok: true, data: true };
}

export async function rateMeeting(
  userId: string,
  orgId: string,
  meetingId: string,
  profileId: string,
  rating: unknown,
): Promise<Result<true>> {
  if (!(await canRun(userId, orgId))) return fail("No tienes acceso a la junta.", "FORBIDDEN");
  const r = z.coerce.number().int().min(1).max(10).safeParse(rating);
  if (!r.success) return fail("La calificación va del 1 al 10.");
  const m = await findMeeting(orgId, meetingId);
  if (!m) return fail("Esa junta no existe.", "NOT_FOUND");
  if (!z.uuid().safeParse(profileId).success || !(await findMembership(profileId, orgId))) {
    return fail("Esa persona no es de esta empresa.", "NOT_FOUND");
  }
  await db
    .insert(meetingRating)
    .values({ meetingId: m.id, profileId, rating: r.data })
    .onConflictDoUpdate({ target: [meetingRating.meetingId, meetingRating.profileId], set: { rating: r.data } });
  return { ok: true, data: true };
}

export async function closeMeeting(
  userId: string,
  orgId: string,
  meetingId: string,
  now = new Date(),
): Promise<Result<{ averageRating: number }>> {
  if (!(await canRun(userId, orgId))) return fail("No tienes acceso a la junta.", "FORBIDDEN");
  const m = await findMeeting(orgId, meetingId);
  if (!m) return fail("Esa junta no existe.", "NOT_FOUND");
  if (m.endedAt) return fail("La junta ya terminó.", "ALREADY_ENDED");
  if (!m.startedAt || m.currentBlock !== "conclude") return fail("La junta se cierra en el bloque de cierre.", "NOT_READY");
  const ratings = await db.select({ rating: meetingRating.rating }).from(meetingRating).where(eq(meetingRating.meetingId, m.id));
  const avg = average(ratings.map((x) => x.rating));
  if (avg === null) return fail("Califiquen la junta antes de cerrarla.", "NOT_READY");

  await db
    .update(meeting)
    .set({ endedAt: now, updatedAt: new Date() })
    .where(and(eq(meeting.id, m.id), eq(meeting.orgId, orgId)));
  return { ok: true, data: { averageRating: avg } };
}

const todoSchema = z.object({
  title: z.unknown(),
  assignedEmployeeId: z.uuid().nullable(),
  dueDate: z.unknown(),
  impactWeight: z.unknown(),
  issueId: z.uuid().nullable().optional(),
});

/** Un pendiente que sale de la junta: de un issue si lo trae, suelto si no. Lo decide createObjective. */
export async function addMeetingTodo(
  userId: string,
  orgId: string,
  meetingId: string,
  input: unknown,
): Promise<Result<{ objectiveId: string }>> {
  if (!(await canRun(userId, orgId))) return fail("No tienes acceso a la junta.", "FORBIDDEN");
  const parsed = todoSchema.safeParse(input);
  if (!parsed.success) return fail("Faltan datos del pendiente.");
  if (!(await findMeeting(orgId, meetingId))) return fail("Esa junta no existe.", "NOT_FOUND");

  const { issueId, ...todo } = parsed.data;
  if (issueId) return createTodoFromIssue(userId, orgId, issueId, todo);

  const created = await createObjective(userId, orgId, {
    ...todo,
    description: null,
    areaId: null,
    needId: null,
    kind: "non_ipa",
    evidenceType: "ninguna",
  });
  if (!created.ok) return created;
  return { ok: true, data: { objectiveId: created.data.id } };
}

export async function loadMeetingView(
  userId: string,
  orgId: string,
  meetingId: string,
  now = new Date(),
): Promise<MeetingView | null> {
  if (!(await canRun(userId, orgId))) return null;
  const m = await findMeeting(orgId, meetingId);
  if (!m) return null;

  // Cada lista respeta el alcance de la persona en SU sección: lo resuelven sus propias funciones.
  const [scorecard, objectives, issues, ratingRows] = await Promise.all([
    listScorecard(userId, orgId, now),
    listObjectives(userId, orgId, { limit: 100 }),
    listIssues(userId, orgId, now),
    db
      .select({ profileId: meetingRating.profileId, rating: meetingRating.rating, fullName: profile.fullName, email: profile.email })
      .from(meetingRating)
      .innerJoin(profile, eq(profile.id, meetingRating.profileId))
      .where(eq(meetingRating.meetingId, m.id)),
  ]);

  const open = objectives.data.objectives.filter((o) => o.status !== "completed");
  const horizon = now.getTime() + 7 * DAY_MS;
  const ratings = ratingRows.map((r) => ({ profileId: r.profileId, name: r.fullName ?? r.email, rating: r.rating }));

  return {
    meeting: m,
    agenda: AGENDA,
    scorecard,
    todos: open.filter((o) => o.dueDate.getTime() <= horizon),
    rocks: open.filter((o) => o.dueDate.getTime() > horizon),
    issues: issues.issues.filter((i) => i.status !== "resuelta"),
    ratings,
    averageRating: average(ratings.map((r) => r.rating)),
  };
}

/** ¿Falta la junta de esta semana? La recepción lo pregunta para poner su tarjeta. */
export async function isMeetingPending(userId: string, orgId: string, now = new Date()): Promise<boolean> {
  if (!(await canRun(userId, orgId))) return false;
  const [last] = await db
    .select({ endedAt: meeting.endedAt })
    .from(meeting)
    .where(and(eq(meeting.orgId, orgId), isNotNull(meeting.endedAt)))
    .orderBy(desc(meeting.endedAt))
    .limit(1);
  return !last?.endedAt || weekStart(last.endedAt) !== weekStart(now);
}
