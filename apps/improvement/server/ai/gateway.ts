// Único módulo de todo el repo que importa @anthropic-ai/sdk (regla .claude/rules/ia-gateway.md,
// verificado por grep en el Verify de esta tarea). Model id resuelto vía la skill claude-api antes
// de escribir esta llamada (blueprint §17) — vive en MODEL_ID, nunca inline en el call site.
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, objective, client, aiSuggestion, llmCalls } from "@jotapuntoce/db/schema";
import { requireEnv } from "../../lib/env.ts";
import {
  buildSuggestionPrompt,
  suggestionSchema,
  SUGGESTION_SYSTEM_PROMPT,
  type SuggestionCategory,
} from "./prompts/suggestion.ts";

// claude-opus-5, confirmado vigente vía la skill claude-api el 2026-08-31 — $5.00 / $25.00 por
// 1M tokens input/output (PRICING_USD_PER_MTOK abajo). Nunca hardcodear un id de memoria.
const MODEL_ID = "claude-opus-5";
const PRICING_USD_PER_MTOK = { input: 5.0, output: 25.0 };
const MAX_SUGGESTIONS_PER_HOUR = 10;
const MAX_OUTPUT_TOKENS = 1024;

export class ProviderRateLimitError extends Error {
  readonly retryable = true as const;
  constructor(message = "El proveedor de IA está limitando la tasa de solicitudes.") {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}

export class ProviderRequestError extends Error {
  readonly retryable = false as const;
  constructor(message = "La solicitud al proveedor de IA fue inválida.") {
    super(message);
    this.name = "ProviderRequestError";
  }
}

export interface SuggestionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SuggestionCompletion {
  text: string;
  usage: SuggestionUsage;
  finishReason: string;
}

/**
 * Frontera entre este gateway y el proveedor real — la única razón de que exista es poder
 * inyectar un proveedor simulado en tests/ai-gateway.test.ts sin tocar la red ni una API key real
 * (criterios #1 y #3, "proveedor simulado en el test").
 */
export interface SuggestionProvider {
  complete(system: string, prompt: string): Promise<SuggestionCompletion>;
}

/**
 * Adaptador real sobre @anthropic-ai/sdk. Traduce las excepciones del SDK a los tipos propios de
 * arriba: WHEN se simula (o llega de verdad) un rate limit del proveedor THE SYSTEM SHALL
 * surfacear ProviderRateLimitError (reintentable), distinto de ProviderRequestError para un 400
 * (no reintentable) — criterio #1.
 */
class AnthropicSuggestionProvider implements SuggestionProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(system: string, prompt: string): Promise<SuggestionCompletion> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL_ID,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new ProviderRateLimitError();
      if (err instanceof Anthropic.BadRequestError) throw new ProviderRequestError(err.message);
      throw err;
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    return {
      text: textBlock?.text ?? "",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
      finishReason: response.stop_reason ?? "unknown",
    };
  }
}

function estimateCostUsd(usage: SuggestionUsage): number {
  return (
    (usage.inputTokens * PRICING_USD_PER_MTOK.input) / 1_000_000 +
    (usage.outputTokens * PRICING_USD_PER_MTOK.output) / 1_000_000
  );
}

