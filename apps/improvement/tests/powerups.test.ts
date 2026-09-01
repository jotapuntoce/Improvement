// Integración real contra el proyecto Supabase de desarrollo (blueprint §13), mismo patrón que
// tests/objectives.test.ts. Cada test limpia sus propias filas en afterEach: primero organization
// (cascade a membership/objective/powerup_redemption vía org_id), luego profile, y solo al final
// powerup_partner — borrarlo antes fallaría contra el FK restrict de powerup_redemption.partner_id
// mientras el canje de prueba todavía existe.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  organization,
  profile,
  membership,
  objective,
  employeePointsLedger,
  powerupPartner,
  powerupRedemption,
} from "@jotapuntoce/db/schema";
import { listActivePowerups, pointsBalance, redeemPowerup } from "../server/powerups/mutations.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-pu-${nameSuffix}-${Date.now()}` })
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

async function makePartner(overrides: Partial<typeof powerupPartner.$inferInsert> = {}) {
  const [partner] = await db
    .insert(powerupPartner)
    .values({
      businessName: `Partner de prueba ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      category: "Comida",
      discountDescription: "10% de descuento",
      redemptionInstructions: "Muestra este código en caja",
      pointsCost: 500,
      ...overrides,
    })
    .returning();
  if (!partner) throw new Error("insert de powerup_partner no devolvió fila");
  return partner;
}

/** Otorga puntos vía un objective completado real — employee_points_ledger.objective_id es NOT NULL. */
async function grantPoints(employeeId: string, orgId: string, points: number) {
  const [obj] = await db
    .insert(objective)
    .values({
      orgId,
      title: "Objetivo de prueba (otorga puntos)",
      impactWeight: 10,
      dueDate: new Date(),
      status: "completed",
      completedAt: new Date(),
      assignedEmployeeId: employeeId,
    })
    .returning();
  if (!obj) throw new Error("insert de objective no devolvió fila");
  await db.insert(employeePointsLedger).values({ employeeId, objectiveId: obj.id, orgId, points });
}

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];
const createdPartnerIds: string[] = [];

afterEach(async () => {
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
  if (createdPartnerIds.length) {
    for (const partnerId of createdPartnerIds.splice(0)) {
      await db.delete(powerupPartner).where(sql`${powerupPartner.id} = ${partnerId}`);
    }
  }
});

describe("redeemPowerup", () => {
  it(
    "WHEN un empleado con balance 300 intenta canjear un PowerUp de costo 500 THE SYSTEM SHALL " +
      "rechazar la operación y no insertar ninguna fila en powerup_redemption",
    async () => {
      const org = await makeOrg("insufficient");
      createdOrgIds.push(org.id);
      const employeeId = await makeMember(org.id, "employee");
      createdProfileIds.push(employeeId);
      await grantPoints(employeeId, org.id, 300);
      const partner = await makePartner({ pointsCost: 500 });
      createdPartnerIds.push(partner.id);

      const result = await redeemPowerup(employeeId, org.id, partner.id);

      expect(result.ok).toBe(false);
      const redemptions = await db
        .select()
        .from(powerupRedemption)
        .where(eq(powerupRedemption.employeeId, employeeId));
      expect(redemptions.length).toBe(0);
    },
  );

  it(
    "WHEN un empleado con balance suficiente canjea un PowerUp THE SYSTEM SHALL insertar " +
      "exactamente una fila y reducir su balance calculado en points_cost",
    async () => {
      const org = await makeOrg("sufficient");
      createdOrgIds.push(org.id);
      const employeeId = await makeMember(org.id, "employee");
      createdProfileIds.push(employeeId);
      await grantPoints(employeeId, org.id, 500);
      const partner = await makePartner({ pointsCost: 500 });
      createdPartnerIds.push(partner.id);

      const before = await pointsBalance(employeeId);
      const result = await redeemPowerup(employeeId, org.id, partner.id);
      const after = await pointsBalance(employeeId);

      expect(result.ok).toBe(true);
      const redemptions = await db
        .select()
        .from(powerupRedemption)
        .where(eq(powerupRedemption.employeeId, employeeId));
      expect(redemptions.length).toBe(1);
      expect(before - after).toBe(500);
    },
  );
});

describe("listActivePowerups", () => {
  it(
    "WHEN Jose Carlos desactiva un partner desde apps/admin THE SYSTEM SHALL dejar de mostrarlo " +
      "en el catálogo de todos los orgs sin borrar los canjes históricos que ya lo referencian",
    async () => {
      const org = await makeOrg("deactivate");
      createdOrgIds.push(org.id);
      const employeeId = await makeMember(org.id, "employee");
      createdProfileIds.push(employeeId);
      await grantPoints(employeeId, org.id, 500);
      const partner = await makePartner({ pointsCost: 500 });
      createdPartnerIds.push(partner.id);

      const redeemResult = await redeemPowerup(employeeId, org.id, partner.id);
      expect(redeemResult.ok).toBe(true);

      // Simula lo que hace apps/admin/app/powerups/page.js al desactivar un partner.
      await db.update(powerupPartner).set({ isActive: false }).where(eq(powerupPartner.id, partner.id));

      const catalog = await listActivePowerups();
      expect(catalog.some((p) => p.id === partner.id)).toBe(false);

      const redemptions = await db
        .select()
        .from(powerupRedemption)
        .where(eq(powerupRedemption.partnerId, partner.id));
      expect(redemptions.length).toBe(1);
    },
  );
});
