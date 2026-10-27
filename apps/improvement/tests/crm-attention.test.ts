// La IA de atención al cliente (server/crm/attention.ts) contra el Supabase de desarrollo. El proveedor
// se simula por completo (FakeProvider, como en tests/ai-gateway.test.ts): nunca la API real.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, client, clientPreference, llmCalls, membership, organization, profile } from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { latestAttention, suggestAttention } from "../server/crm/attention.ts";

class FakeProvider implements SuggestionProvider {
  calls = 0;
  constructor(private readonly payload: unknown) {}

  async complete(): Promise<SuggestionCompletion> {
    this.calls++;
    return {
      text: typeof this.payload === "string" ? this.payload : JSON.stringify(this.payload),
      usage: { inputTokens: 120, outputTokens: 45, cacheReadTokens: 0, cacheWriteTokens: 0 },
      finishReason: "end_turn",
    };
  }
}

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function setup(withAnswers = true) {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-atencion", slug: `t-atencion-${crypto.randomUUID()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const people: Record<"owner" | "employee", string> = { owner: "", employee: "" };
  for (const role of ["owner", "employee"] as const) {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId: org.id, role, acceptedAt: new Date() });
    people[role] = id;
  }
  const [c] = await db.insert(client).values({ orgId: org.id, name: "Cliente" }).returning();
  if (!c) throw new Error("insert de client no devolvió fila");
  await db
    .insert(clientPreference)
    .values({ orgId: org.id, clientId: c.id, answers: withAnswers ? { expectativa: "Entregas puntuales" } : {} });
  return { orgId: org.id, owner: people.owner, employee: people.employee, clientId: c.id };
}

const prefOf = async (clientId: string) =>
  (await db.select().from(clientPreference).where(eq(clientPreference.clientId, clientId)))[0];

describe("suggestAttention", () => {
  it("WHEN el proveedor marca expectativa incumplida THE SYSTEM SHALL guardar sugerencia, llm_calls y unmet_note", async () => {
    const { orgId, owner, clientId } = await setup();
    const provider = new FakeProvider({ suggestionText: "Llámalo hoy.", expectativaIncumplida: true, motivo: "Pidió entrega el viernes" });
    const res = await suggestAttention(owner, orgId, clientId, provider);
    expect(res.ok).toBe(true);

    const [s] = await db.select().from(aiSuggestion).where(eq(aiSuggestion.orgId, orgId));
    expect(s?.category).toBe("servicio_cliente");
    expect((s?.basedOn as { clientIds: string[] }).clientIds).toEqual([clientId]);
    const calls = await db
      .select()
      .from(llmCalls)
      .where(and(eq(llmCalls.orgId, orgId), eq(llmCalls.purpose, "atencion_cliente")));
    expect(calls).toHaveLength(1);
    const pref = await prefOf(clientId);
    expect(pref?.unmetNote).toBe("Pidió entrega el viernes");
    expect(pref?.unmetFlaggedAt).not.toBeNull();
    expect((await latestAttention(owner, orgId, clientId))?.id).toBe(s?.id);
  });

  it("WHEN el proveedor no marca incumplimiento THE SYSTEM SHALL dejar unmet_note y unmet_flagged_at en null", async () => {
    const { orgId, owner, clientId } = await setup();
    await suggestAttention(owner, orgId, clientId, new FakeProvider({ suggestionText: "Todo bien.", expectativaIncumplida: false, motivo: null }));
    const pref = await prefOf(clientId);
    expect(pref?.unmetNote).toBeNull();
    expect(pref?.unmetFlaggedAt).toBeNull();
  });

  it("WHEN el proveedor responde dos veces fuera de esquema THE SYSTEM SHALL devolver VALIDATION_ERROR sin insertar", async () => {
    const { orgId, owner, clientId } = await setup();
    const provider = new FakeProvider("no es json");
    const res = await suggestAttention(owner, orgId, clientId, provider);
    expect(res.ok ? null : res.error.code).toBe("VALIDATION_ERROR");
    expect(provider.calls).toBe(2);
    expect(await db.select().from(aiSuggestion).where(eq(aiSuggestion.orgId, orgId))).toEqual([]);
  });

  it("WHEN no hay respuestas o quien llama no tiene clientes THE SYSTEM SHALL fallar sin llamar al proveedor", async () => {
    const empty = await setup(false);
    const p1 = new FakeProvider({});
    const r1 = await suggestAttention(empty.owner, empty.orgId, empty.clientId, p1);
    expect(r1.ok ? null : r1.error.code).toBe("VALIDATION_ERROR");

    const full = await setup();
    const p2 = new FakeProvider({});
    const r2 = await suggestAttention(full.employee, full.orgId, full.clientId, p2);
    expect(r2.ok ? null : r2.error.code).toBe("FORBIDDEN");
    expect(p1.calls + p2.calls).toBe(0);
  });
});
