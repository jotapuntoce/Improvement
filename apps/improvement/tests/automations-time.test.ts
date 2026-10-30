// Los disparadores de tiempo que corre el cron diario: por fecha de un campo y por días sin
// actividad, una sola vez por día; y la ruta que los corre, cerrada con CRON_SECRET.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appRecord, automationRun, membership, organization, profile, recordActivity, task } from "@jotapuntoce/db/schema";
import { GET } from "../app/api/cron/automatizaciones/route.ts";
import { createCustomApp } from "../server/apps/custom.ts";
import { addField } from "../server/apps/fields.ts";
import { createRecord, saveCustomValues } from "../server/apps/records.ts";
import { cdmxDay, runTimeTriggers } from "../server/automations/engine.ts";
import { createRule, setRuleStatus } from "../server/automations/rules.ts";

const DAY = 86_400_000;
const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-cron", slug: `t-cron-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const orgId = o!.id;
  const owner = crypto.randomUUID();
  await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
  profileIds.push(owner);
  await db.insert(membership).values({ userId: owner, orgId, role: "owner", acceptedAt: new Date() });
  const app = await createCustomApp(owner, orgId, { name: "Pedidos", groupName: "Operación", stages: ["Nuevo", "Entregado"] });
  if (!app.ok) throw new Error(app.error.message);
  const f = await addField(owner, orgId, app.data.key, { label: "Entrega", type: "fecha" });
  if (!f.ok) throw new Error(f.error.message);
  return { orgId, owner, appKey: app.data.key };
}
async function newRecord(owner: string, orgId: string, appKey: string, title: string) {
  const r = await createRecord(owner, orgId, appKey, title);
  if (!r.ok) throw new Error(r.error.message);
  return r.data.id;
}
async function activeRule(owner: string, orgId: string, appKey: string, trigger: unknown) {
  const r = await createRule(owner, orgId, { name: "Por tiempo", appKey, trigger, conditions: [], actions: [{ type: "crear_tarea", assigneeId: owner, title: "Revisar" }] });
  if (!r.ok) throw new Error(r.error.message);
  await setRuleStatus(owner, orgId, r.data.id, "activa");
  return r.data.id;
}
const tasksFor = async (orgId: string) => (await db.select({ recordId: task.recordId }).from(task).where(eq(task.orgId, orgId))).map((t) => t.recordId);

describe("disparadores de tiempo", () => {
  it("WHEN la entrega es en 2 días y la regla dice -2 THE SYSTEM SHALL actuar una vez; repetir el mismo día no duplica", async () => {
    const { orgId, owner, appKey } = await setup();
    const now = new Date();
    const pronto = await newRecord(owner, orgId, appKey, "Pastel");
    const luego = await newRecord(owner, orgId, appKey, "Galletas");
    await saveCustomValues(owner, orgId, appKey, pronto, { entrega: cdmxDay(new Date(now.getTime() + 2 * DAY)) });
    await saveCustomValues(owner, orgId, appKey, luego, { entrega: cdmxDay(new Date(now.getTime() + 5 * DAY)) });
    const ruleId = await activeRule(owner, orgId, appKey, { type: "fecha", field: "entrega", days: -2 });
    await runTimeTriggers(now);
    await runTimeTriggers(now);
    expect(await tasksFor(orgId)).toEqual([pronto]);
    expect((await db.select().from(automationRun).where(eq(automationRun.ruleId, ruleId))).map((r) => r.outcome)).toEqual(["hecho"]);
  }, 90_000);

  it("WHEN un registro lleva 7 días sin actividad THE SYSTEM SHALL actuar; con actividad de ayer, no", async () => {
    const { orgId, owner, appKey } = await setup();
    const quieto = await newRecord(owner, orgId, appKey, "Olvidado");
    const movido = await newRecord(owner, orgId, appKey, "Reciente");
    const hace = (days: number) => new Date(Date.now() - days * DAY);
    await db.update(appRecord).set({ updatedAt: hace(8) }).where(sql`${appRecord.id} in (${quieto}, ${movido})`);
    await db.update(recordActivity).set({ createdAt: hace(8) }).where(eq(recordActivity.recordId, quieto));
    await db.update(recordActivity).set({ createdAt: hace(1) }).where(eq(recordActivity.recordId, movido));
    await activeRule(owner, orgId, appKey, { type: "sin_actividad", days: 7 });
    await runTimeTriggers();
    expect(await tasksFor(orgId)).toEqual([quieto]);
  }, 90_000);

  it("WHEN la ruta llega sin el bearer correcto THE SYSTEM SHALL responder 401", async () => {
    expect((await GET(new Request("http://localhost/api/cron/automatizaciones"))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/cron/automatizaciones", { headers: { authorization: "Bearer no" } }))).status).toBe(401);
  });
});
