// Postventa (ticket + server/erp/tickets.ts) contra el Supabase de desarrollo: checks de la base, motor
// y RLS (asUser simula el rol authenticated, como en tests/crm-schema.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, membership, organization, permissionType, profile, ticket } from "@jotapuntoce/db/schema";
import { listTickets, moveTicket, openTicket, rateTicket } from "../server/erp/tickets.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-postventa", slug: `t-postventa-${crypto.randomUUID()}` })
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

async function newClient(orgId: string) {
  const [row] = await db.insert(client).values({ orgId, name: "Cliente" }).returning();
  if (!row) throw new Error("insert de client no devolvió fila");
  return row.id;
}

async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

const codeOf = (r: { ok: boolean; error?: { code: string } }) => r.error?.code;
const rowOf = async (id: string) => (await db.select().from(ticket).where(eq(ticket.id, id)))[0];

describe("ticket — checks", () => {
  it("WHEN se inserta resuelto sin resolved_at, abierto con satisfacción o severidad 4 THE SYSTEM SHALL rechazarlo", async () => {
    const o = await org();
    const base = { orgId: o, clientId: await newClient(o), title: "Fuga" };
    await expect(db.insert(ticket).values({ ...base, status: "resuelto" })).rejects.toThrow();
    await expect(db.insert(ticket).values({ ...base, satisfaction: 4 })).rejects.toThrow();
    await expect(db.insert(ticket).values({ ...base, severity: 4 })).rejects.toThrow();
  });
});

describe("motor de tickets", () => {
  it("WHEN el dueño abre, resuelve y califica THE SYSTEM SHALL fijar resolved_at y satisfaction 5", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const opened = await openTicket(owner, o, { clientId: await newClient(o), projectId: null, title: "Fuga en baño", detail: null, severity: 2 });
    if (!opened.ok) throw new Error(opened.error.message);
    const id = opened.data.id;

    expect(await moveTicket(owner, o, id, "resuelto")).toEqual({ ok: true, data: true });
    expect((await rowOf(id))?.resolvedAt).not.toBeNull();
    expect(await rateTicket(owner, o, id, 5)).toEqual({ ok: true, data: true });
    expect((await rowOf(id))?.satisfaction).toBe(5);

    expect(await moveTicket(owner, o, id, "en_proceso")).toEqual({ ok: true, data: true });
    const back = await rowOf(id);
    expect(back?.resolvedAt).toBeNull();
    expect(back?.satisfaction).toBeNull();
  });

  it("WHEN se califica un ticket abierto THE SYSTEM SHALL devolver INVALID_TRANSITION", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const opened = await openTicket(owner, o, { clientId: await newClient(o), projectId: null, title: "Fuga", detail: null, severity: 1 });
    if (!opened.ok) throw new Error(opened.error.message);
    expect(codeOf(await rateTicket(owner, o, opened.data.id, 4))).toBe("INVALID_TRANSITION");
  });

  it("WHEN un empleado sin postventa abre o lista THE SYSTEM SHALL devolver FORBIDDEN y []", async () => {
    const o = await org();
    const emp = await person(o, "employee");
    const c = await newClient(o);
    await db.insert(ticket).values({ orgId: o, clientId: c, title: "Fuga" });
    expect(codeOf(await openTicket(emp, o, { clientId: c, projectId: null, title: "Fuga", detail: null, severity: 2 }))).toBe("FORBIDDEN");
    expect(await listTickets(emp, o)).toEqual([]);
  });
});

describe("RLS — ticket", () => {
  it("WHEN consulta un empleado sin tipo THE SYSTEM SHALL devolver 0 filas; con postventa = empresa, las del org", async () => {
    const o = await org();
    await db.insert(ticket).values({ orgId: o, clientId: await newClient(o), title: "Fuga" });
    const sinTipo = await person(o, "employee");
    const postventa = await person(o, "employee", { postventa: "empresa" });
    expect(await asUser(sinTipo, "select id from ticket")).toEqual([]);
    expect(await asUser(postventa, "select id from ticket")).toHaveLength(1);
  });
});
