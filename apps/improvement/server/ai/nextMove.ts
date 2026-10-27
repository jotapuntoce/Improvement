// El siguiente mejor movimiento: una jugada de la IA por empresa (refreshNextMove, solo el dueño) y, para
// el panel del portafolio, la más reciente de la última semana o, si no hay, la primera tarea de Pareto.
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, membership, orgKpi, orgNeed, ownerMemory } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { computeKpiValues } from "../kpis/sources.ts";
import { loadOwnerTasks, paretoCut } from "../tasks/loadOwnerTasks.ts";
import { generateStructured, type StructuredResult, type SuggestionProvider } from "./gateway.ts";
import { NEXT_MOVE_SYSTEM_PROMPT, buildNextMovePrompt, nextMoveSchema, type NextMovePlay } from "./prompts/nextMove.ts";

export type NextMove =
  | { fuente: "ia"; orgId: string; text: string; generatedAt: Date }
  | { fuente: "pareto"; text: string; context: string; href: string | null };

/** Una sugerencia de la IA vale una semana; después manda Pareto. */
const VIGENCIA_MS = 7 * 86_400_000;

export async function refreshNextMove(
  userId: string,
  orgId: string,
  provider?: SuggestionProvider,
): Promise<StructuredResult<NextMovePlay> | { ok: false; error: { code: "FORBIDDEN"; retryable: false; message: string } }> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", retryable: false, message: "Solo el dueño pide el siguiente movimiento." } };
  }

  const [kpiRows, needs, memory] = await Promise.all([
    db.select().from(orgKpi).where(eq(orgKpi.orgId, orgId)),
    db
      .select({ id: orgNeed.id, title: orgNeed.title, severity: orgNeed.severity, status: orgNeed.status })
      .from(orgNeed)
      .where(and(eq(orgNeed.orgId, orgId), inArray(orgNeed.status, ["abierta", "en_progreso"]))),
    db
      .select({ id: ownerMemory.id, answer: ownerMemory.answer })
      .from(ownerMemory)
      .where(and(eq(ownerMemory.orgId, orgId), eq(ownerMemory.ownerId, userId)))
      .orderBy(desc(ownerMemory.createdAt))
      .limit(20),
  ]);
  const values = await computeKpiValues(kpiRows);

  return generateStructured({
    orgId,
    purpose: "siguiente_movimiento",
    category: "siguiente_movimiento",
    system: NEXT_MOVE_SYSTEM_PROMPT,
    prompt: buildNextMovePrompt({
      kpis: kpiRows.map((k) => ({ label: k.label, value: values.get(k.id) ?? 0 })),
      needs,
      memory: memory.map((m) => m.answer),
    }),
    schema: nextMoveSchema,
    toText: (p) => `${p.jugada} — Impacto: ${p.impacto}`,
    basedOn: { kpiIds: kpiRows.map((k) => k.id), needIds: needs.map((n) => n.id), memoryIds: memory.map((m) => m.id) },
    provider,
  });
}

/** Sin llamar al proveedor: la jugada vigente de la IA en sus empresas, o la primera tarea de Pareto, o null. */
export async function getPortfolioNextMove(userId: string, now = new Date()): Promise<NextMove | null> {
  const [latest] = await db
    .select({ orgId: aiSuggestion.orgId, text: aiSuggestion.suggestionText, generatedAt: aiSuggestion.generatedAt })
    .from(aiSuggestion)
    .innerJoin(membership, and(eq(membership.orgId, aiSuggestion.orgId), eq(membership.userId, userId), eq(membership.role, "owner")))
    .where(and(eq(aiSuggestion.category, "siguiente_movimiento"), gte(aiSuggestion.generatedAt, new Date(now.getTime() - VIGENCIA_MS))))
    .orderBy(desc(aiSuggestion.generatedAt))
    .limit(1);
  if (latest) return { fuente: "ia", ...latest };

  const tasks = await loadOwnerTasks(userId, now);
  const first = tasks[0];
  if (paretoCut(tasks) < 1 || !first) return null;
  return { fuente: "pareto", text: first.title, context: first.context, href: first.href };
}
