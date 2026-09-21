// La memoria que Improvement tiene del dueño. Integración real contra el proyecto Supabase de
// desarrollo (blueprint §13), mismo patrón que tests/objectives.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership } from "@jotapuntoce/db/schema";
import {
  ARRANQUE_QUESTIONS,
  listOwnerMemory,
  nextArranqueQuestion,
  ownerBrief,
  rememberAnswer,
  type OwnerMemoryRow,
} from "../server/owner/memory.ts";

async function makeOrg(suffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${suffix}`, slug: `test-org-mem-${suffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

async function makeMember(orgId: string, role: "owner" | "employee") {
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
  await db.insert(membership).values({ userId, orgId, role, acceptedAt: new Date() });
  return userId;
}

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(sql`${profile.id} = ${userId}`);
  }
});

const primera = ARRANQUE_QUESTIONS[0]!.question;

describe("rememberAnswer", () => {
  it("WHEN quien contesta no es el dueño THE SYSTEM SHALL rechazarlo sin escribir nada", async () => {
    const org = await makeOrg("empleado");
    createdOrgIds.push(org.id);
    const employeeId = await makeMember(org.id, "employee");
    createdProfileIds.push(employeeId);

    const result = await rememberAnswer(employeeId, org.id, {
      question: primera,
      answer: "Yo opino otra cosa",
      topic: "arranque",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(await listOwnerMemory(employeeId, org.id)).toHaveLength(0);
  });

  it(
    "WHEN el dueño contesta dos veces la misma pregunta THE SYSTEM SHALL guardar las DOS — la " +
      "tabla es append-only y cómo pensaba antes es justo lo que hace visible que cambió",
    async () => {
      const org = await makeOrg("append");
      createdOrgIds.push(org.id);
      const ownerId = await makeMember(org.id, "owner");
      createdProfileIds.push(ownerId);

      const uno = await rememberAnswer(ownerId, org.id, {
        question: primera,
        answer: "Una empresa chica pero muy ordenada.",
        topic: "arranque",
      });
      expect(uno.ok).toBe(true);

      const dos = await rememberAnswer(ownerId, org.id, {
        question: primera,
        answer: "Ya no. La quiero grande y con sucursales.",
        topic: "arranque",
      });
      expect(dos.ok).toBe(true);

      const memoria = await listOwnerMemory(ownerId, org.id);
      expect(memoria).toHaveLength(2);
      // ownerBrief se queda con la más reciente: quien va a actuar necesita lo que piensa hoy.
      expect(ownerBrief(memoria)).toContain("grande y con sucursales");
      expect(ownerBrief(memoria)).not.toContain("chica pero muy ordenada");
    },
  );

  it("WHEN el dueño de otra empresa pregunta THE SYSTEM SHALL devolverle 404, nunca el dato", async () => {
    const orgA = await makeOrg("a");
    createdOrgIds.push(orgA.id);
    const orgB = await makeOrg("b");
    createdOrgIds.push(orgB.id);
    const duenoA = await makeMember(orgA.id, "owner");
    createdProfileIds.push(duenoA);
    const duenoB = await makeMember(orgB.id, "owner");
    createdProfileIds.push(duenoB);

    await rememberAnswer(duenoA, orgA.id, {
      question: primera,
      answer: "Algo muy mío sobre mi negocio.",
      topic: "arranque",
    });

    // 404 y no lista vacía: no es miembro de orgA, y la regla de la casa es no confirmarle
    // siquiera que ese org existe (guard.ts, assertMembership).
    await expect(listOwnerMemory(duenoB, orgA.id)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    // En SU propia empresa sí responde, y responde vacío: no hay nada escrito todavía.
    expect(await listOwnerMemory(duenoB, orgB.id)).toHaveLength(0);
  });
});

describe("nextArranqueQuestion", () => {
  const fila = (question: string): OwnerMemoryRow =>
    ({
      id: crypto.randomUUID(),
      orgId: "x",
      ownerId: "y",
      question,
      answer: "algo",
      topic: "arranque",
      createdAt: new Date(),
    }) as OwnerMemoryRow;

  it("WHEN no ha contestado nada THE SYSTEM SHALL preguntar la primera", () => {
    expect(nextArranqueQuestion([])?.question).toBe(primera);
  });

  it("WHEN ya contestó todas THE SYSTEM SHALL devolver null y dejar de preguntar", () => {
    const todas = ARRANQUE_QUESTIONS.map((q) => fila(q.question));
    expect(nextArranqueQuestion(todas)).toBeNull();
  });

  it("WHEN contestó la primera THE SYSTEM SHALL pasar a la siguiente, no repetir", () => {
    const siguiente = nextArranqueQuestion([fila(primera)]);
    expect(siguiente).not.toBeNull();
    expect(siguiente?.question).not.toBe(primera);
  });
});
