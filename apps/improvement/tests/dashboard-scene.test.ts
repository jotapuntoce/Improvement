// Integración real contra el proyecto Supabase de desarrollo — a diferencia de scene-graph.test.ts,
// que prueba las funciones puras, aquí se prueba el puente a datos (loadDashboardScene).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership } from "@jotapuntoce/db/schema";
import { loadDashboardScene } from "../server/scene/loadDashboardScene.ts";

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(sql`${profile.id} = ${userId}`);
  }
});

async function makeOrg(suffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${suffix}`, slug: `test-org-scene-${suffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);
  return org;
}

async function makeMember(orgId: string, role: "owner" | "employee") {
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
  createdProfileIds.push(userId);
  await db.insert(membership).values({ userId, orgId, role, acceptedAt: new Date() });
  return userId;
}

describe("loadDashboardScene", () => {
  it(
    "WHEN un platform admin tiene membership en el org THE SYSTEM SHALL excluirlo de los avatares " +
      "del dashboard, igual que de /[org]/equipo",
    async () => {
      const org = await makeOrg("admin-oculto");
      const ownerId = await makeMember(org.id, "owner");

      // Platform admin real, no uno temporal: crear y borrar un profile con is_platform_admin=true
      // compite contra apps/admin leyendo esa misma lista en paralelo (ver tests/auth/guard.test.ts).
      // El membership sí es temporal — se va por cascade con la org.
      const [admin] = await db.select().from(profile).where(eq(profile.isPlatformAdmin, true)).limit(1);
      if (!admin) throw new Error("este entorno no tiene ningún profile con is_platform_admin=true");
      await db.insert(membership).values({ userId: admin.id, orgId: org.id, role: "owner", acceptedAt: new Date() });

      const graph = await loadDashboardScene(ownerId, org.id);

      expect(graph.avatars.map((a) => a.id)).toEqual([ownerId]);
      expect(JSON.stringify(graph)).not.toContain(admin.email);
    },
  );
});
