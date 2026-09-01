// Integración real contra el proyecto Supabase de desarrollo (blueprint §13), mismo patrón que
// tests/objectives.test.ts. El proveedor de IA se simula por completo (FakeProvider) — nunca se
// llama a la API real de Anthropic ni se necesita ANTHROPIC_API_KEY para correr esta suite.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, aiSuggestion, llmCalls } from "@jotapuntoce/db/schema";
import {
  generateSuggestion,
  ProviderRateLimitError,
  ProviderRequestError,
  type SuggestionCompletion,
  type SuggestionProvider,
} from "../server/ai/gateway.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-ai-${nameSuffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

class FakeProvider implements SuggestionProvider {
  calls = 0;
  constructor(private readonly behavior: "success" | "rateLimit" | "badRequest") {}

  async complete(): Promise<SuggestionCompletion> {
    this.calls++;
    if (this.behavior === "rateLimit") throw new ProviderRateLimitError();
    if (this.behavior === "badRequest") throw new ProviderRequestError("Solicitud simulada inválida.");
    return {
      text: JSON.stringify({ suggestionText: "Sugerencia de prueba generada por el proveedor simulado." }),
      usage: { inputTokens: 120, outputTokens: 45, cacheReadTokens: 0, cacheWriteTokens: 0 },
      finishReason: "end_turn",
    };
  }
}

const createdOrgIds: string[] = [];

afterEach(async () => {
  if (createdOrgIds.length) {
    for (const orgId of createdOrgIds.splice(0)) {
      await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
    }
  }
});

describe("generateSuggestion", () => {
  it(
    "WHEN se simula un rate limit del proveedor THE SYSTEM SHALL surfacear un error tipado y " +
      "reintentable, distinto del error para una solicitud 400 (no reintentable)",
    async () => {
      const org = await makeOrg("ratelimit");
      createdOrgIds.push(org.id);

      const rateLimited = await generateSuggestion(org.id, "upgrade", new FakeProvider("rateLimit"));
      const badRequest = await generateSuggestion(org.id, "upgrade", new FakeProvider("badRequest"));

      expect(rateLimited.ok).toBe(false);
      expect(badRequest.ok).toBe(false);
      if (rateLimited.ok || badRequest.ok) throw new Error("ambos deben fallar");

      expect(rateLimited.error.retryable).toBe(true);
      expect(badRequest.error.retryable).toBe(false);
      expect(rateLimited.error.code).not.toBe(badRequest.error.code);
    },
  );

  it(
    "WHEN una sugerencia se genera exitosamente (proveedor simulado) THE SYSTEM SHALL insertar " +
      "una fila en ai_suggestion y una en llm_calls con input_tokens y output_tokens no nulos",
    async () => {
      const org = await makeOrg("success");
      createdOrgIds.push(org.id);

      const result = await generateSuggestion(org.id, "upgrade", new FakeProvider("success"));

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("se esperaba éxito");

      const suggestions = await db.select().from(aiSuggestion).where(eq(aiSuggestion.orgId, org.id));
      expect(suggestions.length).toBe(1);

      const calls = await db.select().from(llmCalls).where(eq(llmCalls.orgId, org.id));
      expect(calls.length).toBe(1);
      expect(calls[0]?.inputTokens).not.toBeNull();
      expect(calls[0]?.outputTokens).not.toBeNull();
    },
  );

  it(
    "WHEN un org ya generó 10 sugerencias en la última hora THE SYSTEM SHALL rechazar la 11ª sin " +
      "llamar al proveedor",
    async () => {
      const org = await makeOrg("hourly");
      createdOrgIds.push(org.id);

      await db.insert(llmCalls).values(
        Array.from({ length: 10 }, () => ({
          orgId: org.id,
          purpose: "suggestion",
          modelId: "claude-opus-5",
          inputTokens: 100,
          outputTokens: 50,
          latencyMs: 500,
          finishReason: "end_turn",
          costUsd: "0.001750",
        })),
      );

      const provider = new FakeProvider("success");
      const result = await generateSuggestion(org.id, "upgrade", provider);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("RATE_LIMITED");
      expect(provider.calls).toBe(0);

      const calls = await db.select().from(llmCalls).where(eq(llmCalls.orgId, org.id));
      expect(calls.length).toBe(10);
    },
  );
});
