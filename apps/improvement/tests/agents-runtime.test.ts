// Runtime de agentes (oficinas-digitales paso 20): ruta con bearer, encargos, reporte y latido.
// Proveedor falso; base de desarrollo. runTarea va acotado al org de la prueba con deps.orgId.
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agent, agentTask, channel, membership, message, organization, profile, workerHeartbeat } from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { runTarea, workerStatus } from "../server/agents/runtime.ts";
import { createEncargo } from "../server/agents/tasks.ts";

class FakeProvider implements SuggestionProvider {
  constructor(private readonly payload: unknown) {}
  async complete(): Promise<SuggestionCompletion> {
    if (this.payload instanceof Error) throw this.payload;
    return {
      text: JSON.stringify(this.payload),
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
      finishReason: "end_turn",
    };
  }
}

const orgIds: string[] = [];
const profileIds: string[] = [];
const workers: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
  for (const w of workers.splice(0)) await db.delete(workerHeartbeat).where(eq(workerHeartbeat.worker, w));
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-runtime", slug: `t-runtime-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const owner = crypto.randomUUID();
  await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
  profileIds.push(owner);
  await db.insert(membership).values({ userId: owner, orgId: o.id, role: "owner", acceptedAt: new Date() });
  const [manager] = await db
    .insert(agent)
    .values([
      { orgId: o.id, kind: "manager", ownerProfileId: owner, name: "Improvement" },
      { orgId: o.id, kind: "recepcion", ownerProfileId: owner, name: "Recepción" },
    ])
    .returning();
  const [general] = await db.insert(channel).values({ orgId: o.id, kind: "general", name: "General" }).returning();
  return { orgId: o.id, owner, managerId: manager!.id, generalId: general!.id };
}

async function encargo(o: Awaited<ReturnType<typeof org>>) {
  const res = await createEncargo(o.owner, o.orgId, { body: "Resume las ventas de la semana" });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

const agentMessages = (channelId: string, agentId: string) =>
  db.select().from(message).where(and(eq(message.channelId, channelId), eq(message.authorAgentId, agentId)));

describe("ruta /api/agentes/[tarea]", () => {
  async function route() {
    vi.stubEnv("AGENTS_API_SECRET", "secreto-de-prueba");
    vi.resetModules();
    return import("@/app/api/agentes/[tarea]/route.ts");
  }
  const call = (POST: Awaited<ReturnType<typeof route>>["POST"], tarea: string, bearer: string) =>
    POST(new Request(`http://localhost/api/agentes/${tarea}`, { method: "POST", headers: { authorization: bearer } }), {
      params: Promise.resolve({ tarea }),
    });

  it("WHEN el bearer es incorrecto THE SYSTEM SHALL responder 401; correcto, 200 y latido", async () => {
    const { POST } = await route();
    expect((await call(POST, "heartbeat", "Bearer otro")).status).toBe(401);
    const antes = Date.now() - 1000;
    expect((await call(POST, "heartbeat", "Bearer secreto-de-prueba")).status).toBe(200);
    const [row] = await db.select().from(workerHeartbeat).where(eq(workerHeartbeat.worker, "agentes"));
    expect(row!.seenAt.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("WHEN la tarea no existe THE SYSTEM SHALL responder 404", async () => {
    const { POST } = await route();
    expect((await call(POST, "inventada", "Bearer secreto-de-prueba")).status).toBe(404);
  });
});

describe("runTarea", () => {
  it("WHEN el proveedor responde done THE SYSTEM SHALL dejar el encargo en hecho y publicar como el agente", async () => {
    const o = await org();
    const id = await encargo(o);
    const res = await runTarea("encargos", new Date(), { orgId: o.orgId, provider: new FakeProvider({ reply: "Vendieron 120 mil.", done: true }) });
    expect(res).toEqual({ procesadas: 1 });
    const [task] = await db.select().from(agentTask).where(eq(agentTask.id, id));
    expect(task?.status).toBe("hecho");
    const msgs = await agentMessages(task!.channelId!, o.managerId);
    expect(msgs.map((m) => m.body)).toContain("Vendieron 120 mil.");
  });

  it("WHEN el encargo falla en su tercer intento THE SYSTEM SHALL dejarlo fallido y avisar", async () => {
    const o = await org();
    const id = await encargo(o);
    await db.update(agentTask).set({ attempts: 2 }).where(eq(agentTask.id, id));
    await runTarea("encargos", new Date(), { orgId: o.orgId, provider: new FakeProvider(new Error("caído")) });
    const [task] = await db.select().from(agentTask).where(eq(agentTask.id, id));
    expect(task).toMatchObject({ status: "fallido", attempts: 3 });
    const msgs = await agentMessages(task!.channelId!, o.managerId);
    expect(msgs.map((m) => m.body)).toContain("No pude completar este encargo.");
  });

  it("WHEN reporte corre dos veces el mismo día después de las 08:00 THE SYSTEM SHALL publicar uno solo", async () => {
    const o = await org();
    const nueveMx = new Date("2026-11-19T15:00:00Z"); // 09:00 en America/Mexico_City
    const provider = new FakeProvider({ reporte: "Buenos días. Ayer no hubo encargos terminados." });
    expect(await runTarea("reporte", nueveMx, { orgId: o.orgId, provider })).toEqual({ publicados: 1 });
    expect(await runTarea("reporte", new Date(nueveMx.getTime() + 3_600_000), { orgId: o.orgId, provider })).toEqual({ publicados: 0 });
    expect(await agentMessages(o.generalId, o.managerId)).toHaveLength(1);
  });

  it("WHEN es antes de las 08:00 locales THE SYSTEM SHALL no publicar reporte", async () => {
    const o = await org();
    const sieteMx = new Date("2026-11-19T13:00:00Z");
    expect(await runTarea("reporte", sieteMx, { orgId: o.orgId, provider: new FakeProvider({ reporte: "x" }) })).toEqual({ publicados: 0 });
  });
});

describe("workerStatus", () => {
  it("WHEN el último latido fue hace 4 minutos THE SYSTEM SHALL dar stale; sin fila también", async () => {
    const worker = `t-worker-${crypto.randomUUID()}`;
    workers.push(worker);
    const now = new Date();
    await db.insert(workerHeartbeat).values({ worker, seenAt: new Date(now.getTime() - 4 * 60_000) });
    expect((await workerStatus(now, worker)).stale).toBe(true);
    await db.update(workerHeartbeat).set({ seenAt: now }).where(eq(workerHeartbeat.worker, worker));
    expect((await workerStatus(now, worker)).stale).toBe(false);
    expect((await workerStatus(now, `t-nadie-${crypto.randomUUID()}`)).stale).toBe(true);
  });
});
