// Único módulo de todo el repo que importa @anthropic-ai/sdk (regla .claude/rules/ia-gateway.md,
// verificado por grep en el Verify de esta tarea). Model id resuelto vía la skill claude-api antes
// de escribir esta llamada (blueprint §17) — vive en MODEL_ID, nunca inline en el call site.
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, isNotNull } from "drizzle-orm";
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
import type { SystemPrompt } from "./prompts/burbuja.ts";
import {
  buildDirectorPrompt,
  DIRECTOR_SCHEMAS,
  DIRECTOR_SYSTEM_PROMPT,
  type DirectorContext,
  type DirectorOutput,
  type DirectorPhase,
} from "./prompts/director.ts";

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

/** Una herramienta ofrecida al modelo. `inputSchema` es JSON Schema, no zod: el proveedor no
 *  conoce zod, y el catálogo lo traduce con z.toJSONSchema() al registrarse. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** El modelo pidió usar una herramienta. `input` llega sin validar — lo valida el catálogo. */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Un turno del hilo, en los términos de esta casa y no en los del SDK.
 *
 * "results" es un turno de usuario que solo lleva resultados de herramienta. Existe como rol
 * propio porque mezclarlo con "user" obligaría a cada llamador a saber cómo el proveedor empaqueta
 * un tool_result, que es justo lo que este archivo existe para esconder.
 */
export type ConversationMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "results"; results: { id: string; content: string; isError?: boolean }[] };

export interface ConversationTurn {
  text: string;
  toolCalls: ToolCall[];
  usage: SuggestionUsage;
  finishReason: string;
}

/**
 * Frontera para la burbuja, hermana de SuggestionProvider.
 *
 * Va aparte y no como un método opcional de aquella porque son dos formas distintas de hablar: una
 * pide un JSON de una sola vuelta, la otra sostiene un hilo con herramientas. Un test de la
 * burbuja implementa esta y nada más.
 */
export interface ConversationProvider {
  converse(
    system: SystemPrompt,
    messages: ConversationMessage[],
    tools: ToolSpec[],
  ): Promise<ConversationTurn>;
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
export class AnthropicSuggestionProvider implements SuggestionProvider, ConversationProvider {
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  // El tope de salida entra por constructor y no por el call site: el revisor contesta un
  // veredicto de dos líneas y el Director General un análisis, y pagarle a los dos el techo del
  // más largo es tirar presupuesto en cada revisión.
  constructor(apiKey: string, maxTokens = MAX_OUTPUT_TOKENS) {
    this.client = new Anthropic({ apiKey });
    this.maxTokens = maxTokens;
  }

  async complete(system: string, prompt: string): Promise<SuggestionCompletion> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL_ID,
        max_tokens: this.maxTokens,
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

  /**
   * Un turno del hilo de la burbuja, con herramientas.
   *
   * Traduce en las dos direcciones para que el resto del repo no vea un tipo del SDK: los
   * ConversationMessage de la casa entran como bloques de Anthropic, y los bloques de vuelta
   * salen como texto + toolCalls. Las excepciones se mapean igual que en `complete`.
   */
  async converse(
    system: SystemPrompt,
    messages: ConversationMessage[],
    tools: ToolSpec[],
  ): Promise<ConversationTurn> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL_ID,
        max_tokens: this.maxTokens,
        // UN solo punto de corte del caché, al final del bloque estable. El proveedor cachea todo
        // lo que va ANTES en el orden de la request —las herramientas primero, luego el system—,
        // así que este único marcador cubre los ~5.500 tokens fijos. El bloque volátil queda
        // fuera a propósito: cambia al navegar, y meterlo adentro invalidaría el caché en cada
        // cambio de pantalla, que es justo lo que más pasa aquí.
        system: [
          { type: "text", text: system.estable, cache_control: { type: "ephemeral" } },
          { type: "text", text: system.volatil },
        ],
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages: messages.map(aBloques),
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new ProviderRateLimitError();
      if (err instanceof Anthropic.BadRequestError) throw new ProviderRequestError(err.message);
      throw err;
    }

