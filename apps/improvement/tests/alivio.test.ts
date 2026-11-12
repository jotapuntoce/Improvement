// Lo que más le duele al dueño se vuelve su plan para quitarle carga: qué hace Improvement solo, qué
// delega, con qué se queda, y las apps con sus reglas que lo ejecutan.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appRecord, automationRule, objective, orgNeed, organization, profile, task } from "@jotapuntoce/db/schema";
import { createOwnBusiness } from "../server/registro/business.ts";
import { finishOnboarding, loadProposal } from "../server/registro/onboarding.ts";
import { saveInterview } from "../server/owner/diagnostico.ts";
import { prescribeRelief, reliefPlan, sucursales } from "../server/owner/alivio.ts";
import { createRecord, moveRecord } from "../server/apps/records.ts";

const TAQUERIA = {
  dolor: "Hago todo yo: los sueldos, los proveedores, el marketing, y ahora con dos sucursales no me da el día apagando fuegos",
  cargas: "Administración, Sueldos y nómina, Marketing y redes, Finanzas y caja, Proveedores y compras, Apagar fuegos",
  sucursales: "Centro\nCumbres",
  fuego: "Faltó un taquero y tuve que cubrir el turno",
  foco: "Abrir la tercera sucursal",
};

describe("el plan para quitarle carga", () => {
  it("WHEN dice sus sucursales de cualquier forma THE SYSTEM SHALL leer sus nombres", () => {
    expect(sucursales("Centro\nCumbres")).toEqual(["Centro", "Cumbres"]);
    expect(sucursales("2")).toEqual(["Sucursal 1", "Sucursal 2"]);
    expect(sucursales("No, solo una")).toEqual([]);
  });

  it("WHEN cuenta lo que le duele y lo que carga THE SYSTEM SHALL armar su plan, primero lo que duele, por sucursal", () => {
    const p = reliefPlan(TAQUERIA);
    const keys = p.jugadas.map((j) => j.key);
    expect(keys).toEqual(expect.arrayContaining(["nomina", "caja", "administracion", "proveedores", "marketing", "fuegos"]));
    expect(keys).not.toContain("inventario");
    // "cubrir el turno" en el último fuego no enciende Operación diaria: no la marcó.
    expect(keys).not.toContain("operacion");
    expect(reliefPlan({ fuego: "Se descompuso el refri" }).jugadas.map((j) => j.key)).toEqual(["fuegos"]);
    expect(p.jugadas.filter((j) => j.duele).map((j) => j.key)).toEqual(expect.arrayContaining(["nomina", "proveedores", "marketing", "fuegos"]));
    expect(p.jugadas[0]!.duele).toBe(true);
    expect(p.quedaTu[0]).toBe("Tu foco: Abrir la tercera sucursal");
    const nomina = p.apps.find((a) => a.relief === "nomina")!;
    expect(nomina.fields.at(-1)).toEqual({ label: "Sucursal", type: "opcion", options: ["Centro", "Cumbres"] });
  });

  it("WHEN no contó nada THE SYSTEM SHALL no inventarle un plan", () => {
    expect(reliefPlan({}).jugadas).toEqual([]);
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function taqueria() {
  const u = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` };
  profileIds.push(u.id);
  const r = await createOwnBusiness(u, { fullName: "Ana", name: "Taquería", industry: "restaurante", teamSize: "6-20", city: "Monterrey" });
  if (!r.ok) throw new Error(r.error.message);
  orgIds.push(r.data.orgId);
  return { owner: u.id, orgId: r.data.orgId };
}
const tareas = async (orgId: string) => (await db.select({ title: task.title }).from(task).where(eq(task.orgId, orgId))).map((t) => t.title);

describe("el arranque empieza por su dolor", () => {
  it("WHEN cuenta su dolor y acepta THE SYSTEM SHALL dejar necesidades, su foco como meta, las apps y las reglas que le quitan la carga", async () => {
    const { owner, orgId } = await taqueria();
    await saveInterview(owner, orgId, "dolor", { ...TAQUERIA, cargas: `${TAQUERIA.cargas}, Inventario, RH y contratación` });
    expect(await prescribeRelief(owner, orgId)).toBeGreaterThan(0);
    expect(await prescribeRelief(owner, orgId)).toBe(0);
    const needs = await db.select({ title: orgNeed.title, severity: orgNeed.severity }).from(orgNeed).where(eq(orgNeed.orgId, orgId));
    expect(needs).toContainEqual({ title: "Soltar: sueldos y nómina", severity: 3 });
    expect(needs.map((n) => n.title)).toContain("Soltar: RH y contratación");
    const metas = await db.select({ title: objective.title }).from(objective).where(eq(objective.orgId, orgId));
    expect(metas.map((m) => m.title)).toEqual(["Mi foco como director: Abrir la tercera sucursal"]);

    const p = await loadProposal(owner, orgId);
    if (!p.ok) throw new Error(p.error.message);
    // Con dos sucursales, todas las apps llevan Sucursal una vez, también las del giro.
    expect(p.data.apps.every((a) => a.fields.filter((f) => f.label === "Sucursal").length === 1)).toBe(true);
    const relief = p.data.apps.filter((a) => a.relief);
    expect(relief.map((a) => a.name)).toEqual(expect.arrayContaining(["Nómina", "Corte de caja", "Pedidos a proveedores", "Fuegos", "Inventario"]));
    // Renombra una: sus reglas igual se encienden.
    const picks = relief.map((a) => (a.relief === "fuegos" ? { ...a, name: "Bomberazos" } : a));
    expect((await finishOnboarding(owner, orgId, picks)).ok).toBe(true);

    const rules = await db.select({ name: automationRule.name, status: automationRule.status }).from(automationRule).where(eq(automationRule.orgId, orgId));
    expect(rules.every((r) => r.status === "activa")).toBe(true);
    expect(rules.map((r) => r.name)).toEqual(expect.arrayContaining(["Nómina: revisar 2 días antes", "Corte con diferencia", "Fuego sin atender", "Se acaba → su pedido"]));

    // Se acaba la carne → nace su pedido → tarea de mandarlo.
    const carne = await createRecord(owner, orgId, "inventario", "Carne al pastor");
    if (!carne.ok) throw new Error(carne.error.message);
    await moveRecord(owner, orgId, "inventario", carne.data.id, "por-pedir");
    const [ped] = await db.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, "pedidos-a-proveedores")));
    expect((await db.select({ title: appRecord.title }).from(appRecord).where(eq(appRecord.appId, ped!.id))).map((r) => r.title)).toEqual(["Carne al pastor"]);
    expect(await tareas(orgId)).toContain("Mandar el pedido — Carne al pastor");

    // Un corte con diferencia le llega como aviso; los que cuadran no.
    const corte = await createRecord(owner, orgId, "corte-de-caja", "Centro 12 nov");
    if (!corte.ok) throw new Error(corte.error.message);
    await moveRecord(owner, orgId, "corte-de-caja", corte.data.id, "con-diferencia");
    expect(await tareas(orgId)).toContain("Aviso: Corte con diferencia: Centro 12 nov");
  }, 180_000); // crea 7 apps contra el Supabase remoto
});
