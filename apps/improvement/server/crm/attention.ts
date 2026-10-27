// La IA de atención al cliente: con la hiperpersonalización y los tratos de un cliente, sugiere cómo
// atenderlo y avisa si se le está incumpliendo lo que espera (unmet_note en client_preference).
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, client, clientPreference, deal } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { generateStructured, type SuggestionProvider } from "../ai/gateway.ts";
import { ATTENTION_SYSTEM_PROMPT, attentionSchema, buildAttentionPrompt, type Attention } from "../ai/prompts/attention.ts";
import { HIPER_QUESTIONS } from "./preferences.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

type AiSuggestionRow = typeof aiSuggestion.$inferSelect;

export async function suggestAttention(
  userId: string,
  orgId: string,
  clientId: string,
  provider?: SuggestionProvider,
): Promise<Result<{ suggestion: AiSuggestionRow; attention: Attention }>> {
  const { scope } = await resolveSection(userId, orgId, "clientes");
  if (scope !== "empresa") return fail("No puedes pedir sugerencias para este cliente.", "FORBIDDEN");
  if (!z.uuid().safeParse(clientId).success) return fail("Ese cliente no existe en esta empresa.", "NOT_FOUND");

  const [row] = await db
    .select({ name: client.name, healthStatus: client.healthStatus, answers: clientPreference.answers })
    .from(client)
    .leftJoin(clientPreference, eq(clientPreference.clientId, client.id))
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)));
  if (!row) return fail("Ese cliente no existe en esta empresa.", "NOT_FOUND");

  const stored = (row.answers ?? {}) as Record<string, string>;
  const answers = HIPER_QUESTIONS.filter((q) => stored[q.key]?.trim()).map((q) => ({
    question: q.question,
    answer: stored[q.key] as string,
  }));
  if (answers.length === 0) return fail("Primero captura cómo quiere que lo atiendan.");

  const deals = await db
    .select({ id: deal.id, title: deal.title, stage: deal.stage })
    .from(deal)
    .where(and(eq(deal.clientId, clientId), eq(deal.orgId, orgId)));

  const result = await generateStructured({
    orgId,
    purpose: "atencion_cliente",
    category: "servicio_cliente",
    system: ATTENTION_SYSTEM_PROMPT,
    prompt: buildAttentionPrompt({ clientName: row.name, healthStatus: row.healthStatus, answers, deals }),
    schema: attentionSchema,
    toText: (a) => a.suggestionText,
    basedOn: { clientIds: [clientId], dealIds: deals.map((d) => d.id) },
    provider,
  });
  if (!result.ok) return fail(result.error.message, result.error.code);

  const attention = result.data.parsed;
  const unmet = attention.expectativaIncumplida;
  await db
    .update(clientPreference)
    .set({
      unmetNote: unmet ? attention.motivo : null,
      unmetFlaggedAt: unmet ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(clientPreference.clientId, clientId), eq(clientPreference.orgId, orgId)));

  return { ok: true, data: { suggestion: result.data.suggestion, attention } };
}

/** La sugerencia de atención más reciente de este cliente, o null. */
export async function latestAttention(userId: string, orgId: string, clientId: string): Promise<AiSuggestionRow | null> {
  const { scope } = await resolveSection(userId, orgId, "clientes");
  if (scope === "ninguno" || !z.uuid().safeParse(clientId).success) return null;
  const [row] = await db
    .select()
    .from(aiSuggestion)
    .where(
      and(
        eq(aiSuggestion.orgId, orgId),
        eq(aiSuggestion.category, "servicio_cliente"),
        sql`${aiSuggestion.basedOn}->'clientIds' @> ${JSON.stringify([clientId])}::jsonb`,
      ),
    )
    .orderBy(desc(aiSuggestion.generatedAt))
    .limit(1);
  return row ?? null;
}
