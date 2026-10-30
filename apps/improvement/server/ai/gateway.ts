// Único módulo de todo el repo que importa @anthropic-ai/sdk (regla .claude/rules/ia-gateway.md,
// verificado por grep en el Verify de esta tarea). Model id resuelto vía la skill claude-api antes
// de escribir esta llamada (blueprint §17) — vive en MODEL_ID, nunca inline en el call site.
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, objective, orgNeed, client, aiSuggestion, llmCalls } from "@jotapuntoce/db/schema";
import { requireEnv } from "../../lib/env.ts";
import { evidenceKind } from "../objectives/evidence.ts";
import {
  buildSuggestionPrompt,
  suggestionSchema,
  SUGGESTION_SYSTEM_PROMPT,
  type SuggestionCategory,
} from "./prompts/suggestion.ts";
import {
  buildReviewPrompt,
  reviewSchema,
  REVIEW_SYSTEM_PROMPT,
} from "./prompts/review.ts";

// claude-opus-5-5, confirmado vigente vía la skill claude-api el 2026-10-30 — $4.00 / $20.00 por
// 1M tokens input/output (PRICING_USD_PER_MTOK abajo). Nunca hardcodear un id de memoria.
const MODEL_ID = "claude-opus-5-5";
const PRICING_USD_PER_MTOK = { input: 4.0, output: 20.0 };
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
  complete(system: string, prompt: string, opts?: { attachment?: Attachment; maxTokens?: number }): Promise<SuggestionCompletion>;
}

/** Un archivo que el modelo lee junto con el prompt (importación de PDF o foto). */
export interface Attachment {
  mediaType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}

/**
 * Adaptador real sobre @anthropic-ai/sdk. Traduce las excepciones del SDK a los tipos propios de
 * arriba: WHEN se simula (o llega de verdad) un rate limit del proveedor THE SYSTEM SHALL
 * surfacear ProviderRateLimitError (reintentable), distinto de ProviderRequestError para un 400
 * (no reintentable) — criterio #1.
 */
