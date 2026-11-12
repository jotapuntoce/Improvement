// Cada dueño ve sus apps como las imaginó: Improvement elige la vista del catálogo con lo que dijo, el
// dueño la cambia, y lo que aún no sabe armar queda como necesidad.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { orgNeed, organization, profile } from "@jotapuntoce/db/schema";
import { createOwnBusiness } from "../server/registro/business.ts";
import { finishOnboarding, loadProposal } from "../server/registro/onboarding.ts";
import { saveInterview } from "../server/owner/diagnostico.ts";
import { getAppMeta } from "../server/apps/records.ts";
import { asked, fallback, pickView, resolveView, setDefaultView } from "../server/apps/views.ts";

describe("leer cómo lo quiere ver", () => {
  const trabajos = { stages: 3, fields: [{ key: "servicio", type: "opcion" as const }, { key: "fecha_de_entrega", type: "fecha" as const }, { key: "monto", type: "dinero" as const }] };
  const sinFecha = { stages: 4, fields: [{ key: "telefono", type: "texto" as const }] };

  it("WHEN describe varias vistas THE SYSTEM SHALL leerlas en el orden en que las dijo", () => {
    expect(asked("Un calendario de entregas y tarjetas por etapa")).toEqual(["calendario", "kanban"]);
    expect(asked("Números grandes de lo que vendo")).toEqual(["numeros"]);
    expect(asked("como un mapa de mis clientes")).toEqual([]);
  });

  it("WHEN pide una vista que la app no puede mostrar THE SYSTEM SHALL usar la siguiente que sí", () => {
    const text = "Un calendario de entregas y tarjetas por etapa";
    expect(pickView(text, trabajos)).toEqual({ kind: "calendario", columns: ["fecha_de_entrega"] });
    expect(pickView(text, sinFecha)).toEqual({ kind: "kanban", columns: [] });
    expect(pickView("una tabla por servicio", trabajos)).toEqual({ kind: "tabla", columns: ["servicio"] });
    expect(pickView("los totales", trabajos)).toEqual({ kind: "numeros", columns: ["monto"] });
  });

  it("WHEN no dijo nada THE SYSTEM SHALL abrir en tarjetas si hay etapas, si no en lista", () => {
    expect(fallback(sinFecha).kind).toBe("kanban");
    expect(fallback({ stages: 0, fields: [] }).kind).toBe("lista");
  });
});

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function business() {
  const u = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` };
  profileIds.push(u.id);
  const r = await createOwnBusiness(u, { fullName: "Ana", name: "Negocio", industry: "manufactura", teamSize: "solo", city: "León" });
  if (!r.ok) throw new Error(r.error.message);
  orgIds.push(r.data.orgId);
  return { owner: u.id, orgId: r.data.orgId };
}
async function arranque(vista: string) {
  const b = await business();
  await saveInterview(b.owner, b.orgId, "negocio", { prospecto: "Me escribe\nLe cotizo\nPaga el anticipo", trabajo: "Diseño: medir\nInstalación" });
  await saveInterview(b.owner, b.orgId, "resultado", { vista });
  const p = await loadProposal(b.owner, b.orgId);
  if (!p.ok) throw new Error(p.error.message);
  expect((await finishOnboarding(b.owner, b.orgId, p.data.apps.slice(0, 2))).ok).toBe(true);
  return b;
}
const viewOf = async (owner: string, orgId: string, key: string, requested?: string) =>
  resolveView(owner, orgId, (await getAppMeta(orgId, key))!, requested);

describe("el arranque deja cada app como la imaginó", () => {
  it("WHEN pidió calendario y tarjetas THE SYSTEM SHALL abrir Trabajos en calendario y Prospectos en tarjetas, y el dueño lo cambia", async () => {
    const { owner, orgId } = await arranque("Quiero un calendario de entregas y tarjetas por etapa");
    const t = await viewOf(owner, orgId, "trabajos");
    expect(t.view).toEqual({ kind: "calendario", columns: ["fecha_de_entrega"] });
    expect(t.saved).toBe("calendario");
    expect(t.options).toEqual(expect.arrayContaining(["lista", "kanban", "calendario", "numeros", "tabla"]));
    expect((await viewOf(owner, orgId, "prospectos")).view.kind).toBe("kanban");
    expect((await viewOf(owner, orgId, "prospectos")).options).not.toContain("calendario");

    expect((await setDefaultView(owner, orgId, "trabajos", "numeros")).ok).toBe(true);
    expect((await viewOf(owner, orgId, "trabajos")).view.kind).toBe("numeros");
    expect((await viewOf(owner, orgId, "trabajos", "lista")).view.kind).toBe("lista");
    expect((await setDefaultView(owner, orgId, "prospectos", "calendario")).ok).toBe(false);
    await expect(setDefaultView(crypto.randomUUID(), orgId, "trabajos", "lista")).rejects.toThrow();
  });

  it("WHEN imaginó algo que aún no sé armar THE SYSTEM SHALL anotarlo como necesidad y abrir con el default", async () => {
    const { owner, orgId } = await arranque("Como un mapa con mis clientes");
    const needs = await db.select({ title: orgNeed.title, detail: orgNeed.detail }).from(orgNeed).where(eq(orgNeed.orgId, orgId));
    expect(needs).toContainEqual(expect.objectContaining({ title: "Quiere ver sus pantallas de una forma que aún no sé armar", detail: expect.stringContaining("mapa") }));
    expect((await viewOf(owner, orgId, "trabajos")).view.kind).toBe("kanban");
  });
});
