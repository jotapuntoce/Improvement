// agent, agent_task y worker_heartbeat: checks y RLS contra el Supabase de desarrollo (patrón asUser de
// tests/oficina-schema.test.ts: simula el rol authenticated para probar RLS de verdad).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agent, agentTask, area, membership, organization, profile, workerHeartbeat } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
const workers: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
  for (const w of workers.splice(0)) await db.delete(workerHeartbeat).where(sql`${workerHeartbeat.worker} = ${w}`);
});

async function orgConGente() {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-agentes", slug: `t-agentes-${crypto.randomUUID()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ids = { owner: crypto.randomUUID(), a: crypto.randomUUID(), b: crypto.randomUUID() };
  for (const [k, id] of Object.entries(ids)) {
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId: org.id, role: k === "owner" ? "owner" : "employee", acceptedAt: new Date() });
  }
  return { orgId: org.id, ...ids };
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

describe("agent / agent_task — checks", () => {
  it("WHEN hay un segundo manager o un especialista sin área THE SYSTEM SHALL rechazarlos", async () => {
    const { orgId, owner } = await orgConGente();
    await db.insert(agent).values({ orgId, kind: "manager", ownerProfileId: owner, name: "Improvement" });
    await expect(db.insert(agent).values({ orgId, kind: "manager", ownerProfileId: owner, name: "Otro" })).rejects.toThrow();
    await expect(db.insert(agent).values({ orgId, kind: "especialista", ownerProfileId: owner, name: "Sin área" })).rejects.toThrow();
    const [a] = await db.insert(area).values({ orgId, name: "Cocina", color: "verde" }).returning();
    await expect(
      db.insert(agent).values({ orgId, kind: "manager", areaId: a!.id, ownerProfileId: owner, name: "Con área" }),
    ).rejects.toThrow();
  });

  it("WHEN un encargo trae attempts 4 o status perdido THE SYSTEM SHALL rechazarlo", async () => {
    const { orgId, a } = await orgConGente();
    await expect(db.insert(agentTask).values({ orgId, requestedBy: a, body: "x", attempts: 4 })).rejects.toThrow();
    await expect(
      db.execute(sql`insert into agent_task (org_id, requested_by, body, status) values (${orgId}, ${a}, 'x', 'perdido')`),
    ).rejects.toThrow();
  });
});

describe("agent / agent_task / worker_heartbeat — RLS", () => {
  it("WHEN quien pidió consulta THE SYSTEM SHALL ver su encargo; otro empleado ve 0 filas", async () => {
    const { orgId, a, b, owner } = await orgConGente();
    const [t] = await db.insert(agentTask).values({ orgId, requestedBy: a, body: "Cotiza 3 proveedores" }).returning();
    const q = `select id from agent_task where org_id = '${orgId}'`;
    expect((await asUser<{ id: string }>(a, q)).map((r) => r.id)).toEqual([t!.id]);
    expect(await asUser(b, q)).toHaveLength(0);
    expect((await asUser<{ id: string }>(owner, q)).map((r) => r.id)).toEqual([t!.id]);
  });

  it("WHEN un empleado consulta agent o worker_heartbeat THE SYSTEM SHALL dar 0 filas; el dueño ve sus agentes", async () => {
    const { orgId, a, owner } = await orgConGente();
    await db.insert(agent).values({ orgId, kind: "manager", ownerProfileId: owner, name: "Improvement" });
    const w = `t-worker-${crypto.randomUUID()}`;
    workers.push(w);
    await db.insert(workerHeartbeat).values({ worker: w });
    const q = `select id from agent where org_id = '${orgId}'`;
    expect(await asUser(a, q)).toHaveLength(0);
    // Sin grant ni política: authenticated ni siquiera puede consultarla (42501) — nunca ve una fila.
    const latido = await asUser(a, `select worker from worker_heartbeat where worker = '${w}'`).catch(
      (err: { cause?: { code?: string } }) => {
        expect(err.cause?.code).toBe("42501");
        return [];
      },
    );
    expect(latido).toHaveLength(0);
    expect(await asUser(owner, q)).toHaveLength(1);
  });
});
