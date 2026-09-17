// El dueño cambia el acceso de alguien que YA es empleado, o lo da de baja. Antes de esto el tipo de
// permiso y el área se fijaban al aceptar la invitación y quedaban congelados: ascender a alguien, o
// que un empleado eligiera "Sin área" con alcance `area`, eran callejones sin salida dentro del
// producto (lo confirmó la revisión final de la rama de invitaciones).
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { removeMembership, updateMembership } from "../server/employees/mutations.ts";

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

async function nuevaPersona() {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  createdProfileIds.push(id);
  return id;
}

/** Una empresa con su dueño, un tipo de permiso, un área y un empleado ya adentro. */
async function empresaConEquipo(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}-${Math.random()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);

  const ownerId = await nuevaPersona();
  await db.insert(membership).values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

  const [tipo] = await db
    .insert(permissionType)
    .values({ orgId: org.id, name: "Vendedor", grants: { objetivos: "area" } })
    .returning();
  if (!tipo) throw new Error("insert de permission_type no devolvió fila");

  const [areaRow] = await db.insert(area).values({ orgId: org.id, name: "Ventas", color: "#7c5cff" }).returning();
  if (!areaRow) throw new Error("insert de area no devolvió fila");

  const employeeId = await nuevaPersona();
  await db.insert(membership).values({
    userId: employeeId,
    orgId: org.id,
    role: "employee",
    jobTitle: "Vendedor de piso",
    acceptedAt: new Date(),
  });

  return { org, ownerId, tipo, areaRow, employeeId };
}

function leerMembresia(userId: string, orgId: string) {
  return db
    .select()
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.orgId, orgId)))
    .limit(1);
}

