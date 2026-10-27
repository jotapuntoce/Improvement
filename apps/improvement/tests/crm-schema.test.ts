// Esquema del CRM (client_preference, deal) contra el Supabase de desarrollo (mismo patrón que
// tests/muelle-schema.test.ts: asUser simula el rol authenticated para probar RLS de verdad).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  aiSuggestion,
  client,
  clientPreference,
  deal,
  membership,
  organization,
  orgKpi,
  permissionType,
  profile,
} from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-crm", slug: `t-crm-${crypto.randomUUID()}` })
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

async function newClient(orgId: string) {
  const [row] = await db.insert(client).values({ orgId, name: "Cliente" }).returning();
  if (!row) throw new Error("insert de client no devolvió fila");
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

describe("client_preference / deal", () => {
  it("WHEN se insertan una preferencia y un trato THE SYSTEM SHALL leerlos de vuelta, el trato en prospecto sin cerrar", async () => {
    const o = await org();
    const c = await newClient(o);
    await db.insert(clientPreference).values({ orgId: o, clientId: c, answers: { canal: "WhatsApp" } });
    await db.insert(deal).values({ orgId: o, clientId: c, title: "Remodelación", amountCents: 150000 });
    const [pref] = await db.select().from(clientPreference).where(eq(clientPreference.clientId, c));
    expect(pref?.answers).toEqual({ canal: "WhatsApp" });
    const [d] = await db.select().from(deal).where(eq(deal.clientId, c));
    expect(d?.stage).toBe("prospecto");
    expect(d?.closedAt).toBeNull();
  });

  it("WHEN se viola una restricción THE SYSTEM SHALL rechazar cada insert", async () => {
    const o = await org();
    const c = await newClient(o);
    await db.insert(clientPreference).values({ orgId: o, clientId: c });
    await expect(db.insert(clientPreference).values({ orgId: o, clientId: c })).rejects.toThrow();
    const base = { orgId: o, clientId: c, title: "x" };
    await expect(db.insert(deal).values({ ...base, amountCents: -1 })).rejects.toThrow();
    await expect(db.insert(deal).values({ ...base, amountCents: 1, stage: "ganado" })).rejects.toThrow();
    await expect(db.insert(deal).values({ ...base, amountCents: 1, closedAt: new Date() })).rejects.toThrow();
  });

  it("WHEN se usan la fuente ventas y la categoría siguiente_movimiento THE SYSTEM SHALL aceptarlas", async () => {
    const o = await org();
    await db.insert(orgKpi).values({ orgId: o, label: "Ventas", source: "ventas" });
    await db.insert(aiSuggestion).values({ orgId: o, category: "siguiente_movimiento", suggestionText: "x", basedOn: [] });
  });
});

describe("RLS — client_preference y deal", () => {
  it("WHEN consulta un empleado sin tipo THE SYSTEM SHALL devolver 0 filas; con clientes = empresa o el dueño, las del org", async () => {
    const o = await org();
    const c = await newClient(o);
    await db.insert(clientPreference).values({ orgId: o, clientId: c });
    await db.insert(deal).values({ orgId: o, clientId: c, title: "x", amountCents: 1 });
    const sinTipo = await person(o, "employee");
    const ventas = await person(o, "employee", { clientes: "empresa" });
    const owner = await person(o, "owner");

    for (const table of ["client_preference", "deal"]) {
      expect(await asUser(sinTipo, `select id from ${table}`)).toEqual([]);
      expect(await asUser(ventas, `select id from ${table}`)).toHaveLength(1);
      expect(await asUser(owner, `select id from ${table}`)).toHaveLength(1);
    }
  });
});
