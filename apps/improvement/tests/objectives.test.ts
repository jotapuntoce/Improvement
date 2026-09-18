// Integración real contra el proyecto Supabase de desarrollo (blueprint §13 — sin base de datos de
// test aislada en v1), mismo patrón que tests/auth/guard.test.ts. Cada test limpia sus propias filas
// en afterEach vía cascade de organization, nunca depende del orden.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, objective, orgNeed, employeePointsLedger } from "@jotapuntoce/db/schema";
import {
  assignObjective,
  completeObjective,
  createObjective,
  listObjectives,
} from "../server/objectives/mutations.ts";

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
    "WHEN un owner completa un objetivo de peso 40 que no atiende ninguna necesidad THE SYSTEM " +
      "SHALL insertar exactamente una fila en el ledger con points = 200 — la mitad, porque " +
      "trabajo que no atiende nada que la empresa necesite no mueve a la empresa",
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
      expect(ledgerRows[0]?.points).toBe(200);
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

async function makeEmployee(orgId: string) {
  const userId = crypto.randomUUID();
  await makeProfile(userId, `${userId}@example.com`);
  await db.insert(membership).values({ userId, orgId, role: "employee", acceptedAt: new Date() });
  return userId;
}

async function makeNeed(orgId: string, severity = 2) {
  const [row] = await db
    .insert(orgNeed)
    .values({ orgId, title: `Necesidad ${Date.now()}`, severity })
    .returning();
  if (!row) throw new Error("insert de org_need no devolvió fila");
  return row;
}

describe("createObjective", () => {
  it(
    "WHEN un empleado intenta emitir un objetivo THE SYSTEM SHALL rechazarlo — si pudiera, se " +
      "pondría los puntos que quisiera, y el ledger es moneda canjeable",
    async () => {
      const org = await makeOrg("crea-empleado");
      createdOrgIds.push(org.id);
      const employeeId = await makeEmployee(org.id);
      createdProfileIds.push(employeeId);

      const result = await createObjective(employeeId, org.id, {
        title: "Me asigno trabajo yo solo",
        description: null,
        impactWeight: 100,
        dueDate: new Date(),
        areaId: null,
        assignedEmployeeId: employeeId,
        needId: null,
        kind: "ipa",
        evidenceType: "ninguna",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    },
  );

  it(
    "WHEN el dueño emite un objetivo asignado a alguien que NO es de su equipo THE SYSTEM SHALL " +
      "tratarlo como inexistente",
    async () => {
      const org = await makeOrg("crea-ajeno");
      createdOrgIds.push(org.id);
      const ownerId = await makeOwner(org.id);
      createdProfileIds.push(ownerId);
      const otro = await makeOrg("crea-ajeno-2");
      createdOrgIds.push(otro.id);
      const ajeno = await makeEmployee(otro.id);
      createdProfileIds.push(ajeno);

      const result = await createObjective(ownerId, org.id, {
        title: "Trabajo para alguien de otra empresa",
        description: null,
        impactWeight: 10,
        dueDate: new Date(),
        areaId: null,
        assignedEmployeeId: ajeno,
        needId: null,
        kind: "non_ipa",
        evidenceType: "ninguna",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    },
  );

  it(
    "WHEN el dueño emite un objetivo válido THE SYSTEM SHALL guardarlo con él como emisor, y " +
      "assignObjective SHALL poder pasárselo a otra persona después",
    async () => {
      const org = await makeOrg("crea-ok");
      createdOrgIds.push(org.id);
      const ownerId = await makeOwner(org.id);
      createdProfileIds.push(ownerId);
      const employeeId = await makeEmployee(org.id);
      createdProfileIds.push(employeeId);
      const need = await makeNeed(org.id, 3);

      const result = await createObjective(ownerId, org.id, {
        title: "Levantar el proceso de cobranza",
        description: null,
        impactWeight: 30,
        dueDate: new Date(),
        areaId: null,
        assignedEmployeeId: null,
        needId: need.id,
        kind: "non_ipa",
        evidenceType: "enlace",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.createdBy).toBe(ownerId);
      expect(result.data.needId).toBe(need.id);
      expect(result.data.assignedEmployeeId).toBeNull();

      const reasignado = await assignObjective(ownerId, org.id, result.data.id, employeeId);
      expect(reasignado.ok).toBe(true);
    },
  );
});

describe("evidencia y habilitación", () => {
  it(
    "WHEN un objetivo pide un enlace y se intenta completar sin uno THE SYSTEM SHALL rechazarlo " +
      "y no escribir nada en el ledger",
    async () => {
      const org = await makeOrg("evid");
      createdOrgIds.push(org.id);
      const ownerId = await makeOwner(org.id);
      createdProfileIds.push(ownerId);
      const obj = await makeObjective(org.id, {
        assignedEmployeeId: ownerId,
        evidenceType: "enlace",
      });

      const sinNada = await completeObjective(ownerId, org.id, obj.id);
      expect(sinNada.ok).toBe(false);

      const basura = await completeObjective(ownerId, org.id, obj.id, "no es una url");
      expect(basura.ok).toBe(false);

      const ledger = await db
        .select()
        .from(employeePointsLedger)
        .where(eq(employeePointsLedger.objectiveId, obj.id));
      expect(ledger.length).toBe(0);

      const bien = await completeObjective(
        ownerId,
        org.id,
        obj.id,
        "https://drive.example.com/reporte.pdf",
      );
      expect(bien.ok).toBe(true);

      const [fila] = await db
        .select()
        .from(objective)
        .where(eq(objective.id, obj.id));
      expect(fila?.evidenceValue).toBe("https://drive.example.com/reporte.pdf");
      expect(fila?.evidenceSubmittedAt).not.toBeNull();
    },
  );

  it(
    "WHEN un IPA se completa sobre una necesidad que ya tenía trabajo non-IPA terminado THE " +
      "SYSTEM SHALL pagarle su parte a quien lo habilitó",
    async () => {
      const org = await makeOrg("habilita");
      createdOrgIds.push(org.id);
      const ownerId = await makeOwner(org.id);
      createdProfileIds.push(ownerId);
      const habilitador = await makeEmployee(org.id);
      createdProfileIds.push(habilitador);
      const need = await makeNeed(org.id, 2);

      const indirecto = await makeObjective(org.id, {
        assignedEmployeeId: habilitador,
        needId: need.id,
        kind: "non_ipa",
        impactWeight: 20,
      });
      expect((await completeObjective(habilitador, org.id, indirecto.id)).ok).toBe(true);

      const directo = await makeObjective(org.id, {
        assignedEmployeeId: ownerId,
        needId: need.id,
        kind: "ipa",
        impactWeight: 40,
      });
      const result = await completeObjective(ownerId, org.id, directo.id);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.enablers).toBe(1);
      expect(result.data.enablementShare).toBeGreaterThan(0);

      const delHabilitador = await db
        .select()
        .from(employeePointsLedger)
        .where(eq(employeePointsLedger.employeeId, habilitador));
      // Dos filas: la de su propio objetivo y la parte que le tocó del ingreso que habilitó.
      expect(delHabilitador.length).toBe(2);
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
