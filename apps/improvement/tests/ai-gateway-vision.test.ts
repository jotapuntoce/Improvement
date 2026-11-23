// Gateway con imágenes y tope diario (oficinas-digitales paso 8). Proveedor falso que registra sus
// argumentos; la base es la de desarrollo, como en tests/ai-gateway.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { llmCalls, organization } from "@jotapuntoce/db/schema";
import {
  generateStructured,
  type CompleteOptions,
  type GatewayImage,
  type SuggestionCompletion,
  type SuggestionProvider,
} from "../server/ai/gateway.ts";

class RecordingProvider implements SuggestionProvider {
  calls: { system: string; prompt: string; options?: CompleteOptions }[] = [];
  async complete(system: string, prompt: string, options?: CompleteOptions): Promise<SuggestionCompletion> {
    this.calls.push({ system, prompt, options });
    return {
      text: JSON.stringify({ resumen: "Un local con recepción y dos áreas." }),
      usage: { inputTokens: 900, outputTokens: 80, cacheReadTokens: 0, cacheWriteTokens: 0 },
      finishReason: "end_turn",
    };
  }
}

const orgIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-vision", slug: `t-vision-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

const img = (): GatewayImage => ({ mediaType: "image/png", data: "iVBORw0KGgo=" });

function analizar(orgId: string, images: GatewayImage[], provider: SuggestionProvider) {
  return generateStructured({
    orgId,
    purpose: "oficina",
    category: "oficina",
    system: "sys",
    prompt: "Describe el espacio.",
    schema: z.object({ resumen: z.string() }),
    toText: (p) => p.resumen,
    basedOn: {},
    images,
    maxTokens: 2048,
    provider,
  });
}

describe("generateStructured con imágenes", () => {
  it("WHEN recibe 2 imágenes THE SYSTEM SHALL pasarlas al proveedor y guardar llm_calls con purpose oficina", async () => {
    const orgId = await org();
    const provider = new RecordingProvider();
    const res = await analizar(orgId, [img(), img()], provider);
    expect(res.ok).toBe(true);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.options?.images).toHaveLength(2);
    expect(provider.calls[0]?.options?.maxTokens).toBe(2048);
    const rows = await db.select({ purpose: llmCalls.purpose }).from(llmCalls).where(eq(llmCalls.orgId, orgId));
    expect(rows).toEqual([{ purpose: "oficina" }]);
  });

  it("WHEN recibe 7 imágenes THE SYSTEM SHALL devolver VALIDATION_ERROR sin llamar al proveedor", async () => {
    const orgId = await org();
    const provider = new RecordingProvider();
    const res = await analizar(orgId, Array.from({ length: 7 }, img), provider);
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(provider.calls).toHaveLength(0);
  });

  it("WHEN el org ya tiene 100 llamadas en 24 h THE SYSTEM SHALL devolver RATE_LIMITED sin llamar al proveedor", async () => {
    const orgId = await org();
    await db.insert(llmCalls).values(
      Array.from({ length: 100 }, () => ({
        orgId,
        purpose: "agente",
        modelId: "fake",
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        finishReason: "end_turn",
        costUsd: "0",
      })),
    );
    const provider = new RecordingProvider();
    const res = await analizar(orgId, [img()], provider);
    expect(res).toMatchObject({ ok: false, error: { code: "RATE_LIMITED", message: "Tope diario de IA alcanzado para esta empresa." } });
    expect(provider.calls).toHaveLength(0);
  });
});
