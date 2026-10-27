// Integración real contra el proyecto Supabase de desarrollo — mismo patrón que
// tests/prospects.test.js. approveCompanyRequest/rejectCompanyRequest son la lógica de negocio sin
// guard (requirePlatformAdmin usa cookies(), inalcanzable fuera de un request real de Next) — se
// prueba directo, no los wrappers *Action.
import { afterEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { organization, profile, membership, orgBuildStage, companyRequest } from "@jotapuntoce/db/schema";
import { BUILD_STAGES } from "@jotapuntoce/ui/building/buildStages.ts";
import { approveCompanyRequest, rejectCompanyRequest } from "../app/company-requests/actions.js";

const createdOrgIds = [];
const createdProfileIds = [];
const createdRequestIds = [];

afterEach(async () => {
  if (createdRequestIds.length) {
    for (const id of createdRequestIds.splice(0)) {
      await db.delete(companyRequest).where(eq(companyRequest.id, id));
    }
  }
  if (createdOrgIds.length) {
    for (const orgId of createdOrgIds.splice(0)) {
      await db.delete(organization).where(eq(organization.id, orgId)); // cascade: membership, org_build_stage
    }
  }
  if (createdProfileIds.length) {
    for (const userId of createdProfileIds.splice(0)) {
      await db.delete(profile).where(eq(profile.id, userId));
    }
  }
});

async function makeRequester() {
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com`, fullName: "Cliente Test" });
  createdProfileIds.push(userId);
  return userId;
}

async function makeRequest(requesterId, overrides = {}) {
  const [row] = await db
    .insert(companyRequest)
    .values({ requesterId, companyName: `Empresa test ${Date.now()}`, ...overrides })
    .returning();
  createdRequestIds.push(row.id);
  return row;
}

describe("approveCompanyRequest", () => {
  it(
    "WHEN se aprueba una solicitud pending THE SYSTEM SHALL crear el organization, un membership " +
      "'owner' para el requester y las 8 fases del Mapa de Construcción, la primera en_progreso",
    async () => {
      const requesterId = await makeRequester();
      const request = await makeRequest(requesterId, { industry: "servicios" });

      const org = await approveCompanyRequest(request.id, requesterId);
      createdOrgIds.push(org.id);

      expect(org.industry).toBe("servicios");

      const memberships = await db.select().from(membership).where(eq(membership.orgId, org.id));
      expect(memberships.some((m) => m.userId === requesterId && m.role === "owner")).toBe(true);

      // Las 8 fases completas desde el día uno: el tracker del panel del dueño enseña el camino
      // entero, no solo dónde va. Sembrar una sola dejaba al cliente sin saber qué sigue.
      const stages = await db
        .select()
        .from(orgBuildStage)
        .where(eq(orgBuildStage.orgId, org.id))
        .orderBy(asc(orgBuildStage.stageOrder));
      expect(stages).toHaveLength(BUILD_STAGES.length);
      expect(stages.map((s) => s.stageName)).toEqual(BUILD_STAGES.map((s) => s.name));
      expect(stages[0].status).toBe("en_progreso");
      expect(stages.slice(1).every((s) => s.status === "bloqueada")).toBe(true);

      const [updatedRequest] = await db
        .select()
        .from(companyRequest)
        .where(eq(companyRequest.id, request.id))
        .limit(1);
      expect(updatedRequest.status).toBe("approved");
      expect(updatedRequest.orgId).toBe(org.id);
    },
  );

  it("WHEN la solicitud ya no está pending THE SYSTEM SHALL rechazar aprobarla de nuevo", async () => {
    const requesterId = await makeRequester();
    const request = await makeRequest(requesterId, { status: "rejected" });

    await expect(approveCompanyRequest(request.id, requesterId)).rejects.toThrow();
  });
});

describe("rejectCompanyRequest", () => {
  it("WHEN se rechaza una solicitud THE SYSTEM SHALL marcarla como rejected sin crear organization", async () => {
    const requesterId = await makeRequester();
    const request = await makeRequest(requesterId);

    const updated = await rejectCompanyRequest(request.id, requesterId);

    expect(updated.status).toBe("rejected");
  });
});

describe("approveCompanyRequest — muelle", () => {
  it("WHEN quien aprueba es dueño de exactamente un muelle THE SYSTEM SHALL colgar el barco nuevo de él", async () => {
    const adminId = await makeRequester();
    const [dock] = await db
      .insert(organization)
      .values({ name: "muelle-t", slug: `muelle-t-${crypto.randomUUID().slice(0, 8)}`, kind: "muelle" })
      .returning();
    createdOrgIds.push(dock.id);
    await db.insert(membership).values({ userId: adminId, orgId: dock.id, role: "owner", acceptedAt: new Date() });
    const request = await makeRequest(await makeRequester());
    const newOrg = await approveCompanyRequest(request.id, adminId);
    // el barco hijo se borra antes que el muelle (FK restrict): afterEach respeta el orden del arreglo
    createdOrgIds.unshift(newOrg.id);
    expect(newOrg.kind).toBe("barco");
    expect(newOrg.parentOrgId).toBe(dock.id);
  });

  it("WHEN quien aprueba no es dueño de ningún muelle THE SYSTEM SHALL dejar el barco sin muelle", async () => {
    const adminId = await makeRequester();
    const request = await makeRequest(await makeRequester());
    const newOrg = await approveCompanyRequest(request.id, adminId);
    createdOrgIds.push(newOrg.id);
    expect(newOrg.parentOrgId).toBeNull();
  });
});
