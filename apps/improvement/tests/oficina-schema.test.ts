// office_plan / office_zone, el bucket privado `espacios` y su RLS contra el Supabase de desarrollo
// (patrón de tests/muelle-schema.test.ts: asUser simula el rol authenticated para probar RLS de verdad).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, officePlan, officeZone, organization, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db.insert(organization).values({ name: "t-oficina", slug: `t-oficina-${crypto.randomUUID()}` }).returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId: string | null, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  if (orgId) await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}

async function plan(orgId: string, status: "draft" | "confirmed") {
  const [row] = await db.insert(officePlan).values({ orgId, status, proposal: {} }).returning();
  if (!row) throw new Error("insert de office_plan no devolvió fila");
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

describe("office_plan / office_zone — esquema", () => {
  it("WHEN se inserta un draft y una zona area ligada THE SYSTEM SHALL aceptarlos; un segundo draft se rechaza", async () => {
    const orgId = await org();
    const [a] = await db.insert(area).values({ orgId, name: "Cocina", color: "verde" }).returning();
    const planId = await plan(orgId, "draft");
    const [zone] = await db
      .insert(officeZone)
      .values({ orgId, planId, areaId: a!.id, kind: "area", label: "Cocina", x: 0, y: 0, w: 4, h: 3 })
      .returning();
    expect(zone?.areaId).toBe(a!.id);
    await expect(plan(orgId, "draft")).rejects.toThrow();
  });

  it("WHEN una zona se sale de la cuadrícula o una recepcion trae area_id THE SYSTEM SHALL rechazarla", async () => {
    const orgId = await org();
    const [a] = await db.insert(area).values({ orgId, name: "Caja", color: "azul" }).returning();
    const planId = await plan(orgId, "draft");
    await expect(
      db.insert(officeZone).values({ orgId, planId, areaId: a!.id, kind: "area", label: "Caja", x: 35, y: 0, w: 6, h: 2 }),
    ).rejects.toThrow();
    await expect(
      db.insert(officeZone).values({ orgId, planId, areaId: a!.id, kind: "recepcion", label: "Recepción", x: 0, y: 0, w: 2, h: 2 }),
    ).rejects.toThrow();
  });
});

describe("office_plan / office_zone — RLS", () => {
  it("WHEN un empleado lee THE SYSTEM SHALL ver solo el confirmado; el dueño ve los dos", async () => {
    const orgId = await org();
    const owner = await person(orgId, "owner");
    const employee = await person(orgId, "employee");
    const draftId = await plan(orgId, "draft");
    const confirmedId = await plan(orgId, "confirmed");
    for (const planId of [draftId, confirmedId]) {
      await db.insert(officeZone).values({ orgId, planId, kind: "recepcion", label: "Recepción", x: 0, y: 0, w: 2, h: 2 });
    }

    const q = `select id from office_plan where org_id = '${orgId}'`;
    const empleado = await asUser<{ id: string }>(employee, q);
    expect(empleado.map((r) => r.id)).toEqual([confirmedId]);
    const dueno = await asUser<{ id: string }>(owner, q);
    expect(dueno.map((r) => r.id).sort()).toEqual([draftId, confirmedId].sort());

    const zonas = await asUser<{ plan_id: string }>(employee, `select plan_id from office_zone where org_id = '${orgId}'`);
    expect(zonas.map((z) => z.plan_id)).toEqual([confirmedId]);
  });

  it("WHEN alguien sin membresía lee THE SYSTEM SHALL devolver 0 filas", async () => {
    const orgId = await org();
    const planId = await plan(orgId, "confirmed");
    await db.insert(officeZone).values({ orgId, planId, kind: "sala", label: "Sala", x: 0, y: 0, w: 2, h: 2 });
    const extrano = await person(null, "employee");
    expect(await asUser(extrano, `select id from office_plan where org_id = '${orgId}'`)).toHaveLength(0);
    expect(await asUser(extrano, `select id from office_zone where org_id = '${orgId}'`)).toHaveLength(0);
  });
});

describe("bucket espacios", () => {
  it("WHEN se consulta storage.buckets THE SYSTEM SHALL tener espacios privado", async () => {
    const rows = (await db.execute(sql`select public from storage.buckets where id = 'espacios'`)) as unknown as {
      public: boolean;
    }[];
    expect(rows).toEqual([{ public: false }]);
  });
});
