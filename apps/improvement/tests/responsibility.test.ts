// Integración real contra el proyecto Supabase de desarrollo (blueprint §13), mismo patrón que
// tests/objectives.test.ts. Cada test limpia sus propias filas en afterEach vía cascade de
// organization, nunca depende del orden.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, objective } from "@jotapuntoce/db/schema";
import { getResponsibilityLevel, listTeamForOwner, responsibilityLevel } from "../server/employees/responsibility.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-resp-${nameSuffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

async function makeProfile(id: string, email: string) {
  const [p] = await db.insert(profile).values({ id, email }).returning();
  if (!p) throw new Error("insert de profile no devolvió fila");
  return p;
}

async function makeMember(orgId: string, role: "owner" | "employee") {
  const userId = crypto.randomUUID();
  await makeProfile(userId, `${userId}@example.com`);
  await db.insert(membership).values({ userId, orgId, role, acceptedAt: new Date() });
  return userId;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  // Cascade FK a organization borra objective y membership — mismo patrón probado en
  // tests/objectives.test.ts.
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

describe("responsibilityLevel", () => {
  it(
    "WHEN un empleado con 3 objetivos completados a tiempo y 1 tarde en la ventana consulta su " +
      "nivel THE SYSTEM SHALL devolver 75",
    async () => {
      const org = await makeOrg("calc");
      createdOrgIds.push(org.id);
      const employeeId = await makeMember(org.id, "employee");
      createdProfileIds.push(employeeId);

      const dueDate = daysAgo(10);
      const onTimeValues = [1, 2, 3].map(() => ({
        orgId: org.id,
        title: "Objetivo a tiempo",
        impactWeight: 10,
        assignedEmployeeId: employeeId,
        dueDate,
        status: "completed" as const,
        completedAt: daysAgo(11), // antes del due_date -> a tiempo
      }));
      await db.insert(objective).values(onTimeValues);
      await db.insert(objective).values({
        orgId: org.id,
        title: "Objetivo tarde",
        impactWeight: 10,
        assignedEmployeeId: employeeId,
        dueDate,
        status: "completed",
        completedAt: daysAgo(9), // después del due_date -> tarde
      });

      const level = await responsibilityLevel(employeeId, org.id);

      expect(level).toBe(75);
    },
  );
});

describe("getResponsibilityLevel", () => {
  it(
    "WHEN el empleado B solicita el responsibility_level del empleado A (mismo org) THE SYSTEM " +
      "SHALL devolver 404, no el valor",
    async () => {
      const org = await makeOrg("cross");
      createdOrgIds.push(org.id);
      const employeeA = await makeMember(org.id, "employee");
      const employeeB = await makeMember(org.id, "employee");
      createdProfileIds.push(employeeA, employeeB);

      await expect(getResponsibilityLevel(employeeB, employeeA, org.id)).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
    },
  );

  it("WHEN el propio empleado consulta su nivel THE SYSTEM SHALL devolver el valor", async () => {
    const org = await makeOrg("self");
    createdOrgIds.push(org.id);
    const employeeId = await makeMember(org.id, "employee");
    createdProfileIds.push(employeeId);

    const level = await getResponsibilityLevel(employeeId, employeeId, org.id);

    expect(typeof level).toBe("number");
  });
});

describe("listTeamForOwner", () => {
  it(
    "WHEN el owner visita /[org]/equipo THE SYSTEM SHALL renderizar la lista de empleados sin un " +
      "campo de nivel de responsabilidad por fila",
    async () => {
      const org = await makeOrg("team");
      createdOrgIds.push(org.id);
      const ownerId = await makeMember(org.id, "owner");
      const employeeId = await makeMember(org.id, "employee");
      createdProfileIds.push(ownerId, employeeId);

      const team = await listTeamForOwner(org.id);

      expect(team.length).toBe(2);
      expect(JSON.stringify(team)).not.toContain("responsibility");
    },
  );
});
