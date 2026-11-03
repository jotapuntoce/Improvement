// Esquema de importación contra el Supabase de desarrollo: checks y RLS solo para el dueño.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, importJob, membership, organization, profile, recordOrigin } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function member(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-imp", slug: `t-imp-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const [app] = await db.insert(appModel).values({ orgId: o!.id, key: "mascotas", name: "Mascotas", kind: "custom", section: "aplicaciones" }).returning();
  return { orgId: o!.id, appId: app!.id, owner: await member(o!.id, "owner"), emp: await member(o!.id, "employee") };
}
// Mismo helper que registro-schema.test.ts: corre la consulta como `authenticated` con ese uid.
async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

describe("esquema de importación", () => {
  it("WHEN se consultan importaciones por PostgREST THE SYSTEM SHALL mostrarlas solo al dueño", async () => {
    const { orgId, appId, owner, emp } = await setup();
    const [job] = await db.insert(importJob).values({ orgId, appId, source: "csv", fileName: "c.csv", headers: ["Nombre"], rows: [["Ana"]], createdBy: owner }).returning();
    await db.insert(recordOrigin).values({ importJobId: job!.id, orgId, recordId: crypto.randomUUID() });
    for (const table of ["import_job", "record_origin"]) {
      expect(await asUser(owner, `select 1 from ${table} where org_id = '${orgId}'`)).toHaveLength(1);
      expect(await asUser(emp, `select 1 from ${table} where org_id = '${orgId}'`)).toHaveLength(0);
    }
  });

  it("WHEN el origen o el estado no son del catálogo THE SYSTEM SHALL rechazarlos en la base", async () => {
    const { orgId, appId } = await setup();
    const base = { orgId, appId, fileName: "c", headers: [], rows: [] };
    await expect(db.insert(importJob).values({ ...base, source: "zip" as "csv" })).rejects.toThrow();
    await expect(db.insert(importJob).values({ ...base, source: "csv", status: "listo" as "borrador" })).rejects.toThrow();
  });
});
