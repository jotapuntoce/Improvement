// El motor de automatizaciones contra el Supabase de desarrollo: reglas que nacen en prueba, que
// actúan como el dueño solo cuando están activas, condiciones, el tope de 3 niveles y errores que
// nunca tumban el guardado original.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { automationRun, membership, organization, profile, recordActivity, task } from "@jotapuntoce/db/schema";
import { createCustomApp } from "../server/apps/custom.ts";
import { addField } from "../server/apps/fields.ts";
import { createRecord, getRecord, moveRecord, saveCustomValues } from "../server/apps/records.ts";
import { createRule, setRuleStatus, testRule } from "../server/automations/rules.ts";

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
/** Org con "Pacientes" (Nuevo → En consulta → Alta), un campo "Monto" y un registro. */
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-auto", slug: `t-auto-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const orgId = o!.id;
  const owner = await person(orgId, "owner");
  const emp = await person(orgId, "employee");
  const app = await createCustomApp(owner, orgId, { name: "Pacientes", groupName: "Operación", stages: ["Nuevo", "En consulta", "Alta"] });
  if (!app.ok) throw new Error(app.error.message);
  const f = await addField(owner, orgId, app.data.key, { label: "Monto", type: "numero" });
  if (!f.ok) throw new Error(f.error.message);
  const rec = await createRecord(owner, orgId, app.data.key, "Firulais");
  if (!rec.ok) throw new Error(rec.error.message);
  return { orgId, owner, emp, appKey: app.data.key, recordId: rec.data.id };
}
const tareaAlConsultar = (appKey: string, assigneeId: string, conditions: unknown[] = []) => ({
  name: "Atender en consulta",
  appKey,
  trigger: { type: "etapa", to: "en-consulta" },
  conditions,
  actions: [{ type: "crear_tarea", assigneeId, title: "Revisar al paciente" }],
});
const runs = (ruleId: string) => db.select().from(automationRun).where(eq(automationRun.ruleId, ruleId));
const tasksOf = (orgId: string) => db.select().from(task).where(eq(task.orgId, orgId));

describe("automatizaciones", () => {
  it("WHEN la regla está en prueba THE SYSTEM SHALL registrar lo que haría sin hacerlo; activa, crea la tarea y deja la bitácora", async () => {
    const { orgId, owner, appKey, recordId } = await setup();
    const rule = await createRule(owner, orgId, tareaAlConsultar(appKey, owner));
    if (!rule.ok) throw new Error(rule.error.message);
    expect((await moveRecord(owner, orgId, appKey, recordId, "en-consulta")).ok).toBe(true);
    expect((await runs(rule.data.id)).map((r) => r.outcome)).toEqual(["prueba"]);
    expect(await tasksOf(orgId)).toEqual([]);

    expect((await setRuleStatus(owner, orgId, rule.data.id, "activa")).ok).toBe(true);
    await moveRecord(owner, orgId, appKey, recordId, "nuevo");
    await moveRecord(owner, orgId, appKey, recordId, "en-consulta");
    const [t] = await tasksOf(orgId);
    expect(t).toMatchObject({ assigneeId: owner, title: "Revisar al paciente", source: "automatizacion", ruleId: rule.data.id, recordId });
    const log = await db.select({ body: recordActivity.body }).from(recordActivity).where(eq(recordActivity.recordId, recordId));
    expect(log.map((l) => l.body)).toContain("Automatización «Atender en consulta»: crear tarea «Revisar al paciente»");
  }, 60_000);

  it("WHEN no se cumple una condición THE SYSTEM SHALL no actuar; testRule lista solo los que cumplen, sin escribir", async () => {
    const { orgId, owner, appKey, recordId } = await setup();
    const otro = await createRecord(owner, orgId, appKey, "Michi");
    if (!otro.ok) throw new Error(otro.error.message);
    await saveCustomValues(owner, orgId, appKey, otro.data.id, { monto: 5000 });
    await saveCustomValues(owner, orgId, appKey, recordId, { monto: 200 });
    const rule = await createRule(owner, orgId, tareaAlConsultar(appKey, owner, [{ field: "monto", op: "mayor", value: 1000 }]));
    if (!rule.ok) throw new Error(rule.error.message);
    await setRuleStatus(owner, orgId, rule.data.id, "activa");
    expect(await testRule(owner, orgId, rule.data.id)).toEqual({ ok: true, data: { matches: [{ id: otro.data.id, title: "Michi" }] } });
    await moveRecord(owner, orgId, appKey, recordId, "en-consulta");
    expect(await tasksOf(orgId)).toEqual([]);
    expect(await runs(rule.data.id)).toEqual([]);
  }, 60_000);

  it("WHEN dos reglas se disparan una a otra THE SYSTEM SHALL detenerse en el nivel 3 con una corrida tope", async () => {
    const { orgId, owner, appKey, recordId } = await setup();
    const ida = await createRule(owner, orgId, { name: "Ida", appKey, trigger: { type: "etapa", to: "en-consulta" }, conditions: [], actions: [{ type: "mover_etapa", stage: "alta" }] });
    const vuelta = await createRule(owner, orgId, { name: "Vuelta", appKey, trigger: { type: "etapa", to: "alta" }, conditions: [], actions: [{ type: "mover_etapa", stage: "en-consulta" }] });
    if (!ida.ok || !vuelta.ok) throw new Error("no se crearon");
    await setRuleStatus(owner, orgId, ida.data.id, "activa");
    await setRuleStatus(owner, orgId, vuelta.data.id, "activa");
    expect((await moveRecord(owner, orgId, appKey, recordId, "en-consulta")).ok).toBe(true);
    const all = await db.select({ outcome: automationRun.outcome, depth: automationRun.depth }).from(automationRun).where(eq(automationRun.orgId, orgId));
    expect(all.filter((r) => r.outcome === "hecho").map((r) => r.depth).sort()).toEqual([0, 1, 2]);
    expect(all.filter((r) => r.outcome === "tope")).toEqual([{ outcome: "tope", depth: 3 }]);
  }, 90_000);

  it("WHEN un empleado crea una regla o apunta a alguien de otro org THE SYSTEM SHALL negarlo", async () => {
    const { orgId, owner, emp, appKey } = await setup();
    expect(await createRule(emp, orgId, tareaAlConsultar(appKey, emp))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const otra = await setup();
    expect((await createRule(owner, orgId, tareaAlConsultar(appKey, otra.owner))).ok).toBe(false);
    expect((await createRule(owner, orgId, { ...tareaAlConsultar(appKey, owner), trigger: { type: "etapa", to: "no_existe" } })).ok).toBe(false);
  }, 60_000);

  it("WHEN la acción falla THE SYSTEM SHALL registrar error y el guardado original queda hecho", async () => {
    const { orgId, owner, emp, appKey, recordId } = await setup();
    // El empleado no ve la app: crear la tarea sobre ese registro falla.
    const rule = await createRule(owner, orgId, tareaAlConsultar(appKey, emp));
    if (!rule.ok) throw new Error(rule.error.message);
    await setRuleStatus(owner, orgId, rule.data.id, "activa");
    expect((await moveRecord(owner, orgId, appKey, recordId, "en-consulta")).ok).toBe(true);
    const rec = await getRecord(owner, orgId, appKey, recordId);
    expect(rec.ok && rec.data.stage).toBe("en-consulta");
    const [run] = await runs(rule.data.id);
    expect(run).toMatchObject({ outcome: "error" });
    expect(await db.select().from(task).where(and(eq(task.orgId, orgId), eq(task.assigneeId, emp)))).toEqual([]);
  }, 60_000);
});