    return {
      text: response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim(),
      toolCalls: response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input })),
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

/** Un mensaje de la casa, en bloques del SDK. Única función que conoce las dos formas. */
function aBloques(m: ConversationMessage): Anthropic.MessageParam {
  if (m.role === "user") return { role: "user", content: m.text };

  if (m.role === "results") {
    return {
      role: "user",
      content: m.results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      })),
    };
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (m.text) content.push({ type: "text", text: m.text });
  for (const c of m.toolCalls) {
    content.push({ type: "tool_use", id: c.id, name: c.name, input: c.input ?? {} });
  }
  // Un turno de asistente vacío hace fallar la request entera con 400. Puede pasar si el modelo
  // contestó solo herramientas y ninguna se pudo leer: mandamos un punto en vez de nada.
  return { role: "assistant", content: content.length > 0 ? content : "." };
}

/**
 * Los tokens cacheados NO cuestan lo mismo que los normales, y desde que la burbuja activa el
 * caché esto dejó de ser un detalle: leer de caché vale 0.1x y escribirlo 1.25x. Cobrarlos a
 * precio de entrada haría que llm_calls reportara hasta diez veces el gasto real justo en el
 * camino que más se usa — y un tablero de costos que exagera se deja de mirar igual que uno que
 * miente para abajo.
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

function estimateCostUsd(usage: SuggestionUsage): number {
  const entrada =
    usage.inputTokens +
    usage.cacheReadTokens * CACHE_READ_MULTIPLIER +
    usage.cacheWriteTokens * CACHE_WRITE_MULTIPLIER;
  return (
    (entrada * PRICING_USD_PER_MTOK.input) / 1_000_000 +
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

type GatewayErrorCode =
  | "RATE_LIMITED"
  | "PROVIDER_RATE_LIMIT"
  | "VALIDATION_ERROR"
  | "INTERNAL"
  /** Falta una variable de entorno. No es culpa de quien preguntó y no se arregla reintentando. */
  | "CONFIG_ERROR";

/**
 * Resuelve el proveedor sin dejar que `requireEnv` tumbe la request.
 *
 * Existe porque los tres caminos del gateway construían el adaptador FUERA de su try, así que una
 * `ANTHROPIC_API_KEY` vacía salía como excepción cruda: Next contestaba un 500 con HTML, el
 * `res.json()` del navegador fallaba, y la pantalla terminaba diciendo "se cayó la conexión" — que
 * es mentira, el servidor contestó. El error se perdía justo cuando era el más fácil de arreglar.
 *
 * Que el mensaje de `requireEnv` viaje al cliente es deliberado: nombra la variable que falta, no
 * su valor, y es exactamente lo que necesita ver quien está configurando el proyecto.
 */
export function resolverProveedor<T>(
  inyectado: T | undefined,
  crear: () => T,
): { ok: true; provider: T } | { ok: false; error: { code: GatewayErrorCode; retryable: boolean; message: string } } {
  if (inyectado) return { ok: true, provider: inyectado };
  try {
    return { ok: true, provider: crear() };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        retryable: false,
        message: err instanceof Error ? err.message : "Falta configurar el proveedor de IA.",
      },
    };
  }
}
export type GatewayResult =
  | { ok: true; data: typeof aiSuggestion.$inferSelect }
  | { ok: false; error: { code: GatewayErrorCode; retryable: boolean; message: string } };

/**
 * WHEN un org ya generó 10 sugerencias en la última hora THE SYSTEM SHALL rechazar la 11ª sin
 * llamar al proveedor (criterio #4) — el conteo corre ANTES de resolver el proveedor o tocar áreas
 * /objetivos/clientes, para que un org bloqueado nunca dispare ni una query de más.
 */
