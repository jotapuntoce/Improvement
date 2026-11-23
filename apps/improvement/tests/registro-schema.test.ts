// Esquema de registro y apps propias contra el Supabase de desarrollo: check de tamaño y RLS de lectura.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appRecord, membership, organization, orgProfile, permissionType, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-reg", slug: `t-reg-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return o!.id;
}
async function member(orgId: string, role: "owner" | "employee", permissionTypeId?: string) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date(), permissionTypeId });
  return id;
}
// Mismo helper que apps-schema.test.ts: corre la consulta como `authenticated` con ese uid.
async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

describe("esquema de registro y apps propias", () => {
  it("WHEN se guarda el perfil del negocio THE SYSTEM SHALL rechazar un tamaño fuera de TEAM_SIZES", async () => {
    await db.insert(orgProfile).values({ orgId: await org(), teamSize: "2-5", city: "Monterrey" });
    await expect(db.insert(orgProfile).values({ orgId: await org(), teamSize: "mil" })).rejects.toThrow();
  });

  it("WHEN se leen registros de apps propias por PostgREST THE SYSTEM SHALL mostrarlos al dueño y a quien tiene la sección, no a los demás", async () => {
    const orgId = await org();
    const owner = await member(orgId, "owner");
    const sinPermiso = await member(orgId, "employee");
    const [tipo] = await db.insert(permissionType).values({ orgId, name: "Con apps", grants: { aplicaciones: "empresa" } }).returning();
    const conPermiso = await member(orgId, "employee", tipo!.id);
    const [app] = await db.insert(appModel).values({ orgId, key: "mascotas", name: "Mascotas", kind: "custom", section: "aplicaciones" }).returning();
    await db.insert(appRecord).values({ orgId, appId: app!.id, title: "Firulais", stage: "nuevo" });
    expect(await asUser(owner, "select title from app_record")).toHaveLength(1);
    expect(await asUser(conPermiso, "select title from app_record")).toHaveLength(1);
    expect(await asUser(sinPermiso, "select title from app_record")).toHaveLength(0);
  });

  it("WHEN un miembro lee org_profile THE SYSTEM SHALL ver solo el de su empresa", async () => {
    const a = await org();
    const b = await org();
    await db.insert(orgProfile).values([{ orgId: a, city: "Monterrey" }, { orgId: b, city: "León" }]);
    const owner = await member(a, "owner");
    expect(await asUser<{ city: string }>(owner, "select city from org_profile")).toEqual([{ city: "Monterrey" }]);
  });
});
