// Esquema del tablero contra el Supabase de desarrollo: check de tipos y RLS (cada quien lo suyo; el
// dueño, todo lo de su empresa).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, dashboardCard, membership, organization, profile } from "@jotapuntoce/db/schema";

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
  const [o] = await db.insert(organization).values({ name: "t-dash", slug: `t-dash-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return { orgId: o!.id, owner: await member(o!.id, "owner"), ana: await member(o!.id, "employee"), luis: await member(o!.id, "employee") };
}
// Mismo helper que tasks-schema.test.ts: corre la consulta como `authenticated` con ese uid.
async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

describe("esquema del tablero", () => {
  it("WHEN alguien consulta tarjetas por PostgREST THE SYSTEM SHALL darle las suyas, al dueño todas, y a otro empleado ninguna ajena", async () => {
    const { orgId, owner, ana, luis } = await setup();
    await db.insert(dashboardCard).values([
      { orgId, userId: ana, kind: "hoy", title: "Hoy" },
      { orgId, userId: owner, kind: "alertas", title: "Alertas" },
    ]);
    const q = `select user_id from dashboard_card where org_id = '${orgId}'`;
    expect(await asUser(ana, q)).toHaveLength(1);
    expect(await asUser(owner, q)).toHaveLength(2);
    expect(await asUser(luis, q)).toHaveLength(0);
  });

  it("WHEN alguien intenta escribir una tarjeta por PostgREST THE SYSTEM SHALL rechazarlo", async () => {
    const { orgId, ana } = await setup();
    await expect(asUser(ana, `insert into dashboard_card (org_id, user_id, kind, title) values ('${orgId}', '${ana}', 'hoy', 'x')`)).rejects.toThrow();
  });

  it("WHEN el tipo no es del catálogo THE SYSTEM SHALL rechazarlo; WHEN la categoría es alerta THE SYSTEM SHALL aceptarla", async () => {
    const { orgId, ana } = await setup();
    await expect(db.insert(dashboardCard).values({ orgId, userId: ana, kind: "otro" as "hoy", title: "x" })).rejects.toThrow();
    await db.insert(aiSuggestion).values({ orgId, category: "alerta", suggestionText: "x", basedOn: [] });
  });
});
