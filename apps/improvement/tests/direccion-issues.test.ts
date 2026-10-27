// El motor de Issues (IDS sobre org_need) contra el Supabase de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, objective, orgNeed, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import {
  createIssue,
  createTodoFromIssue,
  listIssues,
  moveIssue,
  setIssueOwner,
  setIssuePriority,
} from "../server/direccion/issues/issues.ts";
import { listNeeds, referNeedToSummum } from "../server/needs/mutations.ts";

const NOW = new Date("2026-10-21T18:00:00Z"); // semana del 2026-10-19

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-issues", slug: `t-issues-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId: string, role: "owner" | "employee", grants?: Record<string, string>) {
  let permissionTypeId: string | null = null;
  if (grants) {
    const [pt] = await db.insert(permissionType).values({ orgId, name: "t", grants }).returning();
    permissionTypeId = pt?.id ?? null;
  }
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, permissionTypeId, acceptedAt: new Date() });
  return id;
}

async function issue(owner: string, orgId: string, ownerProfileId: string | null = null, title = "Se pierden clientes") {
  const res = await createIssue(owner, orgId, { title, detail: "Detalle", areaId: null, severity: 3, ownerProfileId });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

const statusOf = async (id: string) => (await db.select().from(orgNeed).where(eq(orgNeed.id, id)))[0];

describe("moveIssue", () => {
  it("WHEN un issue recorre abierta → en_progreso → resuelta THE SYSTEM SHALL guardar cada estado", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const id = await issue(owner, o);
    expect(await moveIssue(owner, o, id, "en_progreso")).toEqual({ ok: true, data: true });
    expect((await statusOf(id))?.status).toBe("en_progreso");
    expect(await moveIssue(owner, o, id, "resuelta")).toEqual({ ok: true, data: true });
    expect((await statusOf(id))?.status).toBe("resuelta");
  });

  it("WHEN se salta de abierta a resuelta o se mueve un derivado THE SYSTEM SHALL devolver INVALID_TRANSITION", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const id = await issue(owner, o);
    expect(await moveIssue(owner, o, id, "resuelta")).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect((await statusOf(id))?.status).toBe("abierta");

    await referNeedToSummum(owner, o, id, null);
    expect(await moveIssue(owner, o, id, "abierta")).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect((await statusOf(id))?.status).toBe("derivada");
  });

  it('WHEN un empleado con {"issues":"propio"} mueve THE SYSTEM SHALL dejarlo solo en los suyos', async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee", { issues: "propio" });
    const theirs = await issue(owner, o, owner);
    const mine = await issue(owner, o, emp, "Llegamos tarde");
    expect(await moveIssue(emp, o, theirs, "en_progreso")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await moveIssue(emp, o, mine, "en_progreso")).toEqual({ ok: true, data: true });

    const view = await listIssues(emp, o, NOW);
    expect(view.issues.map((i) => i.id)).toEqual([mine]);
    expect(view.canManage).toBe(false);
  });

  it("WHEN un empleado sin la sección lista THE SYSTEM SHALL devolver issues vacíos", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee");
    await issue(owner, o);
    expect((await listIssues(emp, o, NOW)).issues).toEqual([]);
  });
});

describe("prioridad, responsable y pendientes", () => {
  it("WHEN setIssuePriority corre con true y luego false THE SYSTEM SHALL fijar y quitar la semana", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const other = await issue(owner, o, null, "Otro issue");
    const id = await issue(owner, o);

    expect(await setIssuePriority(owner, o, id, true, NOW)).toEqual({ ok: true, data: true });
    expect((await statusOf(id))?.priorityWeek).toBe("2026-10-19");
    const view = await listIssues(owner, o, NOW);
    expect(view.issues[0]).toMatchObject({ id, onPriorityList: true });
    expect(view.issues.find((i) => i.id === other)?.onPriorityList).toBe(false);

    await setIssuePriority(owner, o, id, false, NOW);
    expect((await statusOf(id))?.priorityWeek).toBeNull();
  });

  it("WHEN se asigna un responsable de otro org THE SYSTEM SHALL devolver NOT_FOUND", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const id = await issue(owner, o);
    const stranger = await person(await org(), "owner");
    expect(await setIssueOwner(owner, o, id, stranger)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await setIssueOwner(owner, o, id, owner)).toEqual({ ok: true, data: true });
    expect((await statusOf(id))?.ownerProfileId).toBe(owner);
  });

  it("WHEN el dueño crea un pendiente desde un issue THE SYSTEM SHALL crear un objective con need_id, y un empleado SHALL recibir FORBIDDEN", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee", { issues: "empresa" });
    const id = await issue(owner, o);
    const todo = { title: "Llamar a los clientes perdidos", assignedEmployeeId: emp, dueDate: "2026-10-30", impactWeight: 10 };

    expect(await createTodoFromIssue(emp, o, id, todo)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await db.select().from(objective).where(eq(objective.needId, id))).toHaveLength(0);

    const res = await createTodoFromIssue(owner, o, id, todo);
    expect(res.ok).toBe(true);
    const created = await db.select().from(objective).where(eq(objective.needId, id));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: "pending", needId: id, kind: "non_ipa" });
  });

  it("WHEN un issue de Dirección se deriva a Summum THE SYSTEM SHALL seguir apareciendo igual en listNeeds", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const id = await issue(owner, o);
    expect(await referNeedToSummum(owner, o, id, "Necesitamos un experto")).toEqual({ ok: true, data: true });

    const row = await statusOf(id);
    expect(row?.status).toBe("derivada");
    expect(row?.referredAt).not.toBeNull();
    const need = (await listNeeds(owner, o)).find((n) => n.id === id);
    expect(need).toMatchObject({ title: "Se pierden clientes", detail: "Detalle", severity: 3, source: "dueno" });
    expect((await listIssues(owner, o, NOW)).issues).toEqual([]);
  });
});
