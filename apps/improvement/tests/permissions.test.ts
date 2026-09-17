// Permisos por tipo: qué ve cada empleado. Las pruebas de RLS simulan el rol `authenticated` con el
// JWT de la persona, porque el cliente `db` normal conecta con el rol postgres y bypasea RLS — una
// prueba que no lo haga estaría probando nada (mismo patrón que tests/auth/guard.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { grantsSchema, scopeFor } from "../server/permissions/sections.ts";
import { resolveSection } from "../server/auth/guard.ts";
import {
  createPermissionType,
  deletePermissionType,
  listPermissionTypes,
  updatePermissionType,
} from "../server/permissions/mutations.ts";
import { listObjectives } from "../server/objectives/mutations.ts";

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

async function orgConDueno(name: string) {
  const org = await newOrg(name);
  const ownerId = crypto.randomUUID();
  await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
  createdProfileIds.push(ownerId);
  await db
    .insert(membership)
    .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });
  return { org, ownerId };
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

describe("createPermissionType", () => {
  it("WHEN el dueño crea un tipo THE SYSTEM SHALL guardarlo con su mapa de alcances", async () => {
    const org = await newOrg("Test Org Tipos");
    const ownerId = crypto.randomUUID();
    await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
    createdProfileIds.push(ownerId);
    await db
      .insert(membership)
      .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

    const result = await createPermissionType(ownerId, org.id, "Vendedor", {
      objetivos: "area",
      clientes: "empresa",
    });
    expect(result.ok).toBe(true);
  });

  it(
    "WHEN el mapa trae un alcance que esa sección no filtra THE SYSTEM SHALL rechazarlo antes de " +
      "escribir — una fila inválida haría que scopeFor devuelva `ninguno` sin que nadie sepa por qué",
    async () => {
      const org = await newOrg("Test Org Tipos Invalido");
      const ownerId = crypto.randomUUID();
      await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
      createdProfileIds.push(ownerId);
      await db
        .insert(membership)
        .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

      const result = await createPermissionType(ownerId, org.id, "Imposible", { clientes: "propio" });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("VALIDATION_ERROR");
    },
  );
});

describe("deletePermissionType", () => {
  it(
    "WHEN se borra un tipo que alguien tiene asignado THE SYSTEM SHALL dejar a esa persona sin " +
      "tipo, o sea sin ver nada — es el comportamiento seguro, no un accidente",
    async () => {
      const org = await newOrg("Test Org Tipos Borrado");
      const ownerId = crypto.randomUUID();
      const employeeId = crypto.randomUUID();
      await db.insert(profile).values([
        { id: ownerId, email: `${ownerId}@example.com` },
        { id: employeeId, email: `${employeeId}@example.com` },
      ]);
      createdProfileIds.push(ownerId, employeeId);
      await db
        .insert(membership)
        .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

      const creado = await createPermissionType(ownerId, org.id, "Temporal", { objetivos: "empresa" });
      if (!creado.ok) throw new Error("createPermissionType falló");

      await db.insert(membership).values({
        userId: employeeId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: creado.data,
        acceptedAt: new Date(),
      });

      expect((await deletePermissionType(ownerId, org.id, creado.data)).ok).toBe(true);
      const { scope } = await resolveSection(employeeId, org.id, "objetivos");
      expect(scope).toBe("ninguno");
    },
  );

  it(
    "WHEN el dueño de OTRA empresa manda el id de un tipo ajeno THE SYSTEM SHALL responder NOT_FOUND " +
      "y no borrar la fila — mismo patrón que removeArea, el where escopa por orgId",
    async () => {
      const a = await orgConDueno("Test Org Tipos Delete Cross A");
      const b = await orgConDueno("Test Org Tipos Delete Cross B");

      const creado = await createPermissionType(a.ownerId, a.org.id, "De A", { objetivos: "area" });
      if (!creado.ok) throw new Error("createPermissionType falló");

      const result = await deletePermissionType(b.ownerId, b.org.id, creado.data);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

      const tiposA = await listPermissionTypes(a.org.id);
      expect(tiposA.some((t) => t.id === creado.data)).toBe(true);
    },
  );
});

