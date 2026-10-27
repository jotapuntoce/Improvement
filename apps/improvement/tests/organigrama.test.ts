// Accountability Chart (server/people/seats.ts) contra el Supabase de desarrollo, más la RLS de `seat`
// con asUser() (rol authenticated), como en tests/crm-schema.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile, seat } from "@jotapuntoce/db/schema";
import { createSeat, listSeats, updateSeat } from "../server/people/seats.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db.insert(organization).values({ name: "t-seat", slug: `t-seat-${crypto.randomUUID()}` }).returning();
  orgIds.push(row!.id);
  return row!.id;
}

async function person(orgId: string | null, role: "owner" | "employee" = "employee", grants?: Record<string, string>) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com`, fullName: `Persona ${id.slice(0, 4)}` });
  profileIds.push(id);
  if (!orgId) return id;
  let permissionTypeId: string | null = null;
  if (grants) {
    const [pt] = await db.insert(permissionType).values({ orgId, name: "t", grants }).returning();
    permissionTypeId = pt?.id ?? null;
  }
  await db.insert(membership).values({ userId: id, orgId, role, permissionTypeId, acceptedAt: new Date() });
  return id;
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

async function ok<T>(r: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }) {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}

describe("listSeats", () => {
  it("WHEN el dueño crea una raíz y dos hijos THE SYSTEM SHALL devolver el árbol con los hijos por position", async () => {
    const orgId = await org();
    const owner = await person(orgId, "owner");
    const root = await ok(await createSeat(owner, orgId, { title: "Visionario", roles: ["Ideas", "Cultura"], holderProfileId: owner }));
    await ok(await createSeat(owner, orgId, { title: "Ventas", roles: ["Cerrar"], parentSeatId: root.id, position: 2 }));
    await ok(await createSeat(owner, orgId, { title: "Operaciones", roles: ["Entregar"], parentSeatId: root.id, position: 1 }));
    const tree = await listSeats(owner, orgId);
    expect(tree.map((s) => s.title)).toEqual(["Visionario"]);
    expect(tree[0]!.holderName).not.toBeNull();
    expect(tree[0]!.children.map((s) => s.title)).toEqual(["Operaciones", "Ventas"]);
  });
});

describe("updateSeat y permisos", () => {
  it("WHEN se cuelga un asiento de su descendiente THE SYSTEM SHALL devolver VALIDATION_ERROR sin escribir", async () => {
    const orgId = await org();
    const owner = await person(orgId, "owner");
    const root = await ok(await createSeat(owner, orgId, { title: "Raíz", roles: ["r"] }));
    const child = await ok(await createSeat(owner, orgId, { title: "Hijo", roles: ["r"], parentSeatId: root.id }));
    const r = await updateSeat(owner, orgId, root.id, { title: "Raíz", roles: ["r"], parentSeatId: child.id });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", message: "Ese asiento no puede colgar de sí mismo." } });
    const [row] = await db.select().from(seat).where(eq(seat.id, root.id));
    expect(row!.parentSeatId).toBeNull();
  });

  it("WHEN un empleado crea THE SYSTEM SHALL devolver FORBIDDEN; un responsable ajeno da NOT_FOUND", async () => {
    const orgId = await org();
    const owner = await person(orgId, "owner");
    const employee = await person(orgId);
    expect(await createSeat(employee, orgId, { title: "Ventas", roles: ["r"] })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const ajeno = await person(null);
    expect(await createSeat(owner, orgId, { title: "Ventas", roles: ["r"], holderProfileId: ajeno })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("RLS de seat", () => {
  it("WHEN un empleado sin tipo de permiso consulta THE SYSTEM SHALL ver 0; con equipo:area ve los asientos de su org", async () => {
    const orgId = await org();
    const owner = await person(orgId, "owner");
    await ok(await createSeat(owner, orgId, { title: "Raíz", roles: ["r"] }));
    const sinTipo = await person(orgId);
    const conArea = await person(orgId, "employee", { equipo: "area" });
    const q = `select id from seat where org_id = '${orgId}'`;
    expect(await asUser(sinTipo, q)).toEqual([]);
    expect(await asUser(conArea, q)).toHaveLength(1);
    expect(await listSeats(sinTipo, orgId)).toEqual([]);
  });
});
