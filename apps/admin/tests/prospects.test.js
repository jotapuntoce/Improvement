// Integración real contra el proyecto Supabase de desarrollo. Cada test limpia sus propias filas en
// afterEach, nunca depende del orden. requirePlatformAdmin()/*Action wrappers usan cookies() de
// next/headers (lanzan fuera de un request real) — igual que provisioning.test.js, se prueba la
// lógica de negocio sin guard (provisionOrganization, markProspectLive), no los wrappers *Action.
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, supabaseAdmin } from "../lib/db.js";
import {
  organization,
  profile,
  membership,
  prospectClient,
  prospectCompany,
  orgBuildStage,
} from "@jotapuntoce/db/schema";
import { markProspectLive, provisionOrganization } from "../app/prospects/actions.js";

const createdProspectIds = [];
const createdClientIds = [];
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
  if (createdClientIds.length) {
    for (const clientId of createdClientIds.splice(0)) {
      await db.delete(prospectClient).where(eq(prospectClient.id, clientId)); // cascade: prospect_company
    }
  }
  if (createdProfileIds.length) {
    for (const userId of createdProfileIds.splice(0)) {
      await db.delete(profile).where(eq(profile.id, userId));
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
});

// Helper: un prospectCompany siempre cuelga de un prospectClient (prospect_client_id NOT NULL) —
// cada test que necesita un prospecto crea primero a la persona.
async function insertProspectClient(overrides = {}) {
  const [client] = await db
    .insert(prospectClient)
    .values({
      fullName: `Cliente test ${Date.now()}`,
      email: `owner-backlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      whatsappPhone: "+525500000000",
      ...overrides,
    })
    .returning();
  createdClientIds.push(client.id);
  return client;
}

describe("provisionOrganization (backlog: prospecto -> en_construcción)", () => {
  it(
    "WHEN se marca un prospecto como en_construcción desde el backlog THE SYSTEM SHALL " +
      "provisionar exactamente un organization nuevo, idempotente en una segunda llamada",
    async () => {
      const client = await insertProspectClient();
      const [prospect] = await db
        .insert(prospectCompany)
        .values({ prospectClientId: client.id, name: `Prospecto backlog ${Date.now()}` })
        .returning();
      createdProspectIds.push(prospect.id);

      const first = await provisionOrganization(prospect.id);
      createdOrgIds.push(first.organization.id);
      // Por client.email, no "el primer membership que regrese la query" — desde que
      // provisionOrganization también agrega a cada platform admin existente (ver describe de abajo),
      // un org puede tener más de un membership y el orden no está garantizado.
      const [clientProfile] = await db
        .select()
        .from(profile)
        .where(eq(profile.email, client.email))
        .limit(1);
      createdProfileIds.push(clientProfile.id);

      expect(first.alreadyProvisioned).toBe(false);

      const [updatedProspect] = await db
        .select()
        .from(prospectCompany)
        .where(eq(prospectCompany.id, prospect.id))
        .limit(1);
      expect(updatedProspect.status).toBe("en_construcción");

      const second = await provisionOrganization(prospect.id);
      expect(second.alreadyProvisioned).toBe(true);
      expect(second.organization.id).toBe(first.organization.id);

      const orgs = await db
        .select()
        .from(organization)
        .where(eq(organization.id, first.organization.id));
      expect(orgs.length).toBe(1);
    },
    10000, // una provisión real (llamada a auth.admin.createUser/lookup vía provisionOrganization) pasa el timeout default de 5s
  );

  it(
    "WHEN un mismo prospectClient provisiona una segunda empresa THE SYSTEM SHALL reutilizar el " +
      "usuario ya creado en vez de fallar por email duplicado (caso real: Jaime Salinas, " +
      "Camibel + Afianza)",
    async () => {
      const client = await insertProspectClient();
      const [companyA] = await db
        .insert(prospectCompany)
        .values({ prospectClientId: client.id, name: `Camibel test ${Date.now()}` })
        .returning();
      const [companyB] = await db
        .insert(prospectCompany)
        .values({ prospectClientId: client.id, name: `Afianza test ${Date.now()}` })
        .returning();
      createdProspectIds.push(companyA.id, companyB.id);

      const resultA = await provisionOrganization(companyA.id);
      createdOrgIds.push(resultA.organization.id);
      const resultB = await provisionOrganization(companyB.id);
      createdOrgIds.push(resultB.organization.id);

      expect(resultA.organization.id).not.toBe(resultB.organization.id);

      // Por client.email, no "membershipsA[0]" — un org puede tener más de un membership ahora que
      // provisionOrganization también agrega a cada platform admin existente, así que el índice 0 ya
      // no identifica de forma confiable al cliente.
      const [clientProfile] = await db
        .select()
        .from(profile)
        .where(eq(profile.email, client.email))
        .limit(1);
      createdProfileIds.push(clientProfile.id);

      const membershipsA = await db
        .select()
        .from(membership)
        .where(eq(membership.orgId, resultA.organization.id));
      const membershipsB = await db
        .select()
        .from(membership)
        .where(eq(membership.orgId, resultB.organization.id));

      // El cliente (identificado por su propio userId) tiene membership real en ambas
      // organizaciones — mismo usuario, dos empresas.
      expect(membershipsA.some((m) => m.userId === clientProfile.id)).toBe(true);
      expect(membershipsB.some((m) => m.userId === clientProfile.id)).toBe(true);

      const profiles = await db.select().from(profile).where(eq(profile.email, client.email));
      expect(profiles.length).toBe(1);
    },
    15000, // dos provisiones reales seguidas (2 llamadas a auth.admin.createUser/lookup) pasan el timeout default de 5s
  );

  it(
    "WHEN se provisiona una organización nueva THE SYSTEM SHALL agregar membership(role='owner') " +
      "a todo profile con is_platform_admin=true que ya existía, además del dueño real (caso real: " +
      "Jose Carlos tiene que poder entrar a cada organización de cliente con su propia sesión)",
    async () => {
      const platformAdminsBefore = await db
        .select()
        .from(profile)
        .where(eq(profile.isPlatformAdmin, true));

      const client = await insertProspectClient();
      const [prospect] = await db
        .insert(prospectCompany)
        .values({ prospectClientId: client.id, name: `Prospecto platform-admin ${Date.now()}` })
        .returning();
      createdProspectIds.push(prospect.id);

      const result = await provisionOrganization(prospect.id);
      createdOrgIds.push(result.organization.id);

      const [clientProfile] = await db
        .select()
        .from(profile)
        .where(eq(profile.email, client.email))
        .limit(1);
      createdProfileIds.push(clientProfile.id);

      const memberships = await db
        .select()
        .from(membership)
        .where(eq(membership.orgId, result.organization.id));

      expect(memberships.some((m) => m.userId === clientProfile.id && m.role === "owner")).toBe(true);
      for (const admin of platformAdminsBefore) {
        const adminMembership = memberships.find((m) => m.userId === admin.id);
        expect(adminMembership).toBeDefined();
        expect(adminMembership.role).toBe("owner");
      }
    },
  );
});

describe("markProspectLive (backlog: en_construcción -> live)", () => {
  it("WHEN un prospecto en_construcción se marca como live THE SYSTEM SHALL cambiar su status a live", async () => {
    const client = await insertProspectClient();
    const [prospect] = await db
      .insert(prospectCompany)
      .values({
        prospectClientId: client.id,
        name: `Prospecto live ${Date.now()}`,
        status: "en_construcción",
      })
      .returning();
    createdProspectIds.push(prospect.id);

    const updated = await markProspectLive(prospect.id);

    expect(updated.status).toBe("live");
  });

  it("WHEN un prospecto todavía no está en_construcción THE SYSTEM SHALL rechazar marcarlo como live", async () => {
    const client = await insertProspectClient();
    const [prospect] = await db
      .insert(prospectCompany)
      .values({ prospectClientId: client.id, name: `Prospecto muy pronto ${Date.now()}` }) // status default 'prospecto'
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
