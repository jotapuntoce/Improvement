// La entrevista del arranque y el primer análisis de Improvement, contra el Supabase de desarrollo con
// un proveedor de IA simulado (sin red ni llave real).
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { orgNeed, organization, ownerMemory, profile } from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { DIAGNOSTICO_SYSTEM_PROMPT } from "../server/ai/prompts/diagnostico.ts";
import { createOwnBusiness } from "../server/registro/business.ts";
import { analyzeBusiness, loadAnalysis, NEGOCIO_QUESTIONS, saveInterview } from "../server/owner/diagnostico.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function business() {
  const u = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` };
  profileIds.push(u.id);
  const r = await createOwnBusiness(u, { fullName: "Ana", name: "Negocio", industry: "restaurante", teamSize: "2-5", city: "León" });
  if (!r.ok) throw new Error(r.error.message);
  orgIds.push(r.data.orgId);
  return { owner: u.id, orgId: r.data.orgId };
}

class Simulado implements SuggestionProvider {
  calls: { system: string; prompt: string }[] = [];
  async complete(system: string, prompt: string): Promise<SuggestionCompletion> {
    this.calls.push({ system, prompt });
    const reply = {
      resumen: "Negocio micro que depende de la dueña.",
      etapa: "micro",
      industrial: false,
      areas: [{ area: "Personas", dijo: "Solo yo cobro.", seVe: "La cobranza depende de una persona.", faltaSaber: "Cartera vencida." }],
      necesidades: [{ titulo: "Soltar la cobranza", detalle: "Hoy solo la dueña cobra.", severidad: 3, fuente: "improvement" }],
      siguientePaso: "Medir la caja a 13 semanas.",
    };
    return { text: JSON.stringify(reply), usage: { inputTokens: 900, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 }, finishReason: "end_turn" };
  }
}

describe("entrevista y análisis del arranque", () => {
  it("WHEN el dueño cuenta su negocio THE SYSTEM SHALL guardar solo lo contestado y analizarlo una vez con el conocimiento de Improvement", async () => {
    const { owner, orgId } = await business();
    const saved = await saveInterview(owner, orgId, "negocio", { proceso: "Nos buscan por WhatsApp, cotizo y entrego.", areas: "", roles: "x" });
    expect(saved.ok && saved.data.saved).toBe(1);

    const ia = new Simulado();
    const a = await analyzeBusiness(owner, orgId, ia);
    expect(a.ok && a.data.needs).toBe(1);
    expect(ia.calls[0]!.system).toBe(DIAGNOSTICO_SYSTEM_PROMPT);
    expect(ia.calls[0]!.system).toContain("Las 10 preguntas de diagnóstico");
    expect(ia.calls[0]!.prompt).toContain("Nos buscan por WhatsApp");
    expect(ia.calls[0]!.prompt).toContain(NEGOCIO_QUESTIONS[1]!.question);

    const needs = await db.select().from(orgNeed).where(eq(orgNeed.orgId, orgId));
    expect(needs.map((n) => [n.title, n.severity, n.source])).toEqual([["Soltar la cobranza", 3, "improvement"]]);
    const obs = await db.select().from(ownerMemory).where(and(eq(ownerMemory.orgId, orgId), eq(ownerMemory.topic, "observacion")));
    expect(obs.map((o) => o.question).sort()).toEqual(["Lo que veo de tu negocio", "Área: Personas"]);

    // Reenviar no duplica: el primer análisis corre una sola vez.
    expect((await analyzeBusiness(owner, orgId, ia)).ok).toBe(true);
    expect(ia.calls).toHaveLength(1);
    expect((await loadAnalysis(owner, orgId))?.necesidades).toEqual([{ title: "Soltar la cobranza", severity: 3 }]);
  });

  it("WHEN alguien que no es el dueño contesta o pide el análisis THE SYSTEM SHALL negarlo sin llamar a la IA", async () => {
    const { orgId } = await business();
    const extraño = crypto.randomUUID();
    const ia = new Simulado();
    // Quien no es del negocio ni siquiera lo ve existir (assertMembership → notFound).
    await expect(saveInterview(extraño, orgId, "negocio", { proceso: "algo" })).rejects.toThrow();
    await expect(analyzeBusiness(extraño, orgId, ia)).rejects.toThrow();
    await expect(loadAnalysis(extraño, orgId)).rejects.toThrow();
    expect(ia.calls).toHaveLength(0);
  });
});
