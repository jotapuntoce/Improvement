// Esquema de tareas y automatizaciones contra el Supabase de desarrollo: checks y RLS por persona.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agentPermission, automationRule, automationRun, membership, organization, profile, task, taskStep } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function member(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-tsk", slug: `t-tsk-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return { orgId: o!.id, owner: await member(o!.id, "owner"), ana: await member(o!.id, "employee"), luis: await member(o!.id, "employee") };
}
// Mismo helper que import-schema.test.ts: corre la consulta como `authenticated` con ese uid.
async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

describe("esquema de tareas y automatizaciones", () => {
  it("WHEN alguien consulta tareas y pasos por PostgREST THE SYSTEM SHALL darle solo los suyos, y al dueño todos", async () => {
    const { orgId, owner, ana, luis } = await setup();
    const [t] = await db.insert(task).values({ orgId, assigneeId: ana, title: "Llamar", source: "propia" }).returning();
    await db.insert(taskStep).values({ orgId, taskId: t!.id, position: 0, title: "Marcar", kind: "persona" });
    for (const table of ["task", "task_step"]) {
      expect(await asUser(ana, `select 1 from ${table} where org_id = '${orgId}'`)).toHaveLength(1);
      expect(await asUser(owner, `select 1 from ${table} where org_id = '${orgId}'`)).toHaveLength(1);
      expect(await asUser(luis, `select 1 from ${table} where org_id = '${orgId}'`)).toHaveLength(0);
    }
  });

  it("WHEN un empleado consulta reglas, corridas o permisos ajenos THE SYSTEM SHALL no devolverle nada", async () => {
    const { orgId, owner, ana, luis } = await setup();
    const [rule] = await db.insert(automationRule).values({ orgId, appKey: "clientes", name: "R", trigger: { type: "creado" }, actions: [] }).returning();
    await db.insert(automationRun).values({ orgId, ruleId: rule!.id, recordId: crypto.randomUUID(), depth: 0, outcome: "prueba", detail: "x", day: "2026-10-27" });
    await db.insert(agentPermission).values({ orgId, userId: ana, action: "nota", mode: "solo" });
    for (const table of ["automation_rule", "automation_run"]) {
      expect(await asUser(owner, `select 1 from ${table} where org_id = '${orgId}'`)).toHaveLength(1);
      expect(await asUser(ana, `select 1 from ${table} where org_id = '${orgId}'`)).toHaveLength(0);
    }
    expect(await asUser(ana, `select 1 from agent_permission where org_id = '${orgId}'`)).toHaveLength(1);
    expect(await asUser(luis, `select 1 from agent_permission where org_id = '${orgId}'`)).toHaveLength(0);
  });

  it("WHEN un estado no es del catálogo o el cron repite el mismo día THE SYSTEM SHALL rechazarlo en la base", async () => {
    const { orgId, ana } = await setup();
    await expect(db.insert(task).values({ orgId, assigneeId: ana, title: "x", source: "otra" as "propia" })).rejects.toThrow();
    const [rule] = await db.insert(automationRule).values({ orgId, appKey: "clientes", name: "R", trigger: { type: "creado" }, actions: [] }).returning();
    const run = { orgId, ruleId: rule!.id, recordId: crypto.randomUUID(), depth: 0, outcome: "hecho" as const, detail: "x", day: "2026-10-27" };
    await db.insert(automationRun).values(run);
    await expect(db.insert(automationRun).values(run)).rejects.toThrow();
    await db.insert(automationRun).values({ ...run, depth: 1 }); // las cadenas no cuentan para la idempotencia
  });
});
