// Recepción de encargos (oficinas-digitales paso 19): ruteo puro y creación contra la base de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agent, agentTask, area, membership, message, organization, profile } from "@jotapuntoce/db/schema";
import { createEncargo, listEncargos, routeEncargo } from "../server/agents/tasks.ts";

describe("routeEncargo", () => {
  const agents = [
    { id: "m", kind: "manager", areaId: null },
    { id: "e", kind: "especialista", areaId: "A" },
  ];
  it("WHEN el área tiene especialista THE SYSTEM SHALL dárselo; si no, al manager", () => {
    expect(routeEncargo(agents, "A")?.id).toBe("e");
    expect(routeEncargo(agents, "B")?.id).toBe("m");
    expect(routeEncargo(agents)?.id).toBe("m");
    expect(routeEncargo([agents[1]!], "B")).toBeNull();
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org({ conAgentes = true } = {}) {
  const [o] = await db.insert(organization).values({ name: "t-encargos", slug: `t-encargos-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const ids = { owner: crypto.randomUUID(), empleado: crypto.randomUUID(), fuera: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  await db.insert(membership).values([
    { userId: ids.owner, orgId: o.id, role: "owner", acceptedAt: new Date() },
    { userId: ids.empleado, orgId: o.id, role: "employee", acceptedAt: new Date() },
  ]);
  const [cocina, caja] = await db
    .insert(area)
    .values([
      { orgId: o.id, name: "Cocina", color: "verde" },
      { orgId: o.id, name: "Caja", color: "azul" },
    ])
    .returning();
  const agentes = conAgentes
    ? await db
        .insert(agent)
        .values([
          { orgId: o.id, kind: "manager", ownerProfileId: ids.owner, name: "Improvement" },
          { orgId: o.id, kind: "recepcion", ownerProfileId: ids.owner, name: "Recepción" },
          { orgId: o.id, kind: "especialista", areaId: cocina!.id, ownerProfileId: ids.owner, name: "Especialista de Cocina" },
        ])
        .returning()
    : [];
  const byKind = (k: string) => agentes.find((a) => a.kind === k)?.id;
  return { orgId: o.id, cocina: cocina!.id, caja: caja!.id, manager: byKind("manager"), especialista: byKind("especialista"), ...ids };
}

const taskOf = async (id: string) => (await db.select().from(agentTask).where(eq(agentTask.id, id)))[0]!;

describe("createEncargo", () => {
  it("WHEN el área tiene especialista THE SYSTEM SHALL asignárselo y publicar usuario + recepción en su canal", async () => {
    const o = await org();
    const res = await createEncargo(o.empleado, o.orgId, { body: "Inventario de la cocina", areaId: o.cocina });
    if (!res.ok) throw new Error(res.error.message);
    const task = await taskOf(res.data.id);
    expect(task).toMatchObject({ agentId: o.especialista, status: "asignado", requestedBy: o.empleado, areaId: o.cocina });
    const msgs = await db.select().from(message).where(eq(message.channelId, task.channelId!)).orderBy(asc(message.createdAt));
    expect(msgs.map((m) => m.body)).toEqual(["Inventario de la cocina", "Recibido. Lo atiende Especialista de Cocina."]);
    expect(msgs[0]?.authorProfileId).toBe(o.empleado);
  });

  it("WHEN no hay areaId o el área no tiene especialista THE SYSTEM SHALL asignarlo al manager", async () => {
    const o = await org();
    const sinArea = await createEncargo(o.empleado, o.orgId, { body: "Algo general" });
    const otraArea = await createEncargo(o.empleado, o.orgId, { body: "Corte de caja", areaId: o.caja });
    if (!sinArea.ok || !otraArea.ok) throw new Error("encargo falló");
    expect((await taskOf(sinArea.data.id)).agentId).toBe(o.manager);
    expect((await taskOf(otraArea.data.id)).agentId).toBe(o.manager);
    const propios = await listEncargos(o.empleado, o.orgId);
    expect(propios.ok && propios.data).toHaveLength(2);
  });

  it("WHEN no hay manager THE SYSTEM SHALL dar NOT_READY sin escribir; un no miembro recibe NOT_FOUND", async () => {
    const o = await org({ conAgentes: false });
    expect(await createEncargo(o.empleado, o.orgId, { body: "hola" })).toMatchObject({ ok: false, error: { code: "NOT_READY" } });
    expect(await createEncargo(o.fuera, o.orgId, { body: "hola" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.select().from(agentTask).where(eq(agentTask.orgId, o.orgId))).toHaveLength(0);
  });
});
