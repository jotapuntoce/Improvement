// Hiperpersonalización sin IA: lo que el dueño contó se vuelve sus tableros, su proceso conectado y
// la estructura interna que su etapa necesita.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appRecord, orgNeed, organization, profile, task } from "@jotapuntoce/db/schema";
import { createOwnBusiness } from "../server/registro/business.ts";
import { finishOnboarding, loadProposal } from "../server/registro/onboarding.ts";
import { NEGOCIO_QUESTIONS, saveInterview } from "../server/owner/diagnostico.ts";
import { lines, personalApps, prescribe, prescribeStructure, step } from "../server/owner/estructura.ts";
import { createRecord, moveRecord } from "../server/apps/records.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function business(industry: string, teamSize = "solo") {
  const u = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` };
  profileIds.push(u.id);
  const r = await createOwnBusiness(u, { fullName: "Ana", name: "Negocio", industry, teamSize, city: "León" });
  if (!r.ok) throw new Error(r.error.message);
  orgIds.push(r.data.orgId);
  return { owner: u.id, orgId: r.data.orgId };
}

describe("lo que cuenta el dueño, en limpio", () => {
  it("WHEN escribe sus pasos en renglones, con flechas o con comas THE SYSTEM SHALL leer los mismos pasos", () => {
    expect(lines("Me escribe\n2. Le cotizo\n- Anticipo")).toEqual(["Me escribe", "Le cotizo", "Anticipo"]);
    expect(lines("Me escribe → le cotizo → anticipo")).toEqual(["Me escribe", "le cotizo", "anticipo"]);
    expect(lines("Me escribe, le cotizo, anticipo")).toEqual(["Me escribe", "le cotizo", "anticipo"]);
    expect(step("Diseño: medir y mandar el plano")).toEqual({ name: "Diseño", task: "medir y mandar el plano" });
    expect(step("Fabricación")).toEqual({ name: "Fabricación", task: null });
  });

  it("WHEN cuenta sus pasos, servicios e inventario THE SYSTEM SHALL proponerle sus propios tableros", () => {
    const apps = personalApps({ prospecto: "Me escribe\nLe cotizo", servicios: "Cocinas\nClósets", trabajo: "Diseño: medir\nFabricación", inventario: "Sí, madera" });
    expect(apps.map((a) => a.name)).toEqual(["Prospectos", "Trabajos", "Inventario"]);
    expect(apps[0]!.stages).toEqual(["Me escribe", "Le cotizo"]);
    expect(apps[1]!.fields[0]).toEqual({ label: "Servicio", type: "opcion", options: ["Cocinas", "Clósets"] });
    expect(apps[1]!.tasks).toEqual(["medir", null]);
    expect(personalApps({ inventario: "No" })).toEqual([]);
  });

  it("WHEN Improvement prescribe THE SYSTEM SHALL encender la estructura según la etapa, sus capas y lo que dijo el dueño", () => {
    const nano = prescribe({ industry: "servicios", teamSize: "solo" }, {}).map((p) => p.title);
    expect(nano).toContain("Validar vendiendo antes de invertir");
    expect(nano).not.toContain("Junta semanal de revisión del plan");
    const pequena = prescribe({ industry: "manufactura", teamSize: "6-20" }, { inventario: "sí", areas: "Ventas: yo\nAdministración: nadie", ausencia: "Las cotizaciones" });
    const titles = pequena.map((p) => p.title);
    expect(titles).toEqual(expect.arrayContaining([
      "Junta semanal de revisión del plan", "Permisos por rol y separación de funciones", "Seguridad, calidad y mantenimiento",
      "Existencias con mínimo y punto de reorden", "Nadie lleva administración", "Lo que depende solo de ti",
    ]));
    expect(titles).not.toContain("Validar vendiendo antes de invertir");
    expect(titles).not.toContain("Nadie lleva ventas");
  });
});

describe("el arranque arma su Improvement", () => {
  const q = (name: string) => NEGOCIO_QUESTIONS.find((x) => x.name === name)!.name;

  it("WHEN acepta sus tableros y un prospecto se vuelve cliente THE SYSTEM SHALL abrir su trabajo con las tareas de cada paso", async () => {
    const { owner, orgId } = await business("manufactura");
    await saveInterview(owner, orgId, "negocio", {
      [q("prospecto")]: "Me escribe\nLe cotizo\nPaga el anticipo",
      [q("servicios")]: "Cocinas\nClósets",
      [q("trabajo")]: "Diseño: medir\nFabricación\nInstalación: agendar con el cliente",
    });
    const p = await loadProposal(owner, orgId);
    if (!p.ok) throw new Error(p.error.message);
    expect(p.data.apps.slice(0, 2).map((a) => a.name)).toEqual(["Prospectos", "Trabajos"]);
    expect((await finishOnboarding(owner, orgId, p.data.apps.slice(0, 2))).ok).toBe(true);

    const lead = await createRecord(owner, orgId, "prospectos", "Familia López");
    if (!lead.ok) throw new Error(lead.error.message);
    expect((await moveRecord(owner, orgId, "prospectos", lead.data.id, "paga-el-anticipo")).ok).toBe(true);

    const [trabajos] = await db.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, "trabajos")));
    const [job] = await db.select().from(appRecord).where(eq(appRecord.appId, trabajos!.id));
    expect(job).toMatchObject({ title: "Familia López", stage: "diseno" });
    expect((await db.select({ title: task.title }).from(task).where(eq(task.orgId, orgId))).map((t) => t.title)).toEqual(["medir — Familia López"]);

    await moveRecord(owner, orgId, "trabajos", job!.id, "instalacion");
    const tareas = (await db.select({ title: task.title }).from(task).where(eq(task.orgId, orgId))).map((t) => t.title);
    expect(tareas).toContain("agendar con el cliente — Familia López");
  });

  it("WHEN termina la entrevista THE SYSTEM SHALL dejar su estructura como necesidades una sola vez, y a un extraño nada", async () => {
    const { owner, orgId } = await business("servicios", "2-5");
    await saveInterview(owner, orgId, "negocio", { [q("areas")]: "Cobranza: nadie" });
    const first = await prescribeStructure(owner, orgId);
    expect(first).toBeGreaterThan(0);
    expect(await prescribeStructure(owner, orgId)).toBe(0);
    const needs = await db.select({ title: orgNeed.title, source: orgNeed.source }).from(orgNeed).where(eq(orgNeed.orgId, orgId));
    expect(needs.map((n) => n.title)).toEqual(expect.arrayContaining(["Corte de caja diario y pendientes críticos", "Nadie lleva cobranza"]));
    await expect(prescribeStructure(crypto.randomUUID(), orgId)).rejects.toThrow();
  });
});
