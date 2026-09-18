// El agente revisor, con el proveedor de IA simulado por completo — nunca se llama a la API real de
// Anthropic ni se necesita ANTHROPIC_API_KEY para correr esta suite (mismo patrón que
// tests/ai-gateway.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, objective, llmCalls } from "@jotapuntoce/db/schema";
import {
  reviewObjective,
  type SuggestionCompletion,
  type SuggestionProvider,
} from "../server/ai/gateway.ts";

class FakeReviewer implements SuggestionProvider {
  calls = 0;
  constructor(private readonly body: string) {}

  async complete(): Promise<SuggestionCompletion> {
    this.calls++;
    return {
      text: this.body,
      usage: { inputTokens: 90, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 },
      finishReason: "end_turn",
    };
  }
}

const aprobador = () =>
  new FakeReviewer(JSON.stringify({ verdict: "aprobada", note: "El enlace corresponde." }));

async function makeOrg(suffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${suffix}`, slug: `test-org-rev-${suffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

async function makeObjective(orgId: string, overrides: Partial<typeof objective.$inferInsert> = {}) {
  const [row] = await db
    .insert(objective)
    .values({
      orgId,
      title: "Publicar el catálogo nuevo",
      impactWeight: 20,
      dueDate: new Date(),
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("insert de objective no devolvió fila");
  return row;
}

const createdOrgIds: string[] = [];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
});

describe("reviewObjective", () => {
  it(
    "WHEN un objetivo completado dejó evidencia THE SYSTEM SHALL guardar el veredicto y la nota, " +
      "y registrar la llamada en llm_calls",
    async () => {
      const org = await makeOrg("ok");
      createdOrgIds.push(org.id);
      const obj = await makeObjective(org.id, {
        status: "completed",
        completedAt: new Date(),
        evidenceType: "enlace",
        evidenceValue: "https://ejemplo.com/catalogo",
      });

      const outcome = await reviewObjective(org.id, obj.id, aprobador());

      expect(outcome).not.toBeNull();
      expect(outcome?.verdict).toBe("aprobada");

      const [fila] = await db.select().from(objective).where(eq(objective.id, obj.id));
      expect(fila?.reviewStatus).toBe("aprobada");
      expect(fila?.reviewNote).toBe("El enlace corresponde.");
      expect(fila?.reviewedAt).not.toBeNull();

      const calls = await db.select().from(llmCalls).where(eq(llmCalls.orgId, org.id));
      expect(calls.length).toBe(1);
      expect(calls[0]?.purpose).toBe("revision");
    },
  );

  it(
    "WHEN el objetivo no dejó evidencia, o ya se revisó THE SYSTEM SHALL no llamar al proveedor — " +
      "el cron corre cada hora y una empresa al día no debe costar una llamada por objetivo",
    async () => {
      const org = await makeOrg("nada");
      createdOrgIds.push(org.id);

      const sinEvidencia = await makeObjective(org.id, {
        status: "completed",
        completedAt: new Date(),
      });
      const yaRevisado = await makeObjective(org.id, {
        status: "completed",
        completedAt: new Date(),
        evidenceType: "nota",
        evidenceValue: "Junta con el cliente el martes.",
        reviewStatus: "aprobada",
      });

      const proveedor = aprobador();
      expect(await reviewObjective(org.id, sinEvidencia.id, proveedor)).toBeNull();
      expect(await reviewObjective(org.id, yaRevisado.id, proveedor)).toBeNull();
      expect(proveedor.calls).toBe(0);
    },
  );

  it(
    "WHEN el modelo contesta algo que no cumple el esquema THE SYSTEM SHALL dejar el objetivo en " +
      "sin_revisar — un fallo del proveedor no es un veredicto sobre el trabajo de nadie",
    async () => {
      const org = await makeOrg("basura");
      createdOrgIds.push(org.id);
      const obj = await makeObjective(org.id, {
        status: "completed",
        completedAt: new Date(),
        evidenceType: "numero",
        evidenceValue: "18",
      });

      const outcome = await reviewObjective(org.id, obj.id, new FakeReviewer("no soy json"));

      expect(outcome).toBeNull();
      const [fila] = await db.select().from(objective).where(eq(objective.id, obj.id));
      expect(fila?.reviewStatus).toBe("sin_revisar");
    },
  );

  it("WHEN el objetivo es de otra empresa THE SYSTEM SHALL no revisarlo", async () => {
    const orgA = await makeOrg("a");
    createdOrgIds.push(orgA.id);
    const orgB = await makeOrg("b");
    createdOrgIds.push(orgB.id);

    const obj = await makeObjective(orgA.id, {
      status: "completed",
      completedAt: new Date(),
      evidenceType: "enlace",
      evidenceValue: "https://ejemplo.com/a",
    });

    expect(await reviewObjective(orgB.id, obj.id, aprobador())).toBeNull();
  });
});
