// El esquema de configuración contra el Supabase de desarrollo: llaves únicas, custom por defecto y
// RLS de lectura (miembro sí, ajeno no).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appStage, client, membership, orgBrand, organization, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db.insert(organization).values({ name: "t-apps", slug: `t-apps-${crypto.randomUUID()}` }).returning();
  orgIds.push(row!.id);
  return row!.id;
}
async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
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

describe("esquema de apps", () => {
  it("WHEN se crea un cliente THE SYSTEM SHALL dejar custom en {}", async () => {
    const o = await org();
    const [c] = await db.insert(client).values({ orgId: o, name: "C" }).returning();
    expect(c!.custom).toEqual({});
  });

  it("WHEN se repite la llave de una app en el mismo org THE SYSTEM SHALL rechazarla", async () => {
    const o = await org();
    await db.insert(appModel).values({ orgId: o, key: "ventas", name: "Ventas", kind: "base", section: "clientes" });
    await expect(
      db.insert(appModel).values({ orgId: o, key: "ventas", name: "Otra", kind: "base", section: "clientes" }),
    ).rejects.toThrow();
  });

  it("WHEN un miembro lee la configuración de su org THE SYSTEM SHALL verla; uno ajeno ve 0 filas", async () => {
    const o = await org();
    const other = await org();
    const member = await person(o, "employee");
    const outsider = await person(other, "owner");
    const [m] = await db.insert(appModel).values({ orgId: o, key: "ventas", name: "Ventas", kind: "base", section: "clientes" }).returning();
    await db.insert(appStage).values({ orgId: o, appId: m!.id, key: "prospecto", name: "Prospecto", position: 0 });
    await db.insert(orgBrand).values({ orgId: o, primaryColor: "#123456" });
    for (const table of ["app_model", "app_stage", "org_brand"]) {
      expect(await asUser(member, `select 1 from ${table} where org_id = '${o}'`)).toHaveLength(1);
      expect(await asUser(outsider, `select 1 from ${table} where org_id = '${o}'`)).toHaveLength(0);
    }
  });
});
