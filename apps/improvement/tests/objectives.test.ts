// Integración real contra el proyecto Supabase de desarrollo (blueprint §13 — sin base de datos de
// test aislada en v1), mismo patrón que tests/auth/guard.test.ts. Cada test limpia sus propias filas
// en afterEach vía cascade de organization, nunca depende del orden.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, objective, employeePointsLedger } from "@jotapuntoce/db/schema";
import { completeObjective, listObjectives } from "../server/objectives/mutations.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-obj-${nameSuffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

async function makeProfile(id: string, email: string) {
  const [p] = await db.insert(profile).values({ id, email }).returning();
  if (!p) throw new Error("insert de profile no devolvió fila");
  return p;
}

async function makeOwner(orgId: string) {
  const ownerId = crypto.randomUUID();
  await makeProfile(ownerId, `${ownerId}@example.com`);
  await db.insert(membership).values({ userId: ownerId, orgId, role: "owner", acceptedAt: new Date() });
  return ownerId;
}

async function makeObjective(orgId: string, overrides: Partial<typeof objective.$inferInsert> = {}) {
  const [obj] = await db
    .insert(objective)
    .values({
      orgId,
      title: `Objetivo de prueba ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      impactWeight: 10,
      dueDate: new Date(),
      ...overrides,
    })
    .returning();
  if (!obj) throw new Error("insert de objective no devolvió fila");
  return obj;
}

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  // Cascade FK a organization borra objective y employee_points_ledger — mismo patrón probado en
  // tests/auth/guard.test.ts.
  if (createdOrgIds.length) {
    for (const orgId of createdOrgIds.splice(0)) {
      await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
    }
  }
  if (createdProfileIds.length) {
    for (const userId of createdProfileIds.splice(0)) {
      await db.delete(profile).where(sql`${profile.id} = ${userId}`);
    }
  }
});

describe("completeObjective", () => {
  it(
    "WHEN un owner completa un objetivo con impact_weight = 40 THE SYSTEM SHALL insertar " +
      "exactamente una fila en employee_points_ledger con points = 400",
    async () => {
      const org = await makeOrg("points");
      createdOrgIds.push(org.id);
      const ownerId = await makeOwner(org.id);
      createdProfileIds.push(ownerId);
      const obj = await makeObjective(org.id, { impactWeight: 40, assignedEmployeeId: ownerId });

      const result = await completeObjective(ownerId, org.id, obj.id);

      expect(result.ok).toBe(true);
      const ledgerRows = await db
        .select()
        .from(employeePointsLedger)
        .where(eq(employeePointsLedger.objectiveId, obj.id));
      expect(ledgerRows.length).toBe(1);
      expect(ledgerRows[0]?.points).toBe(400);
    },
  );

  it(
    "WHEN el mismo objetivo se intenta completar una segunda vez THE SYSTEM SHALL rechazar la " +
      "mutación y no insertar una segunda fila en el ledger",
    async () => {
      const org = await makeOrg("dup");
      createdOrgIds.push(org.id);
      const ownerId = await makeOwner(org.id);
      createdProfileIds.push(ownerId);
      const obj = await makeObjective(org.id, { impactWeight: 20, assignedEmployeeId: ownerId });

      const first = await completeObjective(ownerId, org.id, obj.id);
      expect(first.ok).toBe(true);

      const second = await completeObjective(ownerId, org.id, obj.id);
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("VALIDATION_ERROR");

      const ledgerRows = await db
        .select()
        .from(employeePointsLedger)
        .where(eq(employeePointsLedger.objectiveId, obj.id));
      expect(ledgerRows.length).toBe(1);
    },
  );
});

describe("listObjectives", () => {
  it(
    "WHEN un empleado del org A solicita la lista de objetivos del org B THE SYSTEM SHALL " +
      "devolver 404",
    async () => {
      const orgA = await makeOrg("a");
      createdOrgIds.push(orgA.id);
      const orgB = await makeOrg("b");
      createdOrgIds.push(orgB.id);

      const employeeOfA = crypto.randomUUID();
      await makeProfile(employeeOfA, `${employeeOfA}@example.com`);
      createdProfileIds.push(employeeOfA);
      await db
        .insert(membership)
        .values({ userId: employeeOfA, orgId: orgA.id, role: "employee", acceptedAt: new Date() });
      // Deliberadamente sin membership en orgB.

      await expect(listObjectives(employeeOfA, orgB.id)).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
    },
  );

  it("WHEN se piden más de 100 objetivos por página THE SYSTEM SHALL limitar la respuesta a 100", async () => {
    const org = await makeOrg("page");
    createdOrgIds.push(org.id);
    const ownerId = await makeOwner(org.id);
    createdProfileIds.push(ownerId);

    await db.insert(objective).values(
      Array.from({ length: 105 }, (_, i) => ({
        orgId: org.id,
        title: `Objetivo paginado ${i}`,
        impactWeight: 10,
        dueDate: new Date(),
      })),
    );

    const { data } = await listObjectives(ownerId, org.id, { limit: 500 });

    expect(data.objectives.length).toBe(100);
    expect(data.nextCursor).not.toBeNull();
  });
});
