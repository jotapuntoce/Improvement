// El motor del Scorecard contra el Supabase de desarrollo. `now` va inyectado para no depender del día
// en que corre la prueba.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { measurableValue, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import {
  archiveMeasurable,
  createMeasurable,
  enterValue,
  listScorecard,
} from "../server/direccion/scorecard/measurables.ts";

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
    .values({ name: "t-scorecard", slug: `t-scorecard-${crypto.randomUUID()}` })
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

async function define(owner: string, orgId: string, ownerProfileId: string, title = "Ventas cerradas") {
  const res = await createMeasurable(owner, orgId, { title, ownerProfileId, goal: 10, goalDirection: "gte", unit: "numero" });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

const valuesOf = (measurableId: string) =>
  db.select().from(measurableValue).where(eq(measurableValue.measurableId, measurableId));

describe("enterValue", () => {
  it('WHEN un empleado con {"scorecard":"propio"} captura THE SYSTEM SHALL dejarlo solo en el suyo', async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee", { scorecard: "propio" });
    const theirs = await define(owner, o, owner);
    const mine = await define(owner, o, emp, "Llamadas");

    expect(await enterValue(emp, o, theirs, { weekStart: THIS_WEEK, value: 5 }, NOW)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await valuesOf(theirs)).toHaveLength(0);
    expect(await enterValue(emp, o, mine, { weekStart: THIS_WEEK, value: 5 }, NOW)).toEqual({ ok: true, data: true });
    expect((await valuesOf(mine))[0]?.value).toBe(5);
  });

  it('WHEN un empleado con {"scorecard":"empresa"} captura en cualquier medible THE SYSTEM SHALL guardarlo', async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee", { scorecard: "empresa" });
    const m = await define(owner, o, owner);
    expect((await enterValue(emp, o, m, { weekStart: THIS_WEEK, value: "7" }, NOW)).ok).toBe(true);
    expect((await valuesOf(m))[0]?.value).toBe(7);
  });

  it("WHEN se captura dos veces la misma semana THE SYSTEM SHALL dejar una fila con el último valor", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const m = await define(owner, o, owner);
    await enterValue(owner, o, m, { weekStart: THIS_WEEK, value: 3 }, NOW);
    await enterValue(owner, o, m, { weekStart: THIS_WEEK, value: 8 }, NOW);
    const rows = await valuesOf(m);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(8);
  });

  it("WHEN la semana no es lunes o es futura THE SYSTEM SHALL devolver VALIDATION_ERROR", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const m = await define(owner, o, owner);
    for (const ws of ["2026-10-20", "2026-10-26"]) {
      expect(await enterValue(owner, o, m, { weekStart: ws, value: 1 }, NOW)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
    expect(await valuesOf(m)).toHaveLength(0);
  });
});

describe("createMeasurable / archiveMeasurable / listScorecard", () => {
  it("WHEN un empleado define un medible THE SYSTEM SHALL devolver FORBIDDEN", async () => {
    const o = await org();
    const emp = await person(o, "employee", { scorecard: "empresa" });
    expect(
      await createMeasurable(emp, o, { title: "Ventas", ownerProfileId: emp, goal: 1, goalDirection: "gte", unit: "numero" }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("WHEN el responsable no es del org THE SYSTEM SHALL devolver NOT_FOUND", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const stranger = await person(await org(), "owner");
    expect(
      await createMeasurable(owner, o, { title: "Ventas", ownerProfileId: stranger, goal: 1, goalDirection: "gte", unit: "numero" }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("WHEN el dueño archiva un medible THE SYSTEM SHALL conservar sus valores y sacarlo del scorecard", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const m = await define(owner, o, owner);
    await enterValue(owner, o, m, { weekStart: THIS_WEEK, value: 12 }, NOW);

    const before = await listScorecard(owner, o, NOW);
    expect(before.rows[0]?.values[THIS_WEEK]).toEqual({ value: 12, onTrack: true });
    expect(before.canDefine).toBe(true);

    expect(await archiveMeasurable(owner, o, m)).toEqual({ ok: true, data: true });
    expect(await valuesOf(m)).toHaveLength(1);
    expect((await listScorecard(owner, o, NOW)).rows).toEqual([]);
    expect(await enterValue(owner, o, m, { weekStart: THIS_WEEK, value: 1 }, NOW)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it('WHEN un empleado con {"scorecard":"propio"} lista THE SYSTEM SHALL ver solo sus medibles con 13 semanas', async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee", { scorecard: "propio" });
    await define(owner, o, owner);
    const mine = await define(owner, o, emp, "Llamadas");

    const view = await listScorecard(emp, o, NOW);
    expect(view.rows.map((r) => r.id)).toEqual([mine]);
    expect(view.rows[0]?.canEnter).toBe(true);
    expect(view.weeks).toHaveLength(13);
    expect(view.currentWeek).toBe(THIS_WEEK);
    expect(view.canDefine).toBe(false);
  });

  it("WHEN un empleado sin la sección lista THE SYSTEM SHALL devolver filas vacías", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee");
    await define(owner, o, owner);
    expect((await listScorecard(emp, o, NOW)).rows).toEqual([]);
  });
});
