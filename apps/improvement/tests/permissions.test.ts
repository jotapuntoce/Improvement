// Permisos por tipo: qué ve cada empleado. Las pruebas de RLS simulan el rol `authenticated` con el
// JWT de la persona, porque el cliente `db` normal conecta con el rol postgres y bypasea RLS — una
// prueba que no lo haga estaría probando nada (mismo patrón que tests/auth/guard.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { grantsSchema, scopeFor } from "../server/permissions/sections.ts";
import { resolveSection } from "../server/auth/guard.ts";

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

async function newOrg(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);
  return org;
}

async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`,
    );
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

describe("RLS — objective por tipo de permiso", () => {
  it(
    "WHEN un empleado con alcance `area` consulta objetivos vía RLS THE SYSTEM SHALL devolver solo " +
      "los de su área — los de otra área no salen ni pidiéndolos por id",
    async () => {
      const org = await newOrg("Test Org Permisos");

      const [areaSuya] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Construcción", color: "#f59e0b" })
        .returning();
      const [areaAjena] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Ventas", color: "#22d3ee" })
        .returning();
      if (!areaSuya || !areaAjena) throw new Error("insert de area no devolvió fila");

      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Jefe de obra", grants: { objetivos: "area" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const employeeId = crypto.randomUUID();
      await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
      createdProfileIds.push(employeeId);
      await db.insert(membership).values({
        userId: employeeId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        areaId: areaSuya.id,
        acceptedAt: new Date(),
      });

      await db.insert(objective).values([
        { orgId: org.id, areaId: areaSuya.id, title: "Colado de losa", impactWeight: 50, dueDate: new Date() },
        { orgId: org.id, areaId: areaAjena.id, title: "Cerrar venta", impactWeight: 50, dueDate: new Date() },
      ]);

      const rows = await asUser<{ title: string }>(
        employeeId,
        `select title from objective where org_id = '${org.id}'`,
      );

      expect(rows.map((r) => r.title)).toEqual(["Colado de losa"]);
    },
  );

  it(
    "WHEN un miembro no tiene tipo de permiso asignado THE SYSTEM SHALL no devolverle ningún " +
      "objetivo — sin tipo no se ve nada, el default niega",
    async () => {
      const org = await newOrg("Test Org Sin Tipo");
      const employeeId = crypto.randomUUID();
      await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
      createdProfileIds.push(employeeId);
      await db
        .insert(membership)
        .values({ userId: employeeId, orgId: org.id, role: "employee", acceptedAt: new Date() });

      await db
        .insert(objective)
        .values({ orgId: org.id, title: "Invisible", impactWeight: 10, dueDate: new Date() });

      const rows = await asUser(employeeId, `select title from objective where org_id = '${org.id}'`);
      expect(rows.length).toBe(0);
    },
  );

  it("WHEN quien consulta es el dueño THE SYSTEM SHALL devolverle todo, sin tipo de permiso", async () => {
    const org = await newOrg("Test Org Dueno");
    const ownerId = crypto.randomUUID();
    await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
    createdProfileIds.push(ownerId);
    await db
      .insert(membership)
      .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

    await db.insert(objective).values([
      { orgId: org.id, title: "Uno", impactWeight: 10, dueDate: new Date() },
      { orgId: org.id, title: "Dos", impactWeight: 10, dueDate: new Date() },
    ]);

    const rows = await asUser(ownerId, `select title from objective where org_id = '${org.id}'`);
    expect(rows.length).toBe(2);
  });
});

describe("scopeFor", () => {
  it("WHEN el miembro es dueño THE SYSTEM SHALL darle `empresa` en toda sección, aun sin tipo", () => {
    expect(scopeFor("owner", null, "objetivos")).toBe("empresa");
    expect(scopeFor("owner", { objetivos: "ninguno" }, "objetivos")).toBe("empresa");
  });

  it("WHEN el miembro no tiene tipo THE SYSTEM SHALL devolver `ninguno`", () => {
    expect(scopeFor("employee", null, "objetivos")).toBe("ninguno");
  });

  it("WHEN el mapa no menciona la sección THE SYSTEM SHALL devolver `ninguno`, no `empresa`", () => {
    expect(scopeFor("employee", { objetivos: "empresa" }, "clientes")).toBe("ninguno");
  });

  it("WHEN el mapa concede un alcance THE SYSTEM SHALL devolverlo tal cual", () => {
    expect(scopeFor("employee", { objetivos: "area" }, "objetivos")).toBe("area");
  });
});

describe("grantsSchema", () => {
  it(
    "WHEN se guarda un alcance que esa sección no sabe filtrar THE SYSTEM SHALL rechazarlo al " +
      "guardar — `clientes` no tiene área ni responsable de quien colgarse",
    () => {
      expect(grantsSchema.safeParse({ clientes: "propio" }).success).toBe(false);
      expect(grantsSchema.safeParse({ objetivos: "propio" }).success).toBe(true);
    },
  );

  it("WHEN el mapa trae una sección que no existe THE SYSTEM SHALL ignorarla, no lanzar", () => {
    const parsed = grantsSchema.safeParse({ inventada: "empresa", objetivos: "area" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.objetivos).toBe("area");
  });
});

describe("resolveSection", () => {
  it(
    "WHEN el miembro tiene un tipo con alcance `area` THE SYSTEM SHALL devolver ese alcance junto " +
      "con su membresía — el loader nunca adivina el alcance, se lo dan",
    async () => {
      const org = await newOrg("Test Org Resolve");
      const [areaSuya] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Postventa", color: "#10b981" })
        .returning();
      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Postventa", grants: { objetivos: "area", clientes: "ninguno" } })
        .returning();
      if (!areaSuya || !tipo) throw new Error("insert no devolvió fila");

      const employeeId = crypto.randomUUID();
      await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
      createdProfileIds.push(employeeId);
      await db.insert(membership).values({
        userId: employeeId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        areaId: areaSuya.id,
        acceptedAt: new Date(),
      });

      const objetivos = await resolveSection(employeeId, org.id, "objetivos");
      expect(objetivos.scope).toBe("area");
      expect(objetivos.membership.areaId).toBe(areaSuya.id);

      const clientes = await resolveSection(employeeId, org.id, "clientes");
      expect(clientes.scope).toBe("ninguno");
    },
  );

  it("WHEN el miembro es dueño THE SYSTEM SHALL devolver `empresa` sin consultar ningún tipo", async () => {
    const org = await newOrg("Test Org Resolve Dueno");
    const ownerId = crypto.randomUUID();
    await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
    createdProfileIds.push(ownerId);
    await db
      .insert(membership)
      .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

    const { scope } = await resolveSection(ownerId, org.id, "clientes");
    expect(scope).toBe("empresa");
  });

  it("WHEN el miembro no tiene tipo de permiso asignado THE SYSTEM SHALL devolver `ninguno`", async () => {
    const org = await newOrg("Test Org Resolve Sin Tipo");
    const employeeId = crypto.randomUUID();
    await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
    createdProfileIds.push(employeeId);
    await db
      .insert(membership)
      .values({ userId: employeeId, orgId: org.id, role: "employee", acceptedAt: new Date() });

    const { scope } = await resolveSection(employeeId, org.id, "objetivos");
    expect(scope).toBe("ninguno");
  });
});