export class AnthropicSuggestionProvider implements SuggestionProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(system: string, prompt: string, opts: { attachment?: Attachment; maxTokens?: number } = {}): Promise<SuggestionCompletion> {
    const { attachment } = opts;
    // El adjunto va antes del texto (forma documentada en la skill claude-api).
    const content: Anthropic.Beta.BetaContentBlockParam[] = attachment
      ? [
          attachment.mediaType === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: attachment.mediaType, data: attachment.base64 } }
            : { type: "image", source: { type: "base64", media_type: attachment.mediaType, data: attachment.base64 } },
          { type: "text", text: prompt },
        ]
      : [{ type: "text", text: prompt }];
    let response: Anthropic.Beta.BetaMessage;
    try {
      // Fallback del lado del servidor: si un clasificador declina, la API reintenta en otro modelo
      // dentro de la misma llamada. Si toda la cadena declina, stop_reason "refusal" deja el texto
      // vacío y el esquema zod lo rechaza como cualquier respuesta inválida.
      response = await this.client.beta.messages.create({
        model: MODEL_ID,
        max_tokens: opts.maxTokens ?? MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: "user", content }],
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new ProviderRateLimitError();
      if (err instanceof Anthropic.BadRequestError) throw new ProviderRequestError(err.message);
      throw err;
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text",
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
async function hasReachedHourlyLimit(orgId: string, purpose = "suggestion"): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db
    .select({ id: llmCalls.id })
    .from(llmCalls)
    .where(
      and(
        eq(llmCalls.orgId, orgId),
        eq(llmCalls.purpose, purpose),
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

// ─── Salida estructurada ───────────────────────────────────────────────────────────────────────
//
// Para los módulos que traen su propio prompt y esquema (atención al cliente, siguiente movimiento).
// Mismas reglas que generateSuggestion: límite antes del proveedor, un reintento, uso real en
// llm_calls. Es interna: la llaman funciones de server/** que ya autorizaron a quien pide.

type AiSuggestionRow = typeof aiSuggestion.$inferSelect;
type GatewayError = { ok: false; error: { code: GatewayErrorCode; retryable: boolean; message: string } };

/** Tope por hora antes del proveedor, una llamada y un solo reintento si no cumple el esquema. */
async function callStructured<T>(args: {
  orgId: string;
  purpose: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  attachment?: Attachment;
  maxTokens?: number;
  provider?: SuggestionProvider;
}): Promise<{ ok: true; completion: SuggestionCompletion; parsed: T; latencyMs: number } | GatewayError> {
  if (await hasReachedHourlyLimit(args.orgId, args.purpose)) {
    return {
      ok: false,
      error: { code: "RATE_LIMITED", retryable: false, message: "Este org ya hizo 10 solicitudes de este tipo en la última hora." },
    };
  }

  const resolvedProvider = args.provider ?? new AnthropicSuggestionProvider(requireEnv("ANTHROPIC_API_KEY"));
  const opts = args.attachment || args.maxTokens ? { attachment: args.attachment, maxTokens: args.maxTokens } : undefined;
  const startedAt = Date.now();
  let completion: SuggestionCompletion | null = null;
  let parsed: T | null = null;

  // Un solo reintento en fallo de validación (regla ia-gateway.md), después falla explícito.
  for (let attempt = 0; attempt < 2 && parsed === null; attempt++) {
    try {
      completion = opts ? await resolvedProvider.complete(args.system, args.prompt, opts) : await resolvedProvider.complete(args.system, args.prompt);
    } catch (err) {
      if (err instanceof ProviderRateLimitError) {
        return { ok: false, error: { code: "PROVIDER_RATE_LIMIT", retryable: true, message: err.message } };
      }
      if (err instanceof ProviderRequestError) {
        return { ok: false, error: { code: "VALIDATION_ERROR", retryable: false, message: err.message } };
      }
      return { ok: false, error: { code: "INTERNAL", retryable: false, message: "Error inesperado del proveedor de IA." } };
    }
    const result = args.schema.safeParse(parseCompletion(completion.text));
    if (result.success) parsed = result.data;
  }
  if (parsed === null || completion === null) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", retryable: false, message: "La respuesta del modelo no cumplió el esquema esperado tras un reintento." },
    };
  }
  return { ok: true, completion, parsed, latencyMs: Date.now() - startedAt };
}

async function logCall(orgId: string, purpose: string, completion: SuggestionCompletion, latencyMs: number, tx: Pick<typeof db, "insert"> = db) {
  const { usage } = completion;
  await tx.insert(llmCalls).values({
    orgId,
    purpose,
    modelId: MODEL_ID,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    latencyMs,
    finishReason: completion.finishReason,
    costUsd: estimateCostUsd(usage).toFixed(6),
  });
}

/**
 * Extracción sin sugerencia: el resultado no es un consejo para el dueño sino datos para otro
 * módulo (leer la tabla de un PDF o foto, proponer un mapeo de columnas), así que no escribe en
 * ai_suggestion. Mismas reglas de tope, reintento y uso real en llm_calls. Interna: la llaman
 * funciones de server/** que ya autorizaron a quien pide.
 */
export async function extractStructured<T>(args: {
  orgId: string;
  purpose: "importacion_lectura" | "importacion_mapeo" | "tarea_plan";
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  attachment?: Attachment;
  maxTokens: number;
  provider?: SuggestionProvider;
}): Promise<{ ok: true; data: { parsed: T } } | GatewayError> {
  const call = await callStructured(args);
  if (!call.ok) return call;
  await logCall(args.orgId, args.purpose, call.completion, call.latencyMs);
  return { ok: true, data: { parsed: call.parsed } };
}

export type StructuredResult<T> = { ok: true; data: { suggestion: AiSuggestionRow; parsed: T } } | GatewayError;

export async function generateStructured<T>(args: {
  orgId: string;
  purpose: "atencion_cliente" | "siguiente_movimiento";
  category: "servicio_cliente" | "siguiente_movimiento";
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  toText: (parsed: T) => string;
  basedOn: Record<string, string[]>;
  provider?: SuggestionProvider;
}): Promise<StructuredResult<T>> {
  const call = await callStructured(args);
  if (!call.ok) return call;
  const { completion, latencyMs, parsed: result } = call;
  const suggestion = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(aiSuggestion)
      .values({ orgId: args.orgId, category: args.category, suggestionText: args.toText(result), basedOn: args.basedOn })
      .returning();
    if (!row) throw new Error("insert de ai_suggestion no devolvió fila");
    await logCall(args.orgId, args.purpose, completion, latencyMs, tx);
    return row;
  });

  return { ok: true, data: { suggestion, parsed: result } };
}

// ─── Agente revisor ────────────────────────────────────────────────────────────────────────────
//
// Revisa las entregas que ya se dieron por terminadas y dejan evidencia. Corre solo, por cron, y
// nunca en el camino de quien completa un objetivo: la revisión es posterior y asíncrona a
// propósito. Un revisor que bloqueara el botón de 'dar por terminado' convertiría cada entrega en
// un trámite, y el producto quedaría a merced de que el modelo responda.
//
// Su veredicto tampoco toca el ledger. Los puntos ya se pagaron al completarse — ver
// server/ai/prompts/review.ts para por qué quitar lo ya ganado sería contraproducente.

const MAX_REVIEW_OUTPUT_TOKENS = 512;

