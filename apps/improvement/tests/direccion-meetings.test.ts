// La junta L10: la agenda (pura) y el motor contra el Supabase de desarrollo, con `now` inyectado.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { meeting, meetingRating, membership, objective, organization, profile } from "@jotapuntoce/db/schema";
import { AGENDA, AGENDA_TOTAL_MINUTES, nextBlock } from "../server/direccion/meetings/agenda.ts";
import {
  addMeetingTodo,
  advanceBlock,
  closeMeeting,
  createMeeting,
  isMeetingPending,
  listMeetings,
  loadMeetingView,
  rateMeeting,
  startMeeting,
} from "../server/direccion/meetings/meetings.ts";
import { createIssue } from "../server/direccion/issues/issues.ts";
import { createMeasurable, enterValue } from "../server/direccion/scorecard/measurables.ts";
import { createObjective } from "../server/objectives/mutations.ts";

const NOW = new Date("2026-10-21T18:00:00Z"); // miércoles; semana del 2026-10-19
const THIS_WEEK = "2026-10-19";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-junta", slug: `t-junta-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}

/** Una junta creada e iniciada por el dueño. */
async function started(owner: string, orgId: string) {
  const created = await createMeeting(owner, orgId, { scheduledFor: "2026-10-21T09:00" });
  if (!created.ok) throw new Error(created.error.message);
  await startMeeting(owner, orgId, created.data.id, NOW);
  return created.data.id;
}

async function toConclude(owner: string, orgId: string, id: string) {
  for (let i = 0; i < 6; i++) await advanceBlock(owner, orgId, id);
}

const meetingRow = async (id: string) => (await db.select().from(meeting).where(eq(meeting.id, id)))[0];

describe("agenda", () => {
  it("WHEN se lee AGENDA THE SYSTEM SHALL tener los siete bloques en orden y 90 minutos", () => {
    expect(AGENDA.map((b) => b.block)).toEqual(["segue", "scorecard", "rocks", "headlines", "todos", "ids", "conclude"]);
    expect(AGENDA.map((b) => b.minutes)).toEqual([5, 5, 5, 5, 5, 60, 5]);
    expect(AGENDA_TOTAL_MINUTES).toBe(90);
    expect(nextBlock("segue")).toBe("scorecard");
    expect(nextBlock("conclude")).toBeNull();
  });
});

