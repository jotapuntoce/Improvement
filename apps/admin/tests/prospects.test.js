// Integración real contra el proyecto Supabase de desarrollo. Cada test limpia sus propias filas en
// afterEach, nunca depende del orden. requirePlatformAdmin()/*Action wrappers usan cookies() de
// next/headers (lanzan fuera de un request real) — igual que provisioning.test.js, se prueba la
// lógica de negocio sin guard (provisionOrganization, markProspectLive), no los wrappers *Action.
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, supabaseAdmin } from "../lib/db.js";
import { organization, profile, membership, prospectCompany, orgBuildStage } from "@jotapuntoce/db/schema";
import { markProspectLive, provisionOrganization } from "../app/prospects/actions.js";

const createdProspectIds = [];
const createdOrgIds = [];
const createdProfileIds = [];

afterEach(async () => {
  if (createdOrgIds.length) {
    for (const orgId of createdOrgIds.splice(0)) {
      await db.delete(organization).where(eq(organization.id, orgId)); // cascade: membership, org_build_stage
    }
  }
  if (createdProspectIds.length) {
    for (const prospectId of createdProspectIds.splice(0)) {
      await db.delete(prospectCompany).where(eq(prospectCompany.id, prospectId));
    }
  }
  if (createdProfileIds.length) {
    for (const userId of createdProfileIds.splice(0)) {
      await db.delete(profile).where(eq(profile.id, userId));
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
});

describe("provisionOrganization (backlog: prospecto -> en_construcción)", () => {
  it(
    "WHEN se marca un prospecto como en_construcción desde el backlog THE SYSTEM SHALL " +
      "provisionar exactamente un organization nuevo, idempotente en una segunda llamada",
    async () => {
      const [prospect] = await db
        .insert(prospectCompany)
        .values({ name: `Prospecto backlog ${Date.now()}` })
        .returning();
      createdProspectIds.push(prospect.id);
      const ownerEmail = `owner-backlog-${Date.now()}@example.com`;

      const first = await provisionOrganization(prospect.id, ownerEmail);
      createdOrgIds.push(first.organization.id);
      const [ownerMembership] = await db
        .select()
        .from(membership)
        .where(eq(membership.orgId, first.organization.id))
        .limit(1);
      createdProfileIds.push(ownerMembership.userId);

      expect(first.alreadyProvisioned).toBe(false);

      const [updatedProspect] = await db
        .select()
        .from(prospectCompany)
        .where(eq(prospectCompany.id, prospect.id))
        .limit(1);
      expect(updatedProspect.status).toBe("en_construcción");

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

describe("markProspectLive (backlog: en_construcción -> live)", () => {
  it("WHEN un prospecto en_construcción se marca como live THE SYSTEM SHALL cambiar su status a live", async () => {
    const [prospect] = await db
      .insert(prospectCompany)
      .values({ name: `Prospecto live ${Date.now()}`, status: "en_construcción" })
      .returning();
    createdProspectIds.push(prospect.id);

    const updated = await markProspectLive(prospect.id);

    expect(updated.status).toBe("live");
  });

  it("WHEN un prospecto todavía no está en_construcción THE SYSTEM SHALL rechazar marcarlo como live", async () => {
    const [prospect] = await db
      .insert(prospectCompany)
      .values({ name: `Prospecto muy pronto ${Date.now()}` }) // status default 'prospecto'
      .returning();
    createdProspectIds.push(prospect.id);

    await expect(markProspectLive(prospect.id)).rejects.toThrow();
  });
});

describe("visibilidad de org_build_stage entre apps/admin y apps/improvement", () => {
  it(
    "WHEN Jose Carlos agrega una org_build_stage desde apps/admin THE SYSTEM SHALL hacerla " +
      "visible de inmediato — misma tabla, sin caché intermedia",
    async () => {
      const [org] = await db
        .insert(organization)
        .values({ name: `Org visibilidad ${Date.now()}`, slug: `org-vis-${Date.now()}` })
        .returning();
      createdOrgIds.push(org.id);

      // Simula exactamente lo que hace createStage() en app/organizations/[orgId]/page.js.
      await db.insert(orgBuildStage).values({
        orgId: org.id,
        stageOrder: 1,
        stageName: "Etapa agregada desde admin",
        status: "bloqueada",
      });

      // getBuildMap de apps/improvement hace este mismo select — sin caché entre ambos, la fila
      // debe estar disponible de inmediato.
      const stages = await db
        .select()
        .from(orgBuildStage)
        .where(eq(orgBuildStage.orgId, org.id));

      expect(stages.length).toBe(1);
      expect(stages[0].stageName).toBe("Etapa agregada desde admin");
    },
  );
});
