// Alertas contra el Supabase de desarrollo: qué detectan las reglas, quién las ve, "Explícame" con un
// proveedor simulado y el puente a Summum.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, client, deal, membership, organization, orgNeed, permissionType, profile } from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { alertToSummum, explainAlert, listAlerts } from "../server/insights/alerts.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee", grants?: Record<string, string>) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  const [tipo] = grants ? await db.insert(permissionType).values({ orgId, name: `t-${id}`, grants }).returning() : [];
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date(), permissionTypeId: tipo?.id });
  return id;
}
const DAY = 86_400_000;
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-alerts", slug: `t-alerts-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const orgId = o!.id;
  const [c] = await db.insert(client).values({ orgId, name: "Boda García" }).returning();
  const [d] = await db
    .insert(deal)
    .values({ orgId, clientId: c!.id, title: "Banquete", amountCents: 80_000_00, stage: "propuesta", updatedAt: new Date(Date.now() - 20 * DAY) })
    .returning();
  return { orgId, owner: await person(orgId, "owner"), dealKey: `trato_quieto:${d!.id}` };
}
class FakeAi implements SuggestionProvider {
  constructor(private readonly reply: unknown) {}
  async complete(): Promise<SuggestionCompletion> {
    if (this.reply instanceof Error) throw this.reply;
    return { text: JSON.stringify(this.reply), usage: { inputTokens: 300, outputTokens: 90, cacheReadTokens: 0, cacheWriteTokens: 0 }, finishReason: "end_turn" };
  }
}

describe("alertas", () => {
  it("WHEN un trato abierto no se mueve en 14 días THE SYSTEM SHALL listar la alerta con su monto", async () => {
    const { orgId, owner, dealKey } = await setup();
    const r = await listAlerts(owner, orgId);
    const a = r.ok ? r.data.find((x) => x.key === dealKey) : undefined;
    expect(a).toMatchObject({ rule: "trato_quieto", amountCents: 80_000_00 });
    expect(a!.days).toBeGreaterThanOrEqual(19);
  });

  it("WHEN un empleado sin Ventas pide alertas THE SYSTEM SHALL no incluir las de Ventas", async () => {
    const { orgId } = await setup();
    const ana = await person(orgId, "employee", { clientes: "ninguno" });
    const r = await listAlerts(ana, orgId);
    expect(r.ok ? r.data.filter((a) => a.rule === "trato_quieto") : null).toEqual([]);
  });

  it("WHEN se pide Explícame THE SYSTEM SHALL guardar el texto como alerta y devolverlo en la siguiente lectura", async () => {
    const { orgId, owner, dealKey } = await setup();
    const ai = new FakeAi({ porque: "Un trato quieto se enfría.", enJuego: "80 mil pesos.", queHacer: "Llamar hoy." });
    const r = await explainAlert(owner, orgId, dealKey, ai);
    expect(r.ok ? r.data : null).toContain("Llamar hoy.");
    const [row] = await db.select().from(aiSuggestion).where(eq(aiSuggestion.orgId, orgId));
    expect(row).toMatchObject({ category: "alerta", basedOn: { alertKeys: [dealKey] } });
    const again = await listAlerts(owner, orgId);
    expect(again.ok ? again.data.find((a) => a.key === dealKey)?.explained : null).toContain("Llamar hoy.");
  });

  it("WHEN la IA falla THE SYSTEM SHALL responder AI_UNAVAILABLE y la alerta se sigue viendo", async () => {
    const { orgId, owner, dealKey } = await setup();
    const r = await explainAlert(owner, orgId, dealKey, new FakeAi(new Error("caído")));
    expect(r.ok ? null : r.error.code).toBe("AI_UNAVAILABLE");
    const again = await listAlerts(owner, orgId);
    expect(again.ok ? again.data.find((a) => a.key === dealKey)?.explained : "x").toBeNull();
  });

  it("WHEN el dueño pide ayuda a Summum desde una alerta THE SYSTEM SHALL dejar la necesidad derivada; un empleado no puede", async () => {
    const { orgId, owner, dealKey } = await setup();
    const ana = await person(orgId, "employee", { clientes: "empresa" });
    const denied = await alertToSummum(ana, orgId, dealKey, null);
    expect(denied.ok ? null : denied.error.code).toBe("FORBIDDEN");
    const r = await alertToSummum(owner, orgId, dealKey, "Necesito quien cierre ventas");
    if (!r.ok) throw new Error(r.error.message);
    const [need] = await db.select().from(orgNeed).where(eq(orgNeed.id, r.data.needId));
    expect(need).toMatchObject({ status: "derivada", severity: 3, referralNote: "Necesito quien cierre ventas" });
    expect(need!.referredAt).not.toBeNull();
  });
});
