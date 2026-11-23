// El gateway lee archivos y propone mapeos para la importación: proveedor simulado, uso real en
// llm_calls y ninguna fila en ai_suggestion (no es una sugerencia para el dueño).
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, llmCalls, organization } from "@jotapuntoce/db/schema";
import { extractStructured, type Attachment, type SuggestionCompletion, type SuggestionProvider } from "../server/ai/gateway.ts";
import { READ_TABLE_SYSTEM, readTablePrompt, readTableSchema } from "../server/ai/prompts/import.ts";

const orgIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});
async function org() {
  const [o] = await db.insert(organization).values({ name: "t-aiimp", slug: `t-aiimp-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return o!.id;
}

class FakeProvider implements SuggestionProvider {
  calls: { attachment?: Attachment; maxTokens?: number }[] = [];
  constructor(private readonly replies: string[]) {}
  async complete(_system: string, _prompt: string, opts?: { attachment?: Attachment; maxTokens?: number }): Promise<SuggestionCompletion> {
    this.calls.push(opts ?? {});
    return { text: this.replies[this.calls.length - 1] ?? "", usage: { inputTokens: 900, outputTokens: 80, cacheReadTokens: 0, cacheWriteTokens: 0 }, finishReason: "end_turn" };
  }
}
const pdf: Attachment = { mediaType: "application/pdf", base64: "JVBERi0=" };
const read = (orgId: string, provider: SuggestionProvider) =>
  extractStructured({ orgId, purpose: "importacion_lectura", system: READ_TABLE_SYSTEM, prompt: readTablePrompt("lista.pdf"), attachment: pdf, schema: readTableSchema, maxTokens: 16000, provider });

describe("extractStructured", () => {
  it("WHEN se lee un PDF THE SYSTEM SHALL mandar el adjunto, validar la tabla y guardar el uso sin crear ai_suggestion", async () => {
    const orgId = await org();
    const provider = new FakeProvider([JSON.stringify({ headers: ["Nombre", "Tel"], rows: [["Ana", "555"]] })]);
    const r = await read(orgId, provider);
    expect(r).toEqual({ ok: true, data: { parsed: { headers: ["Nombre", "Tel"], rows: [["Ana", "555"]] } } });
    expect(provider.calls).toEqual([{ attachment: pdf, maxTokens: 16000 }]);
    const calls = await db.select().from(llmCalls).where(and(eq(llmCalls.orgId, orgId), eq(llmCalls.purpose, "importacion_lectura")));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.inputTokens).toBe(900);
    expect(await db.select().from(aiSuggestion).where(eq(aiSuggestion.orgId, orgId))).toHaveLength(0);
  });

  it("WHEN el modelo responde dos veces fuera del esquema THE SYSTEM SHALL fallar explícito tras un reintento", async () => {
    const provider = new FakeProvider(["no es json", JSON.stringify({ headers: "x" })]);
    const r = await read(await org(), provider);
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(provider.calls).toHaveLength(2);
  });

  it("WHEN el org ya hizo 10 lecturas en la hora THE SYSTEM SHALL negar la 11ª sin llamar al proveedor", async () => {
    const orgId = await org();
    await db.insert(llmCalls).values(Array.from({ length: 10 }, () => ({ orgId, purpose: "importacion_lectura", modelId: "x", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, finishReason: "end_turn", costUsd: "0" })));
    const provider = new FakeProvider([]);
    expect(await read(orgId, provider)).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(provider.calls).toHaveLength(0);
  });
});
