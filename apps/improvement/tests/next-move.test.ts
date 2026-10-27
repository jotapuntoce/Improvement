// El siguiente mejor movimiento (server/ai/nextMove.ts) contra el Supabase de desarrollo. El proveedor se
// simula por completo (FakeProvider): nunca la API real. El dueño se siembra sin otros orgs.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, llmCalls, membership, objective, orgNeed, organization, profile } from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { getPortfolioNextMove, refreshNextMove } from "../server/ai/nextMove.ts";
import { loadOwnerTasks } from "../server/tasks/loadOwnerTasks.ts";

class FakeProvider implements SuggestionProvider {
  calls = 0;
  async complete(): Promise<SuggestionCompletion> {
    this.calls++;
    return {
      text: JSON.stringify({ jugada: "Llama a tus tres clientes en riesgo.", impacto: "Retener 2 cuentas" }),
      usage: { inputTokens: 100, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 },
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

async function setup() {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-next-move", slug: `t-next-move-${crypto.randomUUID()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const people = { owner: "", employee: "" };
  for (const role of ["owner", "employee"] as const) {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId: org.id, role, acceptedAt: new Date() });
    people[role] = id;
  }
  return { orgId: org.id, ...people };
}

const DAY = 86_400_000;
const suggestionAgo = (orgId: string, days: number) =>
  db.insert(aiSuggestion).values({
    orgId, category: "siguiente_movimiento", suggestionText: `Jugada de hace ${days} días`, basedOn: {},
    generatedAt: new Date(Date.now() - days * DAY),
  });
const openObjective = (orgId: string) =>
  db.insert(objective).values({ orgId, title: "Cerrar el trimestre", impactWeight: 10, dueDate: new Date(Date.now() + 5 * DAY) });

describe("refreshNextMove", () => {
  it("WHEN el dueño la pide con una necesidad abierta THE SYSTEM SHALL guardar la sugerencia con needIds y su llm_calls", async () => {
    const { orgId, owner } = await setup();
    const [need] = await db.insert(orgNeed).values({ orgId, title: "Ventas bajas" }).returning();
    const res = await refreshNextMove(owner, orgId, new FakeProvider());
    expect(res.ok).toBe(true);

    const [s] = await db.select().from(aiSuggestion).where(eq(aiSuggestion.orgId, orgId));
    expect(s?.category).toBe("siguiente_movimiento");
    expect((s?.basedOn as { needIds: string[] }).needIds).toContain(need?.id);
    const calls = await db
      .select()
      .from(llmCalls)
      .where(and(eq(llmCalls.orgId, orgId), eq(llmCalls.purpose, "siguiente_movimiento")));
    expect(calls).toHaveLength(1);
  });

  it("WHEN un empleado la pide THE SYSTEM SHALL devolver FORBIDDEN sin llamar al proveedor", async () => {
    const { orgId, employee } = await setup();
    const provider = new FakeProvider();
    const res = await refreshNextMove(employee, orgId, provider);
    expect(res.ok ? null : res.error.code).toBe("FORBIDDEN");
    expect(provider.calls).toBe(0);
  });
});

describe("getPortfolioNextMove", () => {
  it("WHEN hay una sugerencia de hace 2 días THE SYSTEM SHALL devolver fuente ia con su texto", async () => {
    const { orgId, owner } = await setup();
    await suggestionAgo(orgId, 2);
    expect(await getPortfolioNextMove(owner)).toMatchObject({ fuente: "ia", orgId, text: "Jugada de hace 2 días" });
  });

  it("WHEN no hay sugerencia y hay objetivos abiertos THE SYSTEM SHALL devolver la primera tarea de Pareto", async () => {
    const { orgId, owner } = await setup();
    await openObjective(orgId);
    const [first] = await loadOwnerTasks(owner);
    expect(await getPortfolioNextMove(owner)).toMatchObject({ fuente: "pareto", text: first?.title });
  });

  it("WHEN la única sugerencia tiene 8 días THE SYSTEM SHALL usar Pareto; sin nada, null", async () => {
    const { orgId, owner } = await setup();
    await suggestionAgo(orgId, 8);
    expect(await getPortfolioNextMove(owner)).toBeNull();
    await openObjective(orgId);
    expect(await getPortfolioNextMove(owner)).toMatchObject({ fuente: "pareto", text: "Cerrar el trimestre" });
  });
});
