// People Analyzer (server/people/reviews.ts) contra el Supabase de desarrollo, más su RLS por persona con
// asUser() (rol authenticated). Privado como responsibility_level y sin ranking.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, orgVision, peopleReview, profile } from "@jotapuntoce/db/schema";
import { myReviews, reviewsForOwner, saveReview } from "../server/people/reviews.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

const VALUES = ["Honestidad", "Servicio"];
const PERIOD = "2026-10-01";

async function equipo(withVision = true) {
  const [row] = await db.insert(organization).values({ name: "t-pa", slug: `t-pa-${crypto.randomUUID()}` }).returning();
  const orgId = row!.id;
  orgIds.push(orgId);
  if (withVision) await db.insert(orgVision).values({ orgId, coreValues: VALUES });
  const person = async (role: "owner" | "employee", fullName: string) => {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com`, fullName });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
    return id;
  };
  return { orgId, owner: await person("owner", "Dueño"), beto: await person("employee", "Beto"), ana: await person("employee", "Ana") };
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

const gwc = { entiende: true, quiere: true, capacidad: true };

describe("saveReview y myReviews", () => {
  it("WHEN el dueño califica cada valor central THE SYSTEM SHALL devolverla en myReviews del empleado", async () => {
    const f = await equipo();
    const r = await saveReview(f.owner, f.orgId, f.ana, { periodStart: PERIOD, ratings: { Honestidad: "+", Servicio: "+/-" }, gwc });
    expect(r.ok).toBe(true);
    expect((await myReviews(f.ana, f.orgId)).map((x) => x.ratings)).toEqual([{ Honestidad: "+", Servicio: "+/-" }]);
    expect(await myReviews(f.beto, f.orgId)).toEqual([]);
  });

  it("WHEN califica un valor que no está en la Visión, o no hay Visión THE SYSTEM SHALL dar VALIDATION_ERROR sin escribir", async () => {
    const f = await equipo();
    expect(await saveReview(f.owner, f.orgId, f.ana, { periodStart: PERIOD, ratings: { Honestidad: "+", Servicio: "+", Rapidez: "-" }, gwc })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    const g = await equipo(false);
    expect(await saveReview(g.owner, g.orgId, g.ana, { periodStart: PERIOD, ratings: { Honestidad: "+" }, gwc })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Primero escribe los valores en la Visión." },
    });
    expect(await db.select().from(peopleReview).where(eq(peopleReview.orgId, f.orgId))).toEqual([]);
  });
});

describe("reviewsForOwner", () => {
  it("WHEN Beto tiene mejores calificaciones que Ana THE SYSTEM SHALL devolver a Ana primero y sin score ni total", async () => {
    const f = await equipo();
    await saveReview(f.owner, f.orgId, f.beto, { periodStart: PERIOD, ratings: { Honestidad: "+", Servicio: "+" }, gwc });
    await saveReview(f.owner, f.orgId, f.ana, { periodStart: PERIOD, ratings: { Honestidad: "-", Servicio: "-" }, gwc });
    const r = await reviewsForOwner(f.owner, f.orgId, PERIOD);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.map((x) => x.employeeName)).toEqual(["Ana", "Beto"]);
    for (const row of r.data) {
      expect(row).not.toHaveProperty("score");
      expect(row).not.toHaveProperty("total");
    }
    expect(await reviewsForOwner(f.ana, f.orgId, PERIOD)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("RLS de people_review", () => {
  it("WHEN un empleado consulta THE SYSTEM SHALL ver solo la suya y 0 de un compañero", async () => {
    const f = await equipo();
    await saveReview(f.owner, f.orgId, f.ana, { periodStart: PERIOD, ratings: { Honestidad: "+", Servicio: "+" }, gwc });
    await saveReview(f.owner, f.orgId, f.beto, { periodStart: PERIOD, ratings: { Honestidad: "+", Servicio: "+" }, gwc });
    const q = `select employee_id from people_review where org_id = '${f.orgId}'`;
    expect(await asUser<{ employee_id: string }>(f.ana, q)).toEqual([{ employee_id: f.ana }]);
    expect(await asUser(f.owner, q)).toHaveLength(2);
  });
});