export interface ReviewOutcome {
  objectiveId: string;
  verdict: "aprobada" | "rechazada";
  note: string;
}

/**
 * Revisa UN objetivo ya completado que dejó evidencia.
 *
 * Devuelve null cuando no hay nada que revisar (no existe, no está completado, no dejó evidencia
 * o ya se revisó): que no haya trabajo pendiente no es un error, y tratarlo como tal llenaría los
 * logs del cron de ruido cada vez que corra sobre una empresa al día.
 */
export async function reviewObjective(
  orgId: string,
  objectiveId: string,
  provider?: SuggestionProvider,
): Promise<ReviewOutcome | null> {
  const [row] = await db
    .select({ objetivo: objective, needTitle: orgNeed.title })
    .from(objective)
    .leftJoin(orgNeed, eq(orgNeed.id, objective.needId))
    .where(and(eq(objective.id, objectiveId), eq(objective.orgId, orgId)))
    .limit(1);

  const obj = row?.objetivo;
  if (!obj || obj.status !== "completed" || !obj.evidenceValue) return null;
  if (obj.reviewStatus !== "sin_revisar") return null;

  const resolved = provider ?? new AnthropicSuggestionProvider(requireEnv("ANTHROPIC_API_KEY"));
  const prompt = buildReviewPrompt({
    title: obj.title,
    description: obj.description,
    evidenceLabel: evidenceKind(obj.evidenceType)?.label ?? obj.evidenceType,
    evidenceValue: obj.evidenceValue,
    needTitle: row?.needTitle ?? null,
  });

  const startedAt = Date.now();
  let completion: SuggestionCompletion;
  try {
    completion = await resolved.complete(REVIEW_SYSTEM_PROMPT, prompt);
  } catch {
    // El objetivo se queda en sin_revisar y la siguiente corrida lo vuelve a tomar. No se marca
    // rechazada: un fallo del proveedor no es un veredicto sobre el trabajo de nadie.
    return null;
  }

  const parsed = reviewSchema.safeParse(parseCompletion(completion.text));
  if (!parsed.success) return null;

  const latencyMs = Date.now() - startedAt;
  await db.transaction(async (tx) => {
    await tx
      .update(objective)
      .set({
        reviewStatus: parsed.data.verdict,
        reviewNote: parsed.data.note,
        reviewedAt: new Date(),
      })
      // Condicionado a sin_revisar: si otra corrida del cron se adelantó, esta no la pisa.
      .where(and(eq(objective.id, objectiveId), eq(objective.reviewStatus, "sin_revisar")));

    await tx.insert(llmCalls).values({
      orgId,
      purpose: "revision",
      modelId: MODEL_ID,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      cacheReadTokens: completion.usage.cacheReadTokens,
      cacheWriteTokens: completion.usage.cacheWriteTokens,
      latencyMs,
      finishReason: completion.finishReason,
      costUsd: estimateCostUsd(completion.usage).toFixed(6),
    });
  });

  return { objectiveId, verdict: parsed.data.verdict, note: parsed.data.note };
}

/** Cuántas entregas revisa el agente en una sola corrida. Un tope y no todas: cada una es una
 *  llamada al proveedor, y una empresa que entregue cien de golpe no debe vaciar el presupuesto
 *  de IA de una pasada. Lo que no alcanzó se queda en sin_revisar y lo toma la siguiente. */
const MAX_REVIEWS_PER_RUN = 20;

/**
 * El agente revisor: toma las entregas con evidencia que nadie ha revisado, de todas las empresas,
 * y las revisa de una en una.
 *
 * Sin orgId de por medio a propósito: no corre en nombre de nadie ni desde una sesión, lo dispara
 * el cron (ver app/api/cron/revisiones/route.ts). El aislamiento entre empresas no se pierde — cada
 * revisión solo ve su propio objetivo y escribe su propia fila.
 */
export async function reviewPendingObjectives(
  provider?: SuggestionProvider,
): Promise<{ reviewed: number; approved: number; rejected: number }> {
  const pendientes = await db
    .select({ id: objective.id, orgId: objective.orgId })
    .from(objective)
    .where(
      and(
        eq(objective.status, "completed"),
        eq(objective.reviewStatus, "sin_revisar"),
        isNotNull(objective.evidenceValue),
      ),
    )
    .limit(MAX_REVIEWS_PER_RUN);

  let approved = 0;
  let rejected = 0;
  for (const p of pendientes) {
    const outcome = await reviewObjective(p.orgId, p.id, provider);
    if (!outcome) continue;
    if (outcome.verdict === "aprobada") approved++;
    else rejected++;
  }

  return { reviewed: approved + rejected, approved, rejected };
}
