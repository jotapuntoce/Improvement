// El catálogo de acciones del copiloto y sus permisos: qué hace Improvement solo, qué deja propuesto,
// y que siempre actúa con los permisos de la persona (nunca más).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile, recordActivity, task, taskStep } from "@jotapuntoce/db/schema";
import { createCustomApp } from "../server/apps/custom.ts";
import { createRecord, getRecord } from "../server/apps/records.ts";
import { getModes, setMode } from "../server/tasks/actions.ts";
import { addStep, appendImprovementSteps, approveStep, completeStep, rejectStep, runImprovementStep } from "../server/tasks/steps.ts";
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
/** Org con una app propia "Pacientes" (Nuevo → En consulta), un registro y una tarea del dueño sobre él. */
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-act", slug: `t-act-${crypto.randomUUID()}` }).returning();
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
  return { orgId, owner, emp, appKey: app.data.key, recordId: rec.data.id, taskId: t.data.id };
}
async function improvementStep(orgId: string, taskId: string, action: "mover_etapa" | "nota" | "borrador_mensaje", payload: Record<string, unknown>) {
  const [id] = await appendImprovementSteps(orgId, taskId, [{ title: `Paso ${action}`, kind: "improvement", action, payload }]);
  return id!;
}
const stepOf = async (id: string) => (await db.select().from(taskStep).where(eq(taskStep.id, id)))[0]!;
const notes = async (recordId: string) => (await db.select({ body: recordActivity.body }).from(recordActivity).where(eq(recordActivity.recordId, recordId))).map((n) => n.body);

describe("acciones del copiloto", () => {
  it("WHEN un paso de Improvement corre con el permiso por defecto THE SYSTEM SHALL dejarlo propuesto sin ejecutar", async () => {
    const { orgId, owner, appKey, recordId, taskId } = await setup();
    expect((await getModes(owner, orgId)).mover_etapa).toBe("siempre");
    const id = await improvementStep(orgId, taskId, "mover_etapa", { stage: "en_consulta" });
    expect(await runImprovementStep(owner, orgId, id)).toEqual({ ok: true, data: { status: "propuesto" } });
    const rec = await getRecord(owner, orgId, appKey, recordId);
    expect(rec.ok && rec.data.stage).toBe("nuevo");
  });

  it("WHEN aprueba con 'la primera vez' THE SYSTEM SHALL ejecutar, pasar a 'hazlo solo' y correr solo el siguiente", async () => {
    const { orgId, owner, recordId, taskId } = await setup();
    await setMode(owner, orgId, "nota", "primera_vez");
    const first = await improvementStep(orgId, taskId, "nota", { body: "Primera nota" });
    await runImprovementStep(owner, orgId, first);
    expect((await approveStep(owner, orgId, first)).ok).toBe(true);
    expect((await getModes(owner, orgId)).nota).toBe("solo");
    const second = await improvementStep(orgId, taskId, "nota", { body: "Segunda nota" });
    expect(await runImprovementStep(owner, orgId, second)).toEqual({ ok: true, data: { status: "hecho" } });
    expect(await stepOf(second)).toMatchObject({ status: "hecho", doneBy: "improvement" });
    expect(await notes(recordId)).toEqual(expect.arrayContaining(["Primera nota", "Segunda nota"]));
  }, 60_000); // muchas idas y vueltas al Supabase remoto

  it("WHEN la acción toca un registro que la persona no puede escribir THE SYSTEM SHALL negarlo y dejar el paso propuesto", async () => {
    const { orgId, owner, emp, appKey, recordId } = await setup();
    // El empleado no tiene la sección de aplicaciones: el dueño no le puede asignar sobre ese registro,
    // así que la tarea se inserta directo para probar la segunda puerta (executeAction como la persona).
    const [t] = await db.insert(task).values({ orgId, assigneeId: emp, title: "Mover", source: "dueno", appKey, recordId, createdBy: owner }).returning();
    await setMode(emp, orgId, "mover_etapa", "solo");
    const id = await improvementStep(orgId, t!.id, "mover_etapa", { stage: "en_consulta" });
    expect(await runImprovementStep(emp, orgId, id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await stepOf(id)).status).toBe("propuesto");
  });

  it("WHEN el payload no cumple su esquema THE SYSTEM SHALL rechazar el paso", async () => {
    const { orgId, taskId } = await setup();
    await expect(appendImprovementSteps(orgId, taskId, [{ title: "x", kind: "improvement", action: "nota", payload: { body: "" } }])).rejects.toThrow();
  });

  it("WHEN se ejecuta un borrador de mensaje THE SYSTEM SHALL guardar el texto y no enviar nada", async () => {
    const { orgId, owner, taskId } = await setup();
    const id = await improvementStep(orgId, taskId, "borrador_mensaje", { to: "Dueña de Firulais", body: "Su cita es mañana a las 10." });
    await runImprovementStep(owner, orgId, id);
    expect((await approveStep(owner, orgId, id)).ok).toBe(true);
    expect((await stepOf(id)).result).toContain("Su cita es mañana a las 10.");
  });

  it("WHEN la persona completa o rechaza pasos THE SYSTEM SHALL dejar la evidencia en la bitácora; otro no puede tocarlos", async () => {
    const { orgId, owner, emp, recordId, taskId } = await setup();
    const mine = await addStep(owner, orgId, taskId, { title: "Llamar a la dueña" });
    if (!mine.ok) throw new Error(mine.error.message);
    expect(await completeStep(emp, orgId, mine.data.id, "x")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect((await completeStep(owner, orgId, mine.data.id, "Confirmó la cita")).ok).toBe(true);
    expect(await notes(recordId)).toContain("Paso: Llamar a la dueña — Confirmó la cita");
    const ia = await improvementStep(orgId, taskId, "nota", { body: "No" });
    expect((await rejectStep(owner, orgId, ia)).ok).toBe(true);
    expect((await stepOf(ia)).status).toBe("rechazado");
  });
});
