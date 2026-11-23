// El copiloto de tareas con un proveedor simulado: parte la tarea en pasos, convierte en paso de la
// persona lo que el modelo armó mal, corre solo lo que ya tiene "hazlo solo" y nunca deja pasos a
// medias si la IA falla.
import { afterEach, describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile, recordActivity, taskStep } from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { createCustomApp } from "../server/apps/custom.ts";
import { createRecord } from "../server/apps/records.ts";
import { setMode } from "../server/tasks/actions.ts";
import { planTask } from "../server/tasks/copilot.ts";
import { createTask } from "../server/tasks/inbox.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-cop", slug: `t-cop-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const orgId = o!.id;
  const owner = await person(orgId, "owner");
  const emp = await person(orgId, "employee");
  const app = await createCustomApp(owner, orgId, { name: "Pacientes", groupName: "Operación", stages: ["Nuevo", "En consulta"] });
  if (!app.ok) throw new Error(app.error.message);
  const rec = await createRecord(owner, orgId, app.data.key, "Firulais");
  if (!rec.ok) throw new Error(rec.error.message);
  const t = await createTask(owner, orgId, { title: "Atender a Firulais", appKey: app.data.key, recordId: rec.data.id });
  if (!t.ok) throw new Error(t.error.message);
  return { orgId, owner, emp, recordId: rec.data.id, taskId: t.data.id };
}
class FakeAi implements SuggestionProvider {
  calls = 0;
  constructor(private readonly reply: unknown) {}
  async complete(): Promise<SuggestionCompletion> {
    this.calls++;
    if (this.reply instanceof Error) throw this.reply;
    return { text: JSON.stringify(this.reply), usage: { inputTokens: 500, outputTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 }, finishReason: "end_turn" };
  }
}
const steps = (taskId: string) => db.select().from(taskStep).where(eq(taskStep.taskId, taskId)).orderBy(asc(taskStep.position));

describe("copiloto de tareas", () => {
  it("WHEN prepara la tarea THE SYSTEM SHALL guardar los pasos en orden, los de Improvement propuestos y lo mal armado como paso de la persona", async () => {
    const { orgId, owner, taskId } = await setup();
    const ai = new FakeAi({
      steps: [
        { title: "Llamar a la dueña", kind: "persona" },
        { title: "Pasar a consulta", kind: "improvement", action: "mover_etapa", payload: { stage: "en_consulta" } },
        { title: "Volar el registro", kind: "improvement", action: "borrar_todo", payload: {} },
      ],
    });
    expect(await planTask(owner, orgId, taskId, ai)).toEqual({ ok: true, data: { steps: 3, done: 0 } });
    expect((await steps(taskId)).map((s) => [s.title, s.kind, s.action, s.status])).toEqual([
      ["Llamar a la dueña", "persona", null, "pendiente"],
      ["Pasar a consulta", "improvement", "mover_etapa", "propuesto"],
      ["Volar el registro", "persona", null, "pendiente"],
    ]);
    expect(await planTask(owner, orgId, taskId, ai)).toMatchObject({ ok: false, error: { message: "Ya está preparada." } });
    expect(ai.calls).toBe(1);
  }, 60_000);

  it("WHEN la persona ya dio 'hazlo solo' a notas THE SYSTEM SHALL escribir la nota al preparar", async () => {
    const { orgId, owner, recordId, taskId } = await setup();
    await setMode(owner, orgId, "nota", "solo");
    const ai = new FakeAi({ steps: [{ title: "Anotar", kind: "improvement", action: "nota", payload: { body: "Viene a las 10" } }, { title: "Recibirlo", kind: "persona" }] });
    expect(await planTask(owner, orgId, taskId, ai)).toEqual({ ok: true, data: { steps: 2, done: 1 } });
    const log = await db.select({ body: recordActivity.body }).from(recordActivity).where(eq(recordActivity.recordId, recordId));
    expect(log.map((l) => l.body)).toContain("Viene a las 10");
  }, 60_000);

  it("WHEN la IA falla THE SYSTEM SHALL no crear pasos y pedir que se agreguen a mano", async () => {
    const { orgId, owner, taskId } = await setup();
    expect(await planTask(owner, orgId, taskId, new FakeAi(new Error("caído")))).toMatchObject({
      ok: false,
      error: { message: "Improvement no pudo preparar la tarea ahora; agrega los pasos a mano." },
    });
    expect(await steps(taskId)).toEqual([]);
  });

  it("WHEN alguien que no tiene la tarea pide prepararla THE SYSTEM SHALL responder NOT_FOUND sin llamar a la IA", async () => {
    const { orgId, emp, taskId } = await setup();
    const ai = new FakeAi({ steps: [] });
    expect(await planTask(emp, orgId, taskId, ai)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(ai.calls).toBe(0);
  });
});
