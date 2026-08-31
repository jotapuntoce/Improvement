// Integración real contra el proyecto Supabase de desarrollo (blueprint §13). Cada test limpia sus
// propias filas en afterEach — org (cascade a membership/org_build_stage), prospect, profile y el
// usuario de Auth creado.
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, supabaseAdmin } from "../lib/db.js";
import { organization, profile, membership, orgBuildStage, prospectCompany } from "@jotapuntoce/db/schema";
import { provisionOrganization } from "../app/prospects/actions.js";

let createdProspectId;
let createdOrgId;
let createdOwnerId;

afterEach(async () => {
  if (createdOrgId) {
    await db.delete(organization).where(eq(organization.id, createdOrgId)); // cascade
    createdOrgId = undefined;
  }
  if (createdProspectId) {
    await db.delete(prospectCompany).where(eq(prospectCompany.id, createdProspectId));
    createdProspectId = undefined;
  }
  if (createdOwnerId) {
    await db.delete(profile).where(eq(profile.id, createdOwnerId));
    await supabaseAdmin.auth.admin.deleteUser(createdOwnerId);
    createdOwnerId = undefined;
  }
});

describe("provisionOrganization", () => {
  it(
    "WHEN provisionOrganization corre sobre un prospecto sin org_id THE SYSTEM SHALL crear " +
      "exactamente un organization, un membership(role='owner') y una org_build_stage",
    async () => {
      const [prospect] = await db
        .insert(prospectCompany)
        .values({ name: `Prospecto de prueba ${Date.now()}` })
        .returning();
      createdProspectId = prospect.id;
      const ownerEmail = `owner-${Date.now()}@example.com`;

      const { organization: org, alreadyProvisioned } = await provisionOrganization(
        prospect.id,
        ownerEmail,
      );
      createdOrgId = org.id;

      expect(alreadyProvisioned).toBe(false);
      expect(org).toBeTruthy();

      const memberships = await db.select().from(membership).where(eq(membership.orgId, org.id));
      expect(memberships.length).toBe(1);
      expect(memberships[0].role).toBe("owner");
      createdOwnerId = memberships[0].userId;

      const stages = await db.select().from(orgBuildStage).where(eq(orgBuildStage.orgId, org.id));
      expect(stages.length).toBe(1);

      const [updatedProspect] = await db
        .select()
        .from(prospectCompany)
        .where(eq(prospectCompany.id, prospect.id))
        .limit(1);
      expect(updatedProspect.status).toBe("en_construcción");
      expect(updatedProspect.orgId).toBe(org.id);
    },
  );

  it(
    "WHEN provisionOrganization corre dos veces seguidas sobre el mismo prospecto THE SYSTEM " +
      "SHALL dejar exactamente un organization",
    async () => {
      const [prospect] = await db
        .insert(prospectCompany)
        .values({ name: `Prospecto duplicado ${Date.now()}` })
        .returning();
      createdProspectId = prospect.id;
      const ownerEmail = `owner-dup-${Date.now()}@example.com`;

      const first = await provisionOrganization(prospect.id, ownerEmail);
      createdOrgId = first.organization.id;
      const [m] = await db
        .select()
        .from(membership)
        .where(eq(membership.orgId, first.organization.id))
        .limit(1);
      createdOwnerId = m.userId;

      const second = await provisionOrganization(prospect.id, ownerEmail);

      expect(second.alreadyProvisioned).toBe(true);
      expect(second.organization.id).toBe(first.organization.id);

      const orgs = await db
        .select()
        .from(organization)
        .where(eq(organization.id, first.organization.id));
      expect(orgs.length).toBe(1);
    },
  );
});
