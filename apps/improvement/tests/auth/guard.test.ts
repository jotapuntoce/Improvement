// Integración real contra el proyecto Supabase de desarrollo (blueprint §13 — sin base de datos de
// test aislada en v1). Cada test limpia sus propias filas en afterEach, nunca depende del orden.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, objective, employeePointsLedger } from "@jotapuntoce/db/schema";
import { findMembership, isPlatformAdmin } from "../../server/auth/guard.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-${nameSuffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

async function makeProfile(id: string, email: string) {
  const [p] = await db.insert(profile).values({ id, email }).returning();
  if (!p) throw new Error("insert de profile no devolvió fila");
  return p;
}

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  // Expand→contract no aplica a datos de prueba — borrado directo, en orden por FK.
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

describe("findMembership", () => {
  it("WHEN un usuario tiene membership en el org THE SYSTEM SHALL devolver la fila", async () => {
    const org = await makeOrg("a");
    createdOrgIds.push(org.id);
    const userId = crypto.randomUUID();
    await makeProfile(userId, `${userId}@example.com`);
    createdProfileIds.push(userId);
    await db.insert(membership).values({ userId, orgId: org.id, role: "owner" });

    const row = await findMembership(userId, org.id);

    expect(row).not.toBeNull();
    expect(row?.orgId).toBe(org.id);
  });

  it("WHEN un usuario NO tiene membership en el org THE SYSTEM SHALL devolver null", async () => {
    const org = await makeOrg("b");
    createdOrgIds.push(org.id);
    const strangerId = crypto.randomUUID(); // nunca se inserta membership para este id

    const row = await findMembership(strangerId, org.id);

    expect(row).toBeNull();
  });
});

describe("RLS — employee_points_ledger", () => {
  it(
    "WHEN un empleado consulta employee_points_ledger de otro empleado del mismo org (vía la " +
      "política RLS, simulando la sesión de ese empleado) THE SYSTEM SHALL devolver cero filas",
    async () => {
      const org = await makeOrg("rls");
      createdOrgIds.push(org.id);

      const ownerId = crypto.randomUUID();
      const otherEmployeeId = crypto.randomUUID();
      await makeProfile(ownerId, `${ownerId}@example.com`);
      await makeProfile(otherEmployeeId, `${otherEmployeeId}@example.com`);
      createdProfileIds.push(ownerId, otherEmployeeId);
      await db.insert(membership).values([
        { userId: ownerId, orgId: org.id, role: "owner" },
        { userId: otherEmployeeId, orgId: org.id, role: "employee" },
      ]);

      const [obj] = await db
        .insert(objective)
        .values({
          orgId: org.id,
          title: "Objetivo de prueba",
          impactWeight: 50,
          dueDate: new Date(),
          status: "completed",
        })
        .returning();
      if (!obj) throw new Error("insert de objective no devolvió fila");

      // Puntos que pertenecen a otherEmployeeId — ownerId NUNCA debe poder leer esta fila vía RLS.
      await db
        .insert(employeePointsLedger)
        .values({ employeeId: otherEmployeeId, objectiveId: obj.id, orgId: org.id, points: 500 });

      // El cliente `db` normal conecta con el rol postgres (bypasea RLS) — para probar la política
      // de verdad, la conexión debe simular el rol `authenticated` con el JWT de ownerId, exactamente
      // como lo hace PostgREST/Supabase Auth en producción.
      const rowsAsOwner = await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('role', 'authenticated', true)`);
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId })}, true)`,
        );
        const result = await tx.execute(
          sql`select * from employee_points_ledger where employee_id = ${otherEmployeeId}`,
        );
        await tx.execute(sql`select set_config('role', 'none', true)`);
        return result;
      });

      expect(rowsAsOwner.length).toBe(0);
    },
  );
});

describe("isPlatformAdmin", () => {
  it("WHEN el profile tiene is_platform_admin=true THE SYSTEM SHALL devolver true", async () => {
    const userId = crypto.randomUUID();
    await db.insert(profile).values({ id: userId, email: `${userId}@example.com`, isPlatformAdmin: true });
    createdProfileIds.push(userId);

    expect(await isPlatformAdmin(userId)).toBe(true);
  });

  it("WHEN el profile tiene is_platform_admin=false THE SYSTEM SHALL devolver false", async () => {
    const userId = crypto.randomUUID();
    await makeProfile(userId, `${userId}@example.com`); // isPlatformAdmin default false
    createdProfileIds.push(userId);

    expect(await isPlatformAdmin(userId)).toBe(false);
  });

  it("WHEN el profile no existe THE SYSTEM SHALL devolver false, nunca lanzar", async () => {
    expect(await isPlatformAdmin(crypto.randomUUID())).toBe(false);
  });
});