function parseCompletion(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type GatewayErrorCode = "RATE_LIMITED" | "PROVIDER_RATE_LIMIT" | "VALIDATION_ERROR" | "INTERNAL";
export type GatewayResult =
  | { ok: true; data: typeof aiSuggestion.$inferSelect }
  | { ok: false; error: { code: GatewayErrorCode; retryable: boolean; message: string } };

/**
 * WHEN un org ya generó 10 sugerencias en la última hora THE SYSTEM SHALL rechazar la 11ª sin
 * llamar al proveedor (criterio #4) — el conteo corre ANTES de resolver el proveedor o tocar áreas
 * /objetivos/clientes, para que un org bloqueado nunca dispare ni una query de más.
 */
async function hasReachedHourlyLimit(orgId: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db
    .select({ id: llmCalls.id })
    .from(llmCalls)
    .where(
      and(
        eq(llmCalls.orgId, orgId),
        eq(llmCalls.purpose, "suggestion"),
        gte(llmCalls.createdAt, oneHourAgo),
      ),
    );
  return rows.length >= MAX_SUGGESTIONS_PER_HOUR;
}

/**
 * WHEN una sugerencia se genera exitosamente THE SYSTEM SHALL insertar una fila en ai_suggestion y
 * una en llm_calls con input_tokens y output_tokens no nulos (criterio #3). `provider` es opcional
 * — en producción se resuelve al adaptador real sobre @anthropic-ai/sdk; los tests inyectan un
 * SuggestionProvider simulado.
 */
export async function generateSuggestion(
  orgId: string,
  category: SuggestionCategory,
  provider?: SuggestionProvider,
): Promise<GatewayResult> {
  if (await hasReachedHourlyLimit(orgId)) {
    return {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        retryable: false,
        message: "Este org ya generó 10 sugerencias en la última hora.",
      },
    };
  }

  const resolvedProvider = provider ?? new AnthropicSuggestionProvider(requireEnv("ANTHROPIC_API_KEY"));

  const [areas, objectives, clients] = await Promise.all([
    db.select().from(area).where(eq(area.orgId, orgId)),
    db.select().from(objective).where(eq(objective.orgId, orgId)),
    db.select().from(client).where(eq(client.orgId, orgId)),
  ]);
  const prompt = buildSuggestionPrompt({ category, areas, objectives, clients });

  const startedAt = Date.now();
  let completion: SuggestionCompletion;
  try {
    completion = await resolvedProvider.complete(SUGGESTION_SYSTEM_PROMPT, prompt);
  } catch (err) {
    if (err instanceof ProviderRateLimitError) {
      return { ok: false, error: { code: "PROVIDER_RATE_LIMIT", retryable: true, message: err.message } };
    }
    if (err instanceof ProviderRequestError) {
      return { ok: false, error: { code: "VALIDATION_ERROR", retryable: false, message: err.message } };
    }
    return {
      ok: false,
      error: { code: "INTERNAL", retryable: false, message: "Error inesperado del proveedor de IA." },
    };
  }

  let parsed = suggestionSchema.safeParse(parseCompletion(completion.text));
  if (!parsed.success) {
    // Un solo reintento en fallo de validación (regla ia-gateway.md), después falla explícito.
    try {
      completion = await resolvedProvider.complete(SUGGESTION_SYSTEM_PROMPT, prompt);
    } catch {
      return {
        ok: false,
        error: { code: "INTERNAL", retryable: false, message: "El reintento tras un fallo de validación también falló." },
      };
    }
    parsed = suggestionSchema.safeParse(parseCompletion(completion.text));
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          retryable: false,
          message: "La respuesta del modelo no cumplió el esquema esperado tras un reintento.",
        },
      };
    }
  }
  const latencyMs = Date.now() - startedAt;
  const costUsd = estimateCostUsd(completion.usage);

  const [suggestion] = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(aiSuggestion)
      .values({
        orgId,
        category,
        suggestionText: parsed.data.suggestionText,
        basedOn: {
          areaIds: areas.map((a) => a.id),
          objectiveIds: objectives.map((o) => o.id),
          clientIds: clients.map((c) => c.id),
        },
      })
      .returning();
    if (!row) throw new Error("insert de ai_suggestion no devolvió fila");

    await tx.insert(llmCalls).values({
      orgId,
      purpose: "suggestion",
      modelId: MODEL_ID,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      cacheReadTokens: completion.usage.cacheReadTokens,
      cacheWriteTokens: completion.usage.cacheWriteTokens,
      latencyMs,
      finishReason: completion.finishReason,
      costUsd: costUsd.toFixed(6),
    });

    return [row];
  });
  if (!suggestion) throw new Error("transacción de generateSuggestion no devolvió fila");

  return { ok: true, data: suggestion };
}
