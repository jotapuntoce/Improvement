// Agentes por org (oficinas-digitales paso 17): jefe de área (puro), idempotencia y guard (base de desarrollo).
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agent, area, channel, channelMember, membership, organization, profile, seat } from "@jotapuntoce/db/schema";
import { areaHeads } from "../server/agents/heads.ts";
import { ensureAgents, updateAgent } from "../server/agents/agents.ts";

const s = (id: string, areaId: string | null, parentSeatId: string | null, holderProfileId: string | null, position = 0, title = id) => ({
  id,
  areaId,
  parentSeatId,
  holderProfileId,
  position,
  title,
});

describe("areaHeads", () => {
  it("WHEN el asiento raíz del área tiene titular y hay un hijo de la misma área THE SYSTEM SHALL dar al titular raíz", () => {
    const heads = areaHeads([s("raiz", "A", "ceo", "ana"), s("hijo", "A", "raiz", "beto"), s("ceo", null, null, "dueno")]);
    expect(heads.get("A")).toBe("ana");
  });

  it("WHEN el asiento superior no tiene titular THE SYSTEM SHALL no dar jefe para esa área", () => {
    const heads = areaHeads([s("raiz", "A", null, null), s("hijo", "A", "raiz", "beto")]);
    expect(heads.has("A")).toBe(false);
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function orgConDosAreas() {
  const [org] = await db.insert(organization).values({ name: "t-agents", slug: `t-agents-${crypto.randomUUID()}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ids = { owner: crypto.randomUUID(), jefaA: crypto.randomUUID(), jefeB: crypto.randomUUID() };
  const entries = Object.entries(ids);
  await db.insert(profile).values(entries.map(([, id]) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  await db
    .insert(membership)
    .values(entries.map(([k, id]) => ({ userId: id, orgId: org.id, role: k === "owner" ? "owner" : "employee", acceptedAt: new Date() })));
  const [a, b] = await db
    .insert(area)
    .values([
      { orgId: org.id, name: "Cocina", color: "verde" },
      { orgId: org.id, name: "Caja", color: "azul" },
    ])
    .returning();
  const [seatA] = await db
    .insert(seat)
    .values([
      { orgId: org.id, areaId: a!.id, title: "Jefa de cocina", holderProfileId: ids.jefaA },
      { orgId: org.id, areaId: b!.id, title: "Jefe de caja", holderProfileId: ids.jefeB },
    ])
    .returning();
  return { orgId: org.id, areaA: a!.id, seatA: seatA!.id, ...ids };
}

const kinds = async (orgId: string) =>
  (await db.select({ kind: agent.kind }).from(agent).where(eq(agent.orgId, orgId))).map((a) => a.kind).sort();

describe("ensureAgents", () => {
  it("WHEN corre dos veces con dos áreas con jefe THE SYSTEM SHALL dejar 1 manager, 1 recepción, 2 especialistas y 1 general completo", async () => {
    const { orgId, owner } = await orgConDosAreas();
    expect((await ensureAgents(owner, orgId)).ok).toBe(true);
    expect((await ensureAgents(owner, orgId)).ok).toBe(true);
    expect(await kinds(orgId)).toEqual(["especialista", "especialista", "manager", "recepcion"]);
    const generales = await db.select().from(channel).where(and(eq(channel.orgId, orgId), eq(channel.kind, "general")));
    expect(generales).toHaveLength(1);
    expect(await db.select().from(channelMember).where(eq(channelMember.channelId, generales[0]!.id))).toHaveLength(3);
  });

  it("WHEN el jefe deja su asiento THE SYSTEM SHALL borrar el especialista de esa área", async () => {
    const { orgId, owner, areaA, seatA } = await orgConDosAreas();
    await ensureAgents(owner, orgId);
    await db.update(seat).set({ holderProfileId: null }).where(eq(seat.id, seatA));
    await ensureAgents(owner, orgId);
    const especialistas = await db
      .select({ areaId: agent.areaId })
      .from(agent)
      .where(and(eq(agent.orgId, orgId), eq(agent.kind, "especialista")));
    expect(especialistas).toHaveLength(1);
    expect(especialistas[0]?.areaId).not.toBe(areaA);
  });

  it("WHEN un empleado llama ensureAgents o updateAgent THE SYSTEM SHALL dar NOT_FOUND sin escribir", async () => {
    const { orgId, owner, jefaA } = await orgConDosAreas();
    expect(await ensureAgents(jefaA, orgId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await kinds(orgId)).toEqual([]);
    const listo = await ensureAgents(owner, orgId);
    if (!listo.ok) throw new Error(listo.error.message);
    const manager = listo.data.find((a) => a.kind === "manager")!;
    expect(await updateAgent(jefaA, orgId, manager.id, { instructions: "x", skills: [] })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    const [row] = await db.select().from(agent).where(eq(agent.id, manager.id));
    expect(row?.instructions).toBe("");
  });
});
