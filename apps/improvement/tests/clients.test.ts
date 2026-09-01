// Integración real contra el proyecto Supabase de desarrollo (blueprint §13), mismo patrón que
// tests/objectives.test.ts. Cada test limpia su organization en afterEach — client.org_id es
// cascade, así que sus filas desaparecen con el org.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership } from "@jotapuntoce/db/schema";
import { createClient, listClients } from "../server/clients/mutations.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-cli-${nameSuffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

async function makeMember(orgId: string, role: "owner" | "employee") {
  const userId = crypto.randomUUID();
  const [p] = await db.insert(profile).values({ id: userId, email: `${userId}@example.com` }).returning();
  if (!p) throw new Error("insert de profile no devolvió fila");
  await db.insert(membership).values({ userId, orgId, role, acceptedAt: new Date() });
  return userId;
}

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

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
});

describe("listClients", () => {
  it(
    "WHEN un miembro del org A solicita la lista de clientes del org B THE SYSTEM SHALL " +
      "devolver 404",
    async () => {
      const orgA = await makeOrg("a");
      createdOrgIds.push(orgA.id);
      const orgB = await makeOrg("b");
      createdOrgIds.push(orgB.id);
      const memberOfA = await makeMember(orgA.id, "employee");
      createdProfileIds.push(memberOfA);

      await expect(listClients(memberOfA, orgB.id)).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
    },
  );

  it("WHEN se filtra por health_status='at_risk' THE SYSTEM SHALL devolver solo esas filas", async () => {
    const org = await makeOrg("filter");
    createdOrgIds.push(org.id);
    const userId = await makeMember(org.id, "owner");
    createdProfileIds.push(userId);

    await createClient(userId, org.id, { name: "Cliente sano", healthStatus: "healthy" });
    await createClient(userId, org.id, { name: "Cliente en riesgo 1", healthStatus: "at_risk" });
    await createClient(userId, org.id, { name: "Cliente en riesgo 2", healthStatus: "at_risk" });

    const { data } = await listClients(userId, org.id, { healthStatus: "at_risk" });

    expect(data.clients.length).toBe(2);
    expect(data.clients.every((c) => c.healthStatus === "at_risk")).toBe(true);
  });
});

describe("createClient", () => {
  it(
    "WHEN se crea un cliente sin health_status explícito THE SYSTEM SHALL almacenarlo como " +
      "neutral por default",
    async () => {
      const org = await makeOrg("default");
      createdOrgIds.push(org.id);
      const userId = await makeMember(org.id, "owner");
      createdProfileIds.push(userId);

      const result = await createClient(userId, org.id, { name: "Cliente sin estado" });

      expect(result.ok).toBe(true);
      expect(result.data.healthStatus).toBe("neutral");
    },
  );
});
