// Resumen del pipeline (puro) y ficha 360 con alcances (oficinas-digitales paso 28).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, DEAL_STAGES, deal, membership, organization, permissionType, profile, saleOrder, ticket } from "@jotapuntoce/db/schema";
import { loadClient360 } from "../server/crm/client360.ts";
import { pipelineSummary } from "../server/crm/pipeline.ts";

describe("pipelineSummary", () => {
  it("WHEN hay 2 ganados y 1 perdido THE SYSTEM SHALL dar winRate 0.67 y una fila por etapa en orden", () => {
    const res = pipelineSummary([
      { stage: "ganado", amountCents: 100 },
      { stage: "ganado", amountCents: 200 },
      { stage: "perdido", amountCents: 50 },
      { stage: "prospecto", amountCents: 10 },
    ]);
    expect(res.winRate).toBe(0.67);
    expect(res.stages.map((s) => s.stage)).toEqual([...DEAL_STAGES]);
    expect(res.stages.find((s) => s.stage === "ganado")).toEqual({ stage: "ganado", count: 2, amountCents: 300 });
  });

  it("WHEN solo hay tratos abiertos THE SYSTEM SHALL dar winRate null", () => {
    expect(pipelineSummary([{ stage: "propuesta", amountCents: 5 }]).winRate).toBeNull();
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-360", slug: `t-360-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const ids = { owner: crypto.randomUUID(), soloClientes: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  const [tipo] = await db.insert(permissionType).values({ orgId: o.id, name: "Clientes", grants: { clientes: "empresa" } }).returning();
  await db.insert(membership).values([
    { userId: ids.owner, orgId: o.id, role: "owner", acceptedAt: new Date() },
    { userId: ids.soloClientes, orgId: o.id, role: "employee", acceptedAt: new Date(), permissionTypeId: tipo!.id },
  ]);
  const [c] = await db.insert(client).values({ orgId: o.id, name: "Cliente 360" }).returning();
  await db.insert(deal).values({ orgId: o.id, clientId: c!.id, title: "Boda", amountCents: 500000 });
  await db.insert(ticket).values({ orgId: o.id, clientId: c!.id, title: "Llegó tarde" });
  await db.insert(saleOrder).values({ orgId: o.id, number: 1, clientId: c!.id, totalCents: 1000 });
  return { orgId: o.id, clientId: c!.id, ...ids };
}

describe("loadClient360", () => {
  it("WHEN un empleado con clientes sin erp la carga THE SYSTEM SHALL dar tratos y tickets y órdenes vacías", async () => {
    const o = await org();
    const res = await loadClient360(o.soloClientes, o.orgId, o.clientId);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.deals).toHaveLength(1);
    expect(res.data.tickets).toHaveLength(1);
    expect(res.data.saleOrders).toEqual([]);
    const delDueno = await loadClient360(o.owner, o.orgId, o.clientId);
    expect(delDueno.ok && delDueno.data.saleOrders).toHaveLength(1);
  });

  it("WHEN el cliente es de otro org THE SYSTEM SHALL dar NOT_FOUND", async () => {
    const o = await org();
    const otro = await org();
    expect(await loadClient360(o.owner, o.orgId, otro.clientId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await loadClient360(crypto.randomUUID(), o.orgId, o.clientId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
