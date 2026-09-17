// Integración real contra el proyecto Supabase de desarrollo — a diferencia de scene-graph.test.ts,
// que prueba las funciones puras, aquí se prueba el puente a datos (loadDashboardScene).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, area, permissionType } from "@jotapuntoce/db/schema";
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

async function makeArea(orgId: string, name: string) {
  const [a] = await db.insert(area).values({ orgId, name, color: "#7c5cff" }).returning();
  if (!a) throw new Error("insert de area no devolvió fila");
  return a;
}

async function makePermissionType(orgId: string, grants: Record<string, string>) {
  const [pt] = await db
    .insert(permissionType)
    .values({ orgId, name: `Tipo ${Date.now()}-${Math.random().toString(36).slice(2)}`, grants })
    .returning();
  if (!pt) throw new Error("insert de permission_type no devolvió fila");
  return pt;
}

async function makeMember(
  orgId: string,
  role: "owner" | "employee",
  overrides: Partial<typeof membership.$inferInsert> = {},
) {
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
  createdProfileIds.push(userId);
  await db.insert(membership).values({ userId, orgId, role, acceptedAt: new Date(), ...overrides });
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

  // CRITICAL 1 de la revisión de rama: loadDashboardScene solo llamaba assertMembership, así que
  // cualquier miembro con sesión veía a todo el equipo en /[org]/dashboard sin importar su tipo de
  // permiso. El alcance ahora se resuelve adentro con resolveSection("equipo"), mismo patrón que
  // listTeammates.
  it(
    "WHEN un empleado tiene alcance ninguno en equipo THE SYSTEM SHALL devolver cero avatares",
    async () => {
      const org = await makeOrg("scope-ninguno");
      await makeMember(org.id, "owner");
      // Sin permissionTypeId → resolveSection devuelve "ninguno" (default niega).
      const employeeId = await makeMember(org.id, "employee");

      const graph = await loadDashboardScene(employeeId, org.id);

      expect(graph.avatars).toEqual([]);
    },
  );

  it(
    "WHEN un empleado tiene alcance area y sí tiene área asignada THE SYSTEM SHALL devolver solo " +
      "los avatares de su propia área",
    async () => {
      const org = await makeOrg("scope-area-con-area");
      const pt = await makePermissionType(org.id, { equipo: "area" });
      const areaA = await makeArea(org.id, "Área A");
      const areaB = await makeArea(org.id, "Área B");

      const employeeInA = await makeMember(org.id, "employee", {
        permissionTypeId: pt.id,
        areaId: areaA.id,
      });
      await makeMember(org.id, "employee", { areaId: areaB.id });

      const graph = await loadDashboardScene(employeeInA, org.id);

      expect(graph.avatars.map((a) => a.id)).toEqual([employeeInA]);
    },
  );

  it(
    "WHEN un empleado tiene alcance area pero NO tiene área asignada THE SYSTEM SHALL devolver " +
      "cero avatares, nunca la empresa entera",
    async () => {
      const org = await makeOrg("scope-area-sin-area");
      const pt = await makePermissionType(org.id, { equipo: "area" });
      const areaA = await makeArea(org.id, "Área A");

      // Miembro "a medio configurar": tipo de permiso con alcance area, pero sin area_id (p. ej.
      // porque el dueño borró su área — onDelete: set null).
      const employeeSinArea = await makeMember(org.id, "employee", { permissionTypeId: pt.id });
      await makeMember(org.id, "employee", { areaId: areaA.id });

      const graph = await loadDashboardScene(employeeSinArea, org.id);

      expect(graph.avatars).toEqual([]);
    },
  );

  it(
    "WHEN un empleado tiene alcance empresa THE SYSTEM SHALL devolver los avatares de todo el " +
      "equipo, sin importar el área de cada quien",
    async () => {
      const org = await makeOrg("scope-empresa");
      const pt = await makePermissionType(org.id, { equipo: "empresa" });
      const areaA = await makeArea(org.id, "Área A");
      const ownerId = await makeMember(org.id, "owner");
      const employeeWithScope = await makeMember(org.id, "employee", { permissionTypeId: pt.id });
      const employeeInA = await makeMember(org.id, "employee", { areaId: areaA.id });

      const graph = await loadDashboardScene(employeeWithScope, org.id);

      expect(new Set(graph.avatars.map((a) => a.id))).toEqual(
        new Set([ownerId, employeeWithScope, employeeInA]),
      );
    },
  );

  it(
    "WHEN quien pregunta es el dueño THE SYSTEM SHALL ver a todo el equipo sin importar el área, " +
      "aunque no tenga tipo de permiso asignado",
    async () => {
      const org = await makeOrg("scope-owner");
      const areaA = await makeArea(org.id, "Área A");
      const ownerId = await makeMember(org.id, "owner");
      const employeeInA = await makeMember(org.id, "employee", { areaId: areaA.id });
      const employeeSinTipo = await makeMember(org.id, "employee");

      const graph = await loadDashboardScene(ownerId, org.id);

      expect(new Set(graph.avatars.map((a) => a.id))).toEqual(
        new Set([ownerId, employeeInA, employeeSinTipo]),
      );
    },
  );
});
