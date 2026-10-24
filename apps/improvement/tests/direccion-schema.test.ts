// apps/improvement/tests/direccion-schema.test.ts
// Restricciones y RLS de Dirección en la base, contra el Supabase de desarrollo (mismo patrón que
// tests/muelle-schema.test.ts: asUser simula el rol authenticated para probar RLS de verdad).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  measurableValue,
  meeting,
  meetingRating,
  membership,
  orgMeasurable,
  orgNeed,
  orgVision,
  organization,
  permissionType,
  profile,
} from "@jotapuntoce/db/schema";

const MONDAY = "2026-10-19";
const TUESDAY = "2026-10-20";

const orgIds: string[] = [];
const profileIds: string[] = [];

// Primero el org (cascade borra tablas de Dirección y membresías), luego los profiles: las FK
// `no action` de org_measurable/measurable_value/meeting_rating a profile lo exigen.
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-direccion", slug: `t-direccion-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId: string, role: "owner" | "employee", permissionTypeId: string | null = null) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, permissionTypeId, acceptedAt: new Date() });
  return id;
}

async function measurable(orgId: string, ownerProfileId: string, title = "Ventas cerradas") {
  const [row] = await db
    .insert(orgMeasurable)
    .values({ orgId, title, ownerProfileId, goal: 10, goalDirection: "gte" })
    .returning();
  if (!row) throw new Error("insert de org_measurable no devolvió fila");
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

// Una fila en cada tabla de Dirección; devuelve los ids para las pruebas de RLS.
async function seedAll(orgId: string, owner: string) {
  await db.insert(orgVision).values({ orgId, coreValues: ["Servir"], updatedBy: owner });
  const m = await measurable(orgId, owner);
  await db.insert(measurableValue).values({ measurableId: m, weekStart: MONDAY, value: 12, enteredBy: owner });
  const [mt] = await db
    .insert(meeting)
    .values({ orgId, scheduledFor: new Date(), currentBlock: "segue", createdBy: owner })
    .returning();
  if (!mt) throw new Error("insert de meeting no devolvió fila");
  await db.insert(meetingRating).values({ meetingId: mt.id, profileId: owner, rating: 9 });
  return { measurableId: m, meetingId: mt.id };
}

const TABLES = ["org_vision", "org_measurable", "measurable_value", "meeting", "meeting_rating"] as const;

describe("tablas de Dirección", () => {
  it("WHEN se siembra cada tabla THE SYSTEM SHALL leer de vuelta cada fila, y org_need SHALL guardar responsable y semana", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const { measurableId, meetingId } = await seedAll(o, owner);

    const [vision] = await db.select().from(orgVision).where(eq(orgVision.orgId, o));
    expect(vision?.coreValues).toEqual(["Servir"]);
    const [m] = await db.select().from(orgMeasurable).where(eq(orgMeasurable.id, measurableId));
    expect(m).toMatchObject({ goal: 10, goalDirection: "gte", unit: "numero" });
    const [v] = await db.select().from(measurableValue).where(eq(measurableValue.measurableId, measurableId));
    expect(v).toMatchObject({ weekStart: MONDAY, value: 12 });
    const [mt] = await db.select().from(meeting).where(eq(meeting.id, meetingId));
    expect(mt?.currentBlock).toBe("segue");
    const [r] = await db.select().from(meetingRating).where(eq(meetingRating.meetingId, meetingId));
    expect(r?.rating).toBe(9);

    const [need] = await db
      .insert(orgNeed)
      .values({ orgId: o, title: "Issue", ownerProfileId: owner, priorityWeek: MONDAY })
      .returning();
    expect(need).toMatchObject({ ownerProfileId: owner, priorityWeek: MONDAY });
  });

  it("WHEN se inserta una segunda org_vision del mismo org THE SYSTEM SHALL rechazarla", async () => {
    const o = await org();
    await db.insert(orgVision).values({ orgId: o });
    await expect(db.insert(orgVision).values({ orgId: o })).rejects.toThrow();
  });

  it("WHEN se repite (medible, semana) en measurable_value THE SYSTEM SHALL rechazarlo", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const m = await measurable(o, owner);
    await db.insert(measurableValue).values({ measurableId: m, weekStart: MONDAY, value: 1, enteredBy: owner });
    await expect(
      db.insert(measurableValue).values({ measurableId: m, weekStart: MONDAY, value: 2, enteredBy: owner }),
    ).rejects.toThrow();
  });

  it("WHEN week_start no es lunes THE SYSTEM SHALL rechazar el measurable_value", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const m = await measurable(o, owner);
    await expect(
      db.insert(measurableValue).values({ measurableId: m, weekStart: TUESDAY, value: 1, enteredBy: owner }),
    ).rejects.toThrow();
  });

  it("WHEN un meeting_rating trae rating 11 THE SYSTEM SHALL rechazarlo", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const [mt] = await db.insert(meeting).values({ orgId: o, scheduledFor: new Date() }).returning();
    if (!mt) throw new Error("sin fila");
    await expect(db.insert(meetingRating).values({ meetingId: mt.id, profileId: owner, rating: 11 })).rejects.toThrow();
  });
});

describe("RLS — Dirección", () => {
  it("WHEN un empleado sin tipo de permiso consulta THE SYSTEM SHALL devolver 0 filas, y el dueño SHALL ver las de su org", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee");
    await seedAll(o, owner);

    for (const table of TABLES) {
      expect(await asUser(emp, `select id from ${table}`), table).toEqual([]);
      expect(await asUser(owner, `select id from ${table}`), table).toHaveLength(1);
    }
  });

  it("WHEN el dueño de otro org consulta THE SYSTEM SHALL devolver 0 filas", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    await seedAll(o, owner);
    const stranger = await person(await org(), "owner");

    for (const table of TABLES) {
      expect(await asUser(stranger, `select id from ${table}`), table).toEqual([]);
    }
  });

  it('WHEN un empleado con {"scorecard":"propio"} consulta THE SYSTEM SHALL ver solo sus medibles y sus valores', async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const [pt] = await db
      .insert(permissionType)
      .values({ orgId: o, name: "propio", grants: { scorecard: "propio" } })
      .returning();
    if (!pt) throw new Error("sin fila");
    const emp = await person(o, "employee", pt.id);

    const mine = await measurable(o, emp, "Mío");
    const theirs = await measurable(o, owner, "Del dueño");
    await db.insert(measurableValue).values([
      { measurableId: mine, weekStart: MONDAY, value: 1, enteredBy: emp },
      { measurableId: theirs, weekStart: MONDAY, value: 2, enteredBy: owner },
    ]);

    const ms = await asUser<{ id: string }>(emp, "select id from org_measurable");
    expect(ms.map((r) => r.id)).toEqual([mine]);
    const vs = await asUser<{ measurable_id: string }>(emp, "select measurable_id from measurable_value");
    expect(vs.map((r) => r.measurable_id)).toEqual([mine]);
  });
});