describe("updateMembership", () => {
  it(
    "WHEN el dueño le cambia el tipo, el área y el puesto a un empleado THE SYSTEM SHALL reflejarlo " +
      "al releer la membresía",
    async () => {
      const { org, ownerId, tipo, areaRow, employeeId } = await empresaConEquipo("Test Cambia Acceso");

      const result = await updateMembership(ownerId, org.id, employeeId, {
        permissionTypeId: tipo.id,
        areaId: areaRow.id,
        jobTitle: "Jefe de ventas",
      });
      expect(result.ok).toBe(true);

      const [row] = await leerMembresia(employeeId, org.id);
      expect(row?.permissionTypeId).toBe(tipo.id);
      expect(row?.areaId).toBe(areaRow.id);
      expect(row?.jobTitle).toBe("Jefe de ventas");
    },
  );

  it(
    "WHEN un empleado intenta cambiarle el acceso a otro THE SYSTEM SHALL rechazarlo con FORBIDDEN " +
      "sin escribir — cambiar quién ve qué es decisión del dueño",
    async () => {
      const { org, tipo, employeeId } = await empresaConEquipo("Test Empleado Edita");
      const otro = await nuevaPersona();
      await db.insert(membership).values({ userId: otro, orgId: org.id, role: "employee", acceptedAt: new Date() });

      const result = await updateMembership(employeeId, org.id, otro, {
        permissionTypeId: tipo.id,
        areaId: null,
        jobTitle: "Gerente",
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");

      const [row] = await leerMembresia(otro, org.id);
      expect(row?.permissionTypeId).toBeNull();
      expect(row?.jobTitle).toBeNull();
    },
  );

  it(
    "WHEN el tipo de permiso es de OTRA empresa THE SYSTEM SHALL responder NOT_FOUND sin escribir — " +
      "un id que llega de un formulario no es de confianza aunque lo mande el dueño",
    async () => {
      const a = await empresaConEquipo("Test Tipo Ajeno A");
      const b = await empresaConEquipo("Test Tipo Ajeno B");

      const result = await updateMembership(a.ownerId, a.org.id, a.employeeId, {
        permissionTypeId: b.tipo.id,
        areaId: null,
        jobTitle: "Vendedor de piso",
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

      const [row] = await leerMembresia(a.employeeId, a.org.id);
      expect(row?.permissionTypeId).toBeNull();
    },
  );

  it("WHEN el área es de OTRA empresa THE SYSTEM SHALL responder NOT_FOUND sin escribir", async () => {
    const a = await empresaConEquipo("Test Area Ajena A");
    const b = await empresaConEquipo("Test Area Ajena B");

    const result = await updateMembership(a.ownerId, a.org.id, a.employeeId, {
      permissionTypeId: null,
      areaId: b.areaRow.id,
      jobTitle: "Vendedor de piso",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

    const [row] = await leerMembresia(a.employeeId, a.org.id);
    expect(row?.areaId).toBeNull();
  });

  it(
    "WHEN el dueño se edita a sí mismo THE SYSTEM SHALL rechazarlo — quitarse los propios permisos " +
      "lo dejaría fuera de su empresa sin vuelta atrás",
    async () => {
      const { org, ownerId } = await empresaConEquipo("Test Dueno Se Edita");

      const result = await updateMembership(ownerId, org.id, ownerId, {
        permissionTypeId: null,
        areaId: null,
        jobTitle: "Dueño",
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
    },
  );
});

describe("removeMembership", () => {
  it(
    "WHEN el dueño da de baja a alguien THE SYSTEM SHALL quitar su membresía y dejar sus objetivos " +
      "sin responsable, sin borrarlos",
    async () => {
      const { org, ownerId, employeeId } = await empresaConEquipo("Test Baja");
      await db.insert(objective).values({
        orgId: org.id,
        title: "Cerrar el trimestre",
        impactWeight: 10,
        dueDate: new Date(),
        assignedEmployeeId: employeeId,
      });

      const result = await removeMembership(ownerId, org.id, employeeId);
      expect(result.ok).toBe(true);

      const filas = await leerMembresia(employeeId, org.id);
      expect(filas.length).toBe(0);

      const objetivos = await db.select().from(objective).where(eq(objective.orgId, org.id));
      expect(objetivos.length).toBe(1);
      expect(objetivos[0]?.assignedEmployeeId).toBeNull();
    },
  );

  it(
    "WHEN la misma persona también trabaja en OTRA empresa del mismo dueño THE SYSTEM SHALL no " +
      "tocar sus objetivos de allá — la baja es de una empresa, no de la plataforma",
    async () => {
      const a = await empresaConEquipo("Test Baja Solo Aqui A");
      const b = await empresaConEquipo("Test Baja Solo Aqui B");

      // La misma persona, en las dos empresas, con un objetivo en cada una.
      await db.insert(membership).values({
        userId: a.employeeId,
        orgId: b.org.id,
        role: "employee",
        acceptedAt: new Date(),
      });
      await db.insert(objective).values([
        { orgId: a.org.id, title: "De aquí", impactWeight: 10, dueDate: new Date(), assignedEmployeeId: a.employeeId },
        { orgId: b.org.id, title: "De allá", impactWeight: 10, dueDate: new Date(), assignedEmployeeId: a.employeeId },
      ]);

      const result = await removeMembership(a.ownerId, a.org.id, a.employeeId);
      expect(result.ok).toBe(true);

      const [alla] = await db.select().from(objective).where(eq(objective.orgId, b.org.id));
      expect(alla?.assignedEmployeeId).toBe(a.employeeId);

      const membresiaAlla = await leerMembresia(a.employeeId, b.org.id);
      expect(membresiaAlla.length).toBe(1);
    },
  );

  it(
    "WHEN se intenta dar de baja al dueño THE SYSTEM SHALL rechazarlo — una empresa sin dueño no " +
      "tiene quien la administre",
    async () => {
      const { org, ownerId } = await empresaConEquipo("Test Baja Dueno");

      const result = await removeMembership(ownerId, org.id, ownerId);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");

      const filas = await leerMembresia(ownerId, org.id);
      expect(filas.length).toBe(1);
    },
  );

  it(
    "WHEN el dueño de OTRA empresa manda el id de un empleado ajeno THE SYSTEM SHALL responder " +
      "NOT_FOUND y no darlo de baja",
    async () => {
      const a = await empresaConEquipo("Test Baja Cruzada A");
      const b = await empresaConEquipo("Test Baja Cruzada B");

      const result = await removeMembership(b.ownerId, b.org.id, a.employeeId);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

      const filas = await leerMembresia(a.employeeId, a.org.id);
      expect(filas.length).toBe(1);
    },
  );
});