async function hasReachedHourlyLimit(
  orgId: string,
  purpose = "suggestion",
  max = MAX_SUGGESTIONS_PER_HOUR,
): Promise<boolean> {
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
  return rows.length >= max;
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

  const elegido = resolverProveedor(
    provider,
    () => new AnthropicSuggestionProvider(requireEnv("ANTHROPIC_API_KEY")),
  );
  if (!elegido.ok) return elegido;
  const resolvedProvider = elegido.provider;

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

  const resolved =
    provider ?? new AnthropicSuggestionProvider(requireEnv("ANTHROPIC_API_KEY"), MAX_REVIEW_OUTPUT_TOKENS);
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

// ─── El Director General ───────────────────────────────────────────────────────────────────────
//
// La tercera clase de llamada que pasa por este gateway, junto con las sugerencias sueltas y el
// revisor. La diferencia no es el modelo: es que esta trae contexto acumulado (lo que el dueño le
// contó, cómo salieron las vueltas anteriores) y que su salida mueve una máquina de estados en
// vez de escribir una tarjeta.
//
// Mismo contrato que las otras dos, y a propósito: mismo proveedor inyectable, mismo tope por
// hora antes de tocar la red, misma validación con zod y un solo reintento, mismo renglón en
// llm_calls. Que las tres se comporten igual es lo que hace que el costo de IA de una empresa se
// pueda leer de una sola tabla.

/** Tope de llamadas del motor por empresa por hora. Un ciclo completo son cinco llamadas; con 20
 *  caben cuatro vueltas por hora, muy por encima de lo que un cron diario puede pedir. El
 *  tope existe para el caso en que algo se cicle, no para racionar el uso normal. */
const MAX_DIRECTOR_CALLS_PER_HOUR = 20;
/**
 * Sube a 3072 desde que la inferencia corre el Análisis de Causa Raíz.
 *
 * Esa fase ya no devuelve un párrafo: devuelve la cadena de hasta siete porqués, la raíz, su
 * categoría, los factores contribuyentes y la evidencia. Con 2048 el peor caso se trunca a media
 * llave, el JSON no parsea y la fase no avanza — seguro, pero deja el ciclo dando vueltas contra
 * el mismo límite cada día y gastando la llamada igual. El techo se mide contra el esquema, no
 * contra lo que el modelo suele escribir.
 */
const MAX_DIRECTOR_OUTPUT_TOKENS = 3072;

export type DirectorResult<P extends DirectorPhase> =
  | { ok: true; data: DirectorOutput<P> }
  | { ok: false; error: { code: GatewayErrorCode; retryable: boolean; message: string } };

/**
 * Corre UNA fase del motor contra el modelo y devuelve su salida ya validada.
 *
 * No escribe en improvement_cycle: eso lo hace phases.ts, que es quien sabe qué columna le toca a
 * cada fase y qué transición sigue. Este gateway hace lo suyo —hablar con el proveedor, validar,
 * cobrar el renglón de costo— y nada más. Si escribiera el ciclo, una falla del proveedor dejaría
 * el estado a medias en dos módulos distintos.
 */
export async function runDirectorPhase<P extends DirectorPhase>(
  orgId: string,
  context: DirectorContext & { phase: P },
  provider?: SuggestionProvider,
): Promise<DirectorResult<P>> {
  if (await hasReachedHourlyLimit(orgId, "director", MAX_DIRECTOR_CALLS_PER_HOUR)) {
    return {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        retryable: false,
        message: `El motor ya hizo ${MAX_DIRECTOR_CALLS_PER_HOUR} llamadas en la última hora.`,
      },
    };
  }

  const elegido = resolverProveedor(
    provider,
    () => new AnthropicSuggestionProvider(requireEnv("ANTHROPIC_API_KEY"), MAX_DIRECTOR_OUTPUT_TOKENS),
  );
  if (!elegido.ok) return elegido;
  const resolved = elegido.provider;
  const prompt = buildDirectorPrompt(context);
  const schema = DIRECTOR_SCHEMAS[context.phase];

  const startedAt = Date.now();
  let completion: SuggestionCompletion;
  try {
    completion = await resolved.complete(DIRECTOR_SYSTEM_PROMPT, prompt);
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

  let parsed = schema.safeParse(parseCompletion(completion.text));
  if (!parsed.success) {
    // Un solo reintento en fallo de validación (regla ia-gateway.md), después falla explícito.
    // La fase se queda donde estaba y la siguiente corrida del cron la vuelve a intentar: el
    // ciclo no avanza a ciegas con una salida que no se pudo leer.
    try {
      completion = await resolved.complete(DIRECTOR_SYSTEM_PROMPT, prompt);
    } catch {
      return {
        ok: false,
        error: { code: "INTERNAL", retryable: false, message: "El reintento tras un fallo de validación también falló." },
      };
    }
    parsed = schema.safeParse(parseCompletion(completion.text));
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          retryable: false,
          message: "La respuesta del modelo no cumplió el esquema de la fase tras un reintento.",
        },
      };
    }
  }

  // El renglón de costo se escribe aunque el ciclo después falle al guardar: la llamada ya se
  // pagó, y un gasto que no aparece en llm_calls es un gasto que nadie va a encontrar.
  await db.insert(llmCalls).values({
    orgId,
    purpose: "director",
    modelId: MODEL_ID,
    inputTokens: completion.usage.inputTokens,
    outputTokens: completion.usage.outputTokens,
    cacheReadTokens: completion.usage.cacheReadTokens,
    cacheWriteTokens: completion.usage.cacheWriteTokens,
    latencyMs: Date.now() - startedAt,
    finishReason: completion.finishReason,
    costUsd: estimateCostUsd(completion.usage).toFixed(6),
  });

  return { ok: true, data: parsed.data as DirectorOutput<P> };
}

