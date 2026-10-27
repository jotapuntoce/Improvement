// Lealtad (server/crm/loyalty.ts) y la fuente retorno_experiencias contra el Supabase de desarrollo:
// niveles, funciones, permisos, RLS y wallet_token único.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, experienceGrant, membership, organization, profile } from "@jotapuntoce/db/schema";
import { grantExperience, setFeatures, tierForClient, upsertTier } from "../server/crm/loyalty.ts";
import { mxMonthStart } from "../server/crm/deals.ts";
import { computeKpiValues, type KpiRow } from "../server/kpis/sources.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db.insert(organization).values({ name: "t-lealtad", slug: `t-lealtad-${crypto.randomUUID()}` }).returning();
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

async function newClient(orgId: string, walletToken?: string) {
  const [row] = await db.insert(client).values({ orgId, name: "Cliente", walletToken }).returning();
  return row!.id;
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

const kpiRow = (orgId: string): KpiRow => ({
  id: crypto.randomUUID(), orgId, label: "r", hint: null, source: "retorno_experiencias", config: {}, manualValue: null, format: "porcentaje",
});

describe("fuente retorno_experiencias", () => {
  it("WHEN hay 10000 en experiencias y 100000 ganados este mes THE SYSTEM SHALL dar 10; sin ganados da 0", async () => {
    const o = await org();
    const empty = await org();
    const c = await newClient(o);
    const e = await newClient(empty);
    const today = mxMonthStart(new Date());
    await db.insert(deal).values({ orgId: o, clientId: c, title: "a", amountCents: 100000, stage: "ganado", closedAt: new Date() });
    await db.insert(experienceGrant).values([
      { orgId: o, clientId: c, title: "Cena", valueCents: 10000, grantedOn: today },
      { orgId: empty, clientId: e, title: "Cena", valueCents: 10000, grantedOn: today },
    ]);
    const rows = [kpiRow(o), kpiRow(empty)];
    const values = await computeKpiValues(rows);
    expect(rows.map((r) => values.get(r.id))).toEqual([10, 0]);
  });
});

describe("tierForClient", () => {
  it("WHEN el cliente tiene 3 ganados y hay niveles 0, 2 y 5 THE SYSTEM SHALL devolver el de 2", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    for (const [name, minPurchases] of [["Bronce", 0], ["Plata", 2], ["Oro", 5]] as const) {
      expect((await upsertTier(owner, o, { name, minPurchases })).ok).toBe(true);
    }
    const c = await newClient(o);
    await db.insert(deal).values(
      ["a", "b", "c"].map((title) => ({ orgId: o, clientId: c, title, amountCents: 1000, stage: "ganado" as const, closedAt: new Date() })),
    );
    expect((await tierForClient(o, c))?.name).toBe("Plata");
  });
});

describe("permisos", () => {
  it("WHEN setFeatures recibe cashback THE SYSTEM SHALL dar VALIDATION_ERROR sin escribir", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const r = await setFeatures(owner, o, { vip: true, cashback: true });
    expect(r.ok ? null : r.error.code).toBe("VALIDATION_ERROR");
    const rows = await db.execute(sql`select 1 from loyalty_program where org_id = ${o}`);
    expect(rows.length).toBe(0);
    expect((await setFeatures(owner, o, { vip: true })).ok).toBe(true);
  });

  it("WHEN un empleado sin clientes:empresa registra una experiencia THE SYSTEM SHALL dar FORBIDDEN; por RLS ve 0 filas", async () => {
    const o = await org();
    const employee = await person(o, "employee");
    const c = await newClient(o);
    await db.insert(experienceGrant).values({ orgId: o, clientId: c, title: "Cena", valueCents: 500, grantedOn: "2026-10-01" });
    const r = await grantExperience(employee, o, { clientId: c, title: "Cena", valueCents: 500, grantedOn: "2026-10-02" });
    expect(r.ok ? null : r.error.code).toBe("FORBIDDEN");
    expect(await asUser(employee, `select * from experience_grant where org_id = '${o}'`)).toHaveLength(0);
  });
});

describe("wallet_token", () => {
  it("WHEN dos clientes repiten wallet_token THE SYSTEM SHALL rechazar el segundo insert", async () => {
    const o = await org();
    const token = `w-${crypto.randomUUID()}`;
    await newClient(o, token);
    await expect(newClient(o, token)).rejects.toThrow();
  });
});
