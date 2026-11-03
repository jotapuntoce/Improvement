// La burbuja contra el Supabase de desarrollo: apuntar, conversar como dueño o como empleado (con un
// proveedor simulado que guarda el prompt), la falla de la IA y la RLS de agent_message.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agentMessage, membership, organization, ownerMemory, permissionType, profile, task } from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { ask, jot, listMessages } from "../server/conversation/agent.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee", tipo?: string) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com`, fullName: role === "owner" ? "Jaime" : "Ana" });
  profileIds.push(id);
  const [t] = tipo ? await db.insert(permissionType).values({ orgId, name: tipo, grants: { clientes: "empresa" } }).returning() : [];
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date(), permissionTypeId: t?.id });
  return id;
}
async function org() {
  const [o] = await db.insert(organization).values({ name: "t-conv", slug: `t-conv-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return o!.id;
}
class FakeAi implements SuggestionProvider {
  prompts: string[] = [];
  systems: string[] = [];
  constructor(private readonly reply: unknown) {}
  async complete(system: string, prompt: string): Promise<SuggestionCompletion> {
    this.systems.push(system);
    this.prompts.push(prompt);
    if (this.reply instanceof Error) throw this.reply;
    return { text: JSON.stringify(this.reply), usage: { inputTokens: 200, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 }, finishReason: "end_turn" };
  }
}
/** Los user_id de agent_message que ve la persona como `authenticated` (la puerta de PostgREST). */
async function asUser(userId: string, orgId: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = (await tx.execute(sql`select user_id from agent_message where org_id = ${orgId}`)) as unknown as { user_id: string }[];
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return [...rows].map((r) => r.user_id);
  });
}

describe("burbuja", () => {
  it("WHEN la persona apunta algo THE SYSTEM SHALL crear una tarea propia abierta", async () => {
    const orgId = await org();
    const ana = await person(orgId, "employee", "Recepción");
    const r = await jot(ana, orgId, "Llamar a Rosa");
    if (!r.ok) throw new Error(r.error.message);
    const [t] = await db.select().from(task).where(eq(task.id, r.data.id));
    expect(t).toMatchObject({ title: "Llamar a Rosa", assigneeId: ana, source: "propia", status: "abierta" });
  });

  it("WHEN un empleado pregunta THE SYSTEM SHALL guardar los dos mensajes y mandar su rol y sus apps", async () => {
    const orgId = await org();
    const ana = await person(orgId, "employee", "Recepción");
    const ai = new FakeAi({ respuesta: "Hoy toca confirmar citas." });
    const r = await ask(ana, orgId, "¿Qué hago primero?", ai);
    expect(r.ok ? r.data.body : null).toBe("Hoy toca confirmar citas.");
    expect(ai.prompts[0]).toContain("Rol: Recepción");
    expect(ai.prompts[0]).toContain("Clientes");
    expect(ai.systems[0]).toContain("agente");
    expect((await listMessages(ana, orgId)).map((m) => m.role)).toEqual(["persona", "improvement"]);
  });

  it("WHEN el dueño pregunta THE SYSTEM SHALL mandar su memoria de dueño y no un rol", async () => {
    const orgId = await org();
    const jaime = await person(orgId, "owner");
    await db.insert(ownerMemory).values({ orgId, ownerId: jaime, question: "¿Qué quieres?", answer: "Abrir otra sucursal" });
    const ai = new FakeAi({ respuesta: "Vamos por la sucursal." });
    await ask(jaime, orgId, "¿Qué sigue?", ai);
    expect(ai.prompts[0]).toContain("Abrir otra sucursal");
    expect(ai.prompts[0]).not.toContain("Rol:");
    expect(ai.systems[0]).toContain("director general");
  });

  it("WHEN la IA falla THE SYSTEM SHALL guardar la pregunta y responder AI_UNAVAILABLE", async () => {
    const orgId = await org();
    const ana = await person(orgId, "employee", "Recepción");
    const r = await ask(ana, orgId, "¿Qué hago?", new FakeAi(new Error("caído")));
    expect(r.ok ? null : r.error.code).toBe("AI_UNAVAILABLE");
    expect((await listMessages(ana, orgId)).map((m) => m.body)).toEqual(["¿Qué hago?"]);
  });

  it("WHEN dueño y empleado leen agent_message como authenticated THE SYSTEM SHALL darle a cada quien solo lo suyo", async () => {
    const orgId = await org();
    const jaime = await person(orgId, "owner");
    const ana = await person(orgId, "employee", "Recepción");
    await db.insert(agentMessage).values([
      { orgId, userId: jaime, role: "persona", body: "del dueño" },
      { orgId, userId: ana, role: "persona", body: "de Ana" },
    ]);
    expect(await asUser(ana, orgId)).toEqual([ana]);
    expect(await asUser(jaime, orgId)).toEqual([jaime]);
    expect(await db.select().from(agentMessage).where(eq(agentMessage.orgId, orgId))).toHaveLength(2);
  });
});