describe("crear, iniciar y avanzar", () => {
  it("WHEN un empleado sin la sección crea una junta THE SYSTEM SHALL devolver FORBIDDEN", async () => {
    const o = await org();
    const emp = await person(o, "employee");
    expect(await createMeeting(emp, o, { scheduledFor: "2026-10-21T09:00" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("WHEN el dueño avanza seis veces THE SYSTEM SHALL quedar en conclude y la séptima SHALL dar LAST_BLOCK", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const created = await createMeeting(owner, o, { scheduledFor: "2026-10-21T09:00" });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.data.id;
    expect((await meetingRow(id))?.scheduledFor.toISOString()).toBe("2026-10-21T15:00:00.000Z");

    expect(await advanceBlock(owner, o, id)).toMatchObject({ ok: false, error: { code: "NOT_STARTED" } });
    await startMeeting(owner, o, id, NOW);
    expect(await startMeeting(owner, o, id, NOW)).toMatchObject({ ok: false, error: { code: "ALREADY_STARTED" } });
    await toConclude(owner, o, id);
    expect((await meetingRow(id))?.currentBlock).toBe("conclude");
    expect(await advanceBlock(owner, o, id)).toMatchObject({ ok: false, error: { code: "LAST_BLOCK" } });
  });
});

describe("calificar y cerrar", () => {
  it("WHEN se cierra sin calificaciones o antes de conclude THE SYSTEM SHALL dar NOT_READY, y con 8 y 10 SHALL promediar 9", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee");
    const id = await started(owner, o);

    await rateMeeting(owner, o, id, owner, 8);
    expect(await closeMeeting(owner, o, id, NOW)).toMatchObject({ ok: false, error: { code: "NOT_READY" } });
    await db.delete(meetingRating).where(eq(meetingRating.meetingId, id));
    await toConclude(owner, o, id);
    expect(await closeMeeting(owner, o, id, NOW)).toMatchObject({ ok: false, error: { code: "NOT_READY" } });
    expect((await meetingRow(id))?.endedAt).toBeNull();

    await rateMeeting(owner, o, id, owner, 8);
    await rateMeeting(owner, o, id, emp, 10);
    expect(await closeMeeting(owner, o, id, NOW)).toEqual({ ok: true, data: { averageRating: 9 } });
    expect((await meetingRow(id))?.endedAt).not.toBeNull();
    expect((await listMeetings(owner, o))[0]?.averageRating).toBe(9);
  });

  it("WHEN la calificación es 0, 11 o de otro org THE SYSTEM SHALL rechazarla, y dos veces la misma persona SHALL dejar una fila", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const stranger = await person(await org(), "owner");
    const id = await started(owner, o);

    expect(await rateMeeting(owner, o, id, owner, 0)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await rateMeeting(owner, o, id, owner, 11)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await rateMeeting(owner, o, id, stranger, 7)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.select().from(meetingRating).where(eq(meetingRating.meetingId, id))).toHaveLength(0);

    await rateMeeting(owner, o, id, owner, 6);
    await rateMeeting(owner, o, id, owner, 9);
    const rows = await db.select().from(meetingRating).where(eq(meetingRating.meetingId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rating).toBe(9);
  });
});

describe("pendientes, vista y junta pendiente", () => {
  it("WHEN se agrega un pendiente con issueId THE SYSTEM SHALL crear un objective con ese need_id, y la vista SHALL traer scorecard, objetivos e issues", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const id = await started(owner, o);

    const m = await createMeasurable(owner, o, { title: "Ventas cerradas", ownerProfileId: owner, goal: 10, goalDirection: "gte", unit: "numero" });
    if (!m.ok) throw new Error(m.error.message);
    await enterValue(owner, o, m.data.id, { weekStart: THIS_WEEK, value: 12 }, NOW);
    const issue = await createIssue(owner, o, { title: "Se pierden clientes", detail: null, areaId: null, severity: 2 });
    if (!issue.ok) throw new Error(issue.error.message);
    const rock = await createObjective(owner, o, {
      title: "Abrir sucursal", description: null, impactWeight: 50, dueDate: "2026-12-31", areaId: null,
      assignedEmployeeId: owner, needId: null, kind: "ipa", evidenceType: "ninguna",
    });
    if (!rock.ok) throw new Error(rock.error.message);

    const todo = await addMeetingTodo(owner, o, id, {
      title: "Llamar a los clientes perdidos", assignedEmployeeId: owner, dueDate: "2026-10-23", impactWeight: 10, issueId: issue.data.id,
    });
    expect(todo.ok).toBe(true);
    expect(await db.select().from(objective).where(eq(objective.needId, issue.data.id))).toHaveLength(1);

    const view = await loadMeetingView(owner, o, id, NOW);
    expect(view?.scorecard.rows[0]?.values[THIS_WEEK]).toEqual({ value: 12, onTrack: true });
    expect(view?.todos.map((t) => t.title)).toEqual(["Llamar a los clientes perdidos"]);
    expect(view?.rocks.map((r) => r.title)).toEqual(["Abrir sucursal"]);
    expect(view?.issues.map((i) => i.id)).toEqual([issue.data.id]);
    expect(await loadMeetingView(owner, o, crypto.randomUUID(), NOW)).toBeNull();
  });

  it("WHEN no hay junta cerrada esta semana THE SYSTEM SHALL marcarla pendiente, y con una cerrada esta semana SHALL no", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    expect(await isMeetingPending(owner, o, NOW)).toBe(true);

    await db.insert(meeting).values({
      orgId: o, scheduledFor: new Date("2026-10-12T15:00:00Z"), startedAt: new Date("2026-10-12T15:00:00Z"),
      endedAt: new Date("2026-10-12T16:30:00Z"), currentBlock: "conclude",
    });
    expect(await isMeetingPending(owner, o, NOW)).toBe(true);

    await db.insert(meeting).values({
      orgId: o, scheduledFor: new Date("2026-10-20T15:00:00Z"), startedAt: new Date("2026-10-20T15:00:00Z"),
      endedAt: new Date("2026-10-20T16:30:00Z"), currentBlock: "conclude",
    });
    expect(await isMeetingPending(owner, o, NOW)).toBe(false);

    const emp = await person(o, "employee");
    expect(await isMeetingPending(emp, o, NOW)).toBe(false);
  });
});
