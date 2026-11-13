// Quién se encarga de qué: el dueño invita a su equipo desde el arranque, cada persona recibe su
// agente con lo suyo, cuenta su trabajo, y las tareas de sus apps le llegan a ella.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agente, organization, profile, task } from "@jotapuntoce/db/schema";
import { createOwnBusiness } from "../server/registro/business.ts";
import { finishOnboarding, loadProposal } from "../server/registro/onboarding.ts";
import { saveInterview } from "../server/owner/diagnostico.ts";
import { acceptInvitation } from "../server/invitations/mutations.ts";
import { createRecord, moveRecord } from "../server/apps/records.ts";
import { agenteBrief, helpFor, inviteEmail, inviteTeam, loadMiAgente, saveConocerte, teamSuggestion } from "../server/equipo/agentes.ts";

describe("en qué le facilita Improvement el trabajo", () => {
  it("WHEN cuenta dónde se le atora THE SYSTEM SHALL decirle primero eso", () => {
    const h = helpFor({ trabajo: "Llevo todo en una libreta", friccion: "Cuadrar la caja cada noche" });
    expect(h[0]).toMatch(/corte/);
    expect(h).toContainEqual(expect.stringMatching(/libreta/));
  });
  it("WHEN el dueño invita THE SYSTEM SHALL mandarla de su parte, con lo que le toca y un botón para aceptar", () => {
    const c = inviteEmail({ de: "Ana López", empresa: "Taquería <Dos>", para: "Carlos Pérez", puesto: "Encargado de Centro", sucursal: "Centro", encargos: ["Corte de caja", "Fuegos"], link: "https://jotapuntoce.com/improvement/invitacion/t" });
    expect(c.fromName).toBe("Ana vía Improvement");
    expect(c.subject).toBe("Carlos, te sumé a Taquería <Dos>");
    expect(c.text).toContain("como Encargado de Centro en Centro. Ya te dejé listo lo tuyo: Corte de caja y Fuegos.");
    expect(c.html).toContain("Ana López te sumó a Taquería &#60;Dos&#62; como Encargado de Centro en Centro.");
    expect(c.html).toContain('href="https://jotapuntoce.com/improvement/invitacion/t"');
    expect(c.html).toContain("Aceptar invitación");
  });
  it("WHEN no contó nada THE SYSTEM SHALL ofrecerle la burbuja", () => {
    expect(helpFor({})).toEqual([expect.stringMatching(/burbuja/)]);
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

describe("el equipo y sus agentes", () => {
  it("WHEN el dueño invita a quien se encarga de qué THE SYSTEM SHALL armar su agente y mandarle las tareas de lo suyo", async () => {
    const owner = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` };
    profileIds.push(owner.id);
    const b = await createOwnBusiness(owner, { fullName: "Ana", name: "Taquería", industry: "restaurante", teamSize: "6-20", city: "Monterrey" });
    if (!b.ok) throw new Error(b.error.message);
    const orgId = b.data.orgId;
    orgIds.push(orgId);
    await saveInterview(owner.id, orgId, "dolor", { dolor: "Hago todo yo", cargas: "Finanzas y caja, Proveedores y compras, Inventario", sucursales: "Centro, Cumbres" });
    const p = await loadProposal(owner.id, orgId);
    if (!p.ok) throw new Error(p.error.message);
    expect((await finishOnboarding(owner.id, orgId, p.data.apps.filter((a) => a.relief))).ok).toBe(true);

    // Improvement propone: un encargado por sucursal con su corte, y quien compra con sus pedidos.
    const s = await teamSuggestion(owner.id, orgId);
    if (!s.ok) throw new Error(s.error.message);
    expect(s.data.sugeridas).toContainEqual({ puesto: "Encargado de Centro", sucursal: "Centro", encargos: expect.arrayContaining(["corte-de-caja"]) });
    expect(s.data.sugeridas).toContainEqual({ puesto: "Compras", sucursal: null, encargos: ["pedidos-a-proveedores"] });
    await expect(teamSuggestion(crypto.randomUUID(), orgId)).rejects.toThrow();

    const emp = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` };
    profileIds.push(emp.id);
    const inv = await inviteTeam(owner.id, orgId, [{ nombre: "Luis Compras", email: emp.email, puesto: "Compras", sucursal: null, encargos: ["pedidos-a-proveedores", "no-existe"] }], "https://x.test");
    if (!inv.ok) throw new Error(inv.error.message);
    const token = inv.data[0]!.link.split("/invitacion/")[1]!;
    const [a] = await db.select().from(agente).where(eq(agente.orgId, orgId));
    expect(a).toMatchObject({ puesto: "Compras", encargos: ["pedidos-a-proveedores"], userId: null });

    // Acepta: el agente ya es suyo y Improvement lo conoce.
    expect((await acceptInvitation(token, emp, { fullName: "Luis Compras", phone: "8112345678", areaId: null, jobTitle: "Compras", responsibilities: "Los pedidos" })).ok).toBe(true);
    expect((await loadMiAgente(emp.id, orgId))?.conocido).toBe(false);
    await saveConocerte(emp.id, orgId, { trabajo: "Hago los pedidos", friccion: "Me piden todo por WhatsApp" });
    const mio = (await loadMiAgente(emp.id, orgId))!;
    expect(mio.conocido).toBe(true);
    expect(mio.apps.map((x) => x.key)).toEqual(["pedidos-a-proveedores"]);
    expect(agenteBrief(mio)).toContain("Dónde se le atora: Me piden todo por WhatsApp");

    // Se acaba la carne → nace su pedido → la tarea de mandarlo es de Luis, no del dueño.
    const carne = await createRecord(owner.id, orgId, "inventario", "Carne al pastor");
    if (!carne.ok) throw new Error(carne.error.message);
    await moveRecord(owner.id, orgId, "inventario", carne.data.id, "por-pedir");
    const [t] = await db.select({ assigneeId: task.assigneeId }).from(task).where(and(eq(task.orgId, orgId), eq(task.title, "Mandar el pedido — Carne al pastor")));
    expect(t?.assigneeId).toBe(emp.id);
  }, 180_000);
});
