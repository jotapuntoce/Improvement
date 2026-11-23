// La bandeja y el ciclo de una tarea contra el Supabase de desarrollo: quién apunta a quién, que los
// objetivos pendientes aparezcan junto a las tareas, y que solo los objetivos paguen puntos.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { employeePointsLedger, membership, organization, profile, recordActivity } from "@jotapuntoce/db/schema";
import { createCustomApp } from "../server/apps/custom.ts";
import { createRecord } from "../server/apps/records.ts";
import { createObjective } from "../server/objectives/mutations.ts";
import { closeTask, createTask, discardTask, getTask, listInbox } from "../server/tasks/inbox.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-inbox", slug: `t-inbox-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return { orgId: o!.id, owner: await person(o!.id, "owner"), ana: await person(o!.id, "employee"), luis: await person(o!.id, "employee") };
}
async function objectiveFor(orgId: string, owner: string, assignee: string, evidenceType: "ninguna" | "nota", dueDate = new Date(Date.now() + 86_400_000)) {
  const r = await createObjective(owner, orgId, { title: "Cerrar 3 ventas", description: null, impactWeight: 50, dueDate, areaId: null, assignedEmployeeId: assignee, needId: null, kind: "non_ipa", evidenceType });
  if (!r.ok) throw new Error(r.error.message);
  return r.data.id;
}
const ids = (r: Awaited<ReturnType<typeof listInbox>>) => (r.ok ? r.data.map((i) => i.title) : []);

describe("bandeja", () => {
  it("WHEN un empleado se apunta una tarea THE SYSTEM SHALL ponerla solo en su bandeja como propia", async () => {
    const { orgId, ana, luis } = await setup();
    expect((await createTask(ana, orgId, { title: "Llamar a proveedor" })).ok).toBe(true);
    const mine = await listInbox(ana, orgId);
    expect(mine.ok && mine.data.map((i) => [i.title, i.source])).toEqual([["Llamar a proveedor", "propia"]]);
    expect(ids(await listInbox(luis, orgId))).toEqual([]);
  });

  it("WHEN un empleado intenta asignarle trabajo a otro THE SYSTEM SHALL negarlo, y el dueño sí puede", async () => {
    const { orgId, owner, ana, luis } = await setup();
    expect(await createTask(ana, orgId, { title: "Haz esto", assigneeId: luis })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await createTask(owner, orgId, { title: "Haz esto", assigneeId: luis })).ok).toBe(true);
    const r = await listInbox(luis, orgId);
    expect(r.ok && r.data[0]).toMatchObject({ title: "Haz esto", source: "dueno" });
    const otra = await setup();
    expect(await createTask(owner, orgId, { title: "x", assigneeId: otra.ana })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("WHEN la persona tiene un objetivo pendiente THE SYSTEM SHALL mostrarlo junto a sus tareas, lo vencido primero", async () => {
    const { orgId, owner, ana } = await setup();
    await createTask(ana, orgId, { title: "Sin fecha" });
    await createTask(ana, orgId, { title: "Mañana", dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    await objectiveFor(orgId, owner, ana, "ninguna", new Date(Date.now() - 86_400_000));
    const r = await listInbox(ana, orgId);
    expect(r.ok && r.data.map((i) => [i.title, i.kind, i.overdue])).toEqual([
      ["Cerrar 3 ventas", "objetivo", true],
      ["Mañana", "tarea", false],
      ["Sin fecha", "tarea", false],
    ]);
  });

  it("WHEN cierra una tarea ligada a un objetivo THE SYSTEM SHALL completarlo y pagar; sin la evidencia, la tarea sigue abierta", async () => {
    const { orgId, owner, ana } = await setup();
    const objectiveId = await objectiveFor(orgId, owner, ana, "nota");
    const t = await createTask(owner, orgId, { title: "Ventas", assigneeId: ana, objectiveId });
    if (!t.ok) throw new Error(t.error.message);
    expect((await closeTask(ana, orgId, t.data.id)).ok).toBe(false);
    expect((await getTask(ana, orgId, t.data.id)).ok && (await getTask(ana, orgId, t.data.id))).toMatchObject({ data: { status: "abierta" } });
    const done = await closeTask(ana, orgId, t.data.id, "Cerré con Pérez, Gómez y Ruiz");
    expect(done.ok && done.data.points).toBeGreaterThan(0);
    expect(ids(await listInbox(ana, orgId))).toEqual([]);
  });

  it("WHEN cierra una tarea propia con registro THE SYSTEM SHALL no pagar puntos y dejarlo en la bitácora", async () => {
    const { orgId, owner, ana } = await setup();
    const app = await createCustomApp(owner, orgId, { name: "Pacientes", groupName: "Operación", stages: ["Nuevo"] });
    if (!app.ok) throw new Error(app.error.message);
    const rec = await createRecord(owner, orgId, app.data.key, "Firulais");
    if (!rec.ok) throw new Error(rec.error.message);
    const t = await createTask(owner, orgId, { title: "Vacunar", appKey: app.data.key, recordId: rec.data.id });
    if (!t.ok) throw new Error(t.error.message);
    expect(await closeTask(owner, orgId, t.data.id)).toEqual({ ok: true, data: { points: null } });
    expect(await db.select().from(employeePointsLedger).where(eq(employeePointsLedger.orgId, orgId))).toEqual([]);
    const log = await db.select({ body: recordActivity.body }).from(recordActivity).where(eq(recordActivity.recordId, rec.data.id));
    expect(log.map((l) => l.body)).toContain("Tarea cerrada: Vacunar");
  });

  it("WHEN alguien más pide o descarta una tarea ajena THE SYSTEM SHALL responder NOT_FOUND; el dueño sí la ve", async () => {
    const { orgId, owner, ana, luis } = await setup();
    const t = await createTask(ana, orgId, { title: "Mía" });
    if (!t.ok) throw new Error(t.error.message);
    expect(await getTask(luis, orgId, t.data.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await discardTask(luis, orgId, t.data.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await closeTask(owner, orgId, t.data.id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await getTask(owner, orgId, t.data.id)).ok).toBe(true);
    expect((await discardTask(ana, orgId, t.data.id)).ok).toBe(true);
    expect(ids(await listInbox(ana, orgId))).toEqual([]);
  });
});