describe("updatePermissionType", () => {
  it(
    "WHEN el dueño cambia el nombre y los grants de un tipo THE SYSTEM SHALL reflejar el cambio al " +
      "releer con listPermissionTypes",
    async () => {
      const { org, ownerId } = await orgConDueno("Test Org Tipos Update");
      const creado = await createPermissionType(ownerId, org.id, "Vendedor", { objetivos: "area" });
      if (!creado.ok) throw new Error("createPermissionType falló");

      const result = await updatePermissionType(ownerId, org.id, creado.data, "Vendedor Senior", {
        objetivos: "empresa",
        clientes: "empresa",
      });
      expect(result.ok).toBe(true);

      const tipos = await listPermissionTypes(org.id);
      const actualizado = tipos.find((t) => t.id === creado.data);
      expect(actualizado?.name).toBe("Vendedor Senior");
      expect(actualizado?.grants).toEqual({ objetivos: "empresa", clientes: "empresa" });
    },
  );

  it(
    "WHEN el dueño de OTRA empresa manda el id de un tipo ajeno con SU propio orgId THE SYSTEM SHALL " +
      "responder NOT_FOUND y no tocar la fila — lo contrario delataría que un tipo ajeno existe",
    async () => {
      const a = await orgConDueno("Test Org Tipos Update Cross A");
      const b = await orgConDueno("Test Org Tipos Update Cross B");

      const creado = await createPermissionType(a.ownerId, a.org.id, "De A", { objetivos: "area" });
      if (!creado.ok) throw new Error("createPermissionType falló");

      const result = await updatePermissionType(b.ownerId, b.org.id, creado.data, "Secuestrado", {
        objetivos: "empresa",
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

      const tiposA = await listPermissionTypes(a.org.id);
      const fila = tiposA.find((t) => t.id === creado.data);
      expect(fila?.name).toBe("De A");
      expect(fila?.grants).toEqual({ objetivos: "area" });
    },
  );
});

describe("listObjectives con alcance", () => {
  it(
    "WHEN el empleado tiene alcance `propio` THE SYSTEM SHALL devolverle solo lo asignado a él, " +
      "aunque su compañero tenga objetivos en la misma área",
    async () => {
      const org = await newOrg("Test Org Alcance Propio");
      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Operativo", grants: { objetivos: "propio" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const yo = crypto.randomUUID();
      const companero = crypto.randomUUID();
      await db.insert(profile).values([
        { id: yo, email: `${yo}@example.com` },
        { id: companero, email: `${companero}@example.com` },
      ]);
      createdProfileIds.push(yo, companero);
      await db.insert(membership).values([
        { userId: yo, orgId: org.id, role: "employee", permissionTypeId: tipo.id, acceptedAt: new Date() },
        { userId: companero, orgId: org.id, role: "employee", permissionTypeId: tipo.id, acceptedAt: new Date() },
      ]);

      await db.insert(objective).values([
        { orgId: org.id, title: "Mío", impactWeight: 10, dueDate: new Date(), assignedEmployeeId: yo },
        { orgId: org.id, title: "Suyo", impactWeight: 10, dueDate: new Date(), assignedEmployeeId: companero },
      ]);

      const { data } = await listObjectives(yo, org.id);
      expect(data.objectives.map((o) => o.title)).toEqual(["Mío"]);
    },
  );

  it(
    "WHEN el empleado tiene alcance `area` pero NO tiene área asignada THE SYSTEM SHALL devolver " +
      "cero, no todo — un miembro a medio configurar nunca ve de más",
    async () => {
      const org = await newOrg("Test Org Alcance Sin Area");
      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "A medias", grants: { objetivos: "area" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const userId = crypto.randomUUID();
      await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
      createdProfileIds.push(userId);
      await db.insert(membership).values({
        userId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        acceptedAt: new Date(),
      });

      await db
        .insert(objective)
        .values({ orgId: org.id, title: "De nadie", impactWeight: 10, dueDate: new Date() });

      const { data } = await listObjectives(userId, org.id);
      expect(data.objectives.length).toBe(0);
    },
  );

  it("WHEN la sección está en `ninguno` THE SYSTEM SHALL devolver la lista vacía, no lanzar", async () => {
    const org = await newOrg("Test Org Alcance Ninguno");
    const userId = crypto.randomUUID();
    await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
    createdProfileIds.push(userId);
    await db
      .insert(membership)
      .values({ userId, orgId: org.id, role: "employee", acceptedAt: new Date() });

    await db.insert(objective).values({ orgId: org.id, title: "Oculto", impactWeight: 10, dueDate: new Date() });

    const { data } = await listObjectives(userId, org.id);
    expect(data.objectives).toEqual([]);
  });

  it(
    "WHEN el empleado tiene alcance `empresa` THE SYSTEM SHALL devolverle todos los objetivos del " +
      "org, sin importar área ni a quién estén asignados",
    async () => {
      const org = await newOrg("Test Org Alcance Empresa");
      const [areaA] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Área A", color: "#f59e0b" })
        .returning();
      const [areaB] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Área B", color: "#22d3ee" })
        .returning();
      if (!areaA || !areaB) throw new Error("insert de area no devolvió fila");

      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Gerente", grants: { objetivos: "empresa" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const userId = crypto.randomUUID();
      await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
      createdProfileIds.push(userId);
      await db.insert(membership).values({
        userId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        areaId: areaA.id,
        acceptedAt: new Date(),
      });

      await db.insert(objective).values([
        { orgId: org.id, areaId: areaA.id, title: "De A", impactWeight: 10, dueDate: new Date() },
        { orgId: org.id, areaId: areaB.id, title: "De B", impactWeight: 10, dueDate: new Date() },
        { orgId: org.id, title: "Sin área", impactWeight: 10, dueDate: new Date() },
      ]);

      const { data } = await listObjectives(userId, org.id);
      expect(data.objectives.map((o) => o.title).sort()).toEqual(["De A", "De B", "Sin área"]);
    },
  );

  it(
    "WHEN el empleado tiene alcance `area` CON área asignada THE SYSTEM SHALL devolverle los " +
      "objetivos de su área y no los de otra",
    async () => {
      const org = await newOrg("Test Org Alcance Area Con Area");
      const [areaSuya] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Suya", color: "#f59e0b" })
        .returning();
      const [areaAjena] = await db
        .insert(area)
        .values({ orgId: org.id, name: "Ajena", color: "#22d3ee" })
        .returning();
      if (!areaSuya || !areaAjena) throw new Error("insert de area no devolvió fila");

      const [tipo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Jefe de área", grants: { objetivos: "area" } })
        .returning();
      if (!tipo) throw new Error("insert de permission_type no devolvió fila");

      const userId = crypto.randomUUID();
      await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
      createdProfileIds.push(userId);
      await db.insert(membership).values({
        userId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        areaId: areaSuya.id,
        acceptedAt: new Date(),
      });

      await db.insert(objective).values([
        { orgId: org.id, areaId: areaSuya.id, title: "De su área", impactWeight: 10, dueDate: new Date() },
        { orgId: org.id, areaId: areaAjena.id, title: "De otra área", impactWeight: 10, dueDate: new Date() },
      ]);

      const { data } = await listObjectives(userId, org.id);
      expect(data.objectives.map((o) => o.title)).toEqual(["De su área"]);
    },
  );
});
