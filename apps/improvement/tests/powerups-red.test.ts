// Catálogo de premios de la red (server/powerups/catalog.ts) y el canje que lo respeta, contra el Supabase de
// desarrollo. Mismo orden de limpieza que tests/powerups.test.ts: orgs (cascade a canjes), perfiles y al
// final los premios, por el FK restrict de powerup_redemption.partner_id.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  employeePointsLedger,
  membership,
  muelleSettings,
  objective,
  organization,
  powerupPartner,
  powerupRedemption,
  profile,
} from "@jotapuntoce/db/schema";
import { catalogModeFor, listCatalogForOrg } from "../server/powerups/catalog.ts";
import { redeemPowerup } from "../server/powerups/mutations.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
const partnerIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
  for (const id of partnerIds.splice(0)) await db.delete(powerupPartner).where(sql`${powerupPartner.id} = ${id}`);
});

async function org(kind?: "muelle" | "barco", parentOrgId?: string) {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-red", slug: `t-pu-red-${crypto.randomUUID()}`, kind, parentOrgId })
    .returning();
  orgIds.push(row!.id);
  return row!.id;
}

async function partner(networkOrgId: string | null = null) {
  const [row] = await db
    .insert(powerupPartner)
    .values({
      businessName: `Premio ${crypto.randomUUID()}`,
      category: "Comida",
      discountDescription: "10%",
      redemptionInstructions: "En caja",
      pointsCost: 100,
      networkOrgId,
    })
    .returning();
  partnerIds.push(row!.id);
  return row!;
}

/** Barco de un muelle en modo `red`, con un empleado de 500 puntos, un premio global y uno de la red. */
async function redBarco() {
  const muelle = await org("muelle");
  const barco = await org("barco", muelle);
  await db.insert(muelleSettings).values({ muelleOrgId: muelle, catalogMode: "red" });
  const employee = crypto.randomUUID();
  await db.insert(profile).values({ id: employee, email: `${employee}@example.com` });
  profileIds.push(employee);
  await db.insert(membership).values({ userId: employee, orgId: barco, role: "employee", acceptedAt: new Date() });
  const [obj] = await db
    .insert(objective)
    .values({ orgId: barco, title: "Puntos", impactWeight: 10, dueDate: new Date(), status: "completed", completedAt: new Date(), assignedEmployeeId: employee })
    .returning();
  await db.insert(employeePointsLedger).values({ employeeId: employee, objectiveId: obj!.id, orgId: barco, points: 500 });
  return { muelle, barco, employee, global: await partner(), red: await partner(muelle) };
}

const redemptionsOf = (orgId: string) => db.select().from(powerupRedemption).where(eq(powerupRedemption.orgId, orgId));

describe("listCatalogForOrg", () => {
  it("WHEN el org no tiene muelle THE SYSTEM SHALL devolver las filas globales activas y ninguna de red", async () => {
    const solo = await org();
    const global = await partner();
    const muelle = await org("muelle");
    await partner(muelle);
    const rows = await listCatalogForOrg(solo);
    expect(rows.map((r) => r.id)).toContain(global.id);
    expect(rows.every((r) => r.networkOrgId === null && r.isActive)).toBe(true);
    expect(await catalogModeFor(solo)).toBe("global");
  });

  it("WHEN el muelle está en modo red THE SYSTEM SHALL devolver solo sus premios; al volver a global, los globales", async () => {
    const r = await redBarco();
    expect((await listCatalogForOrg(r.barco)).map((p) => p.id)).toEqual([r.red.id]);
    const [stillThere] = await db.select().from(powerupPartner).where(eq(powerupPartner.id, r.global.id));
    expect(stillThere?.isActive).toBe(true);

    await db.update(muelleSettings).set({ catalogMode: "global" }).where(eq(muelleSettings.muelleOrgId, r.muelle));
    const ids = (await listCatalogForOrg(r.barco)).map((p) => p.id);
    expect(ids).toContain(r.global.id);
    expect(ids).not.toContain(r.red.id);
  });
});

describe("redeemPowerup en modo red", () => {
  it("WHEN canjea un premio global THE SYSTEM SHALL devolver NOT_FOUND sin canje; uno de la red, exactamente un canje", async () => {
    const r = await redBarco();
    const global = await redeemPowerup(r.employee, r.barco, r.global.id);
    expect(!global.ok && global.error.code).toBe("NOT_FOUND");
    expect(await redemptionsOf(r.barco)).toEqual([]);

    expect((await redeemPowerup(r.employee, r.barco, r.red.id)).ok).toBe(true);
    expect(await redemptionsOf(r.barco)).toHaveLength(1);
  });
});