/** La burbuja contesta en prosa, no en JSON, y puede pedir varias herramientas en un turno: le
 *  toca su propio techo, más alto que el del revisor y más bajo que el de una fase del motor. */
const MAX_BURBUJA_OUTPUT_TOKENS = 2048;
/** Por org y por hora. Una conversación normal gasta entre dos y cuatro turnos; 60 deja hablar
 *  toda la tarde y corta una pestaña que se quedó girando sola. */
const MAX_BURBUJA_CALLS_PER_HOUR = 60;

export type ConversationResult =
  | { ok: true; data: ConversationTurn }
  | { ok: false; error: { code: GatewayErrorCode; retryable: boolean; message: string } };

/**
 * Un turno de la burbuja: cobra, llama y deja el renglón de costo.
 *
 * No trae el bucle de herramientas — ese vive en conversation.ts, que es quien sabe qué hace cada
 * una. Aquí solo pasa lo que ya hacía `runDirectorPhase`: límite por hora ANTES de llamar, mapeo
 * de errores del proveedor y una fila en llm_calls por llamada pagada. El bucle llama a esto una
 * vez por vuelta, así que cada vuelta se cobra por separado y una conversación cara se ve.
 */
export async function runConversationTurn(
  orgId: string,
  system: SystemPrompt,
  messages: ConversationMessage[],
  tools: ToolSpec[],
  provider?: ConversationProvider,
): Promise<ConversationResult> {
  if (await hasReachedHourlyLimit(orgId, "burbuja", MAX_BURBUJA_CALLS_PER_HOUR)) {
    return {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        retryable: false,
        message: "Hablamos mucho esta hora. Dame unos minutos y seguimos.",
      },
    };
  }

  const elegido = resolverProveedor(
    provider,
    () => new AnthropicSuggestionProvider(requireEnv("ANTHROPIC_API_KEY"), MAX_BURBUJA_OUTPUT_TOKENS),
  );
  if (!elegido.ok) return elegido;
  const resolved = elegido.provider;

  const startedAt = Date.now();
  let turn: ConversationTurn;
  try {
    turn = await resolved.converse(system, messages, tools);
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

  await db.insert(llmCalls).values({
    orgId,
    purpose: "burbuja",
    modelId: MODEL_ID,
    inputTokens: turn.usage.inputTokens,
    outputTokens: turn.usage.outputTokens,
    cacheReadTokens: turn.usage.cacheReadTokens,
    cacheWriteTokens: turn.usage.cacheWriteTokens,
    latencyMs: Date.now() - startedAt,
    finishReason: turn.finishReason,
    costUsd: estimateCostUsd(turn.usage).toFixed(6),
  });

  return { ok: true, data: turn };
}
