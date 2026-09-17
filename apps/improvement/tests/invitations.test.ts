// Invitaciones: el token vive una vez y solo en el correo de quien lo recibió — en la base queda
// únicamente su hash, así que quien se robe la base no se roba invitaciones usables.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, invitation, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { acceptInvitation, createInvitation, hashToken } from "../server/invitations/mutations.ts";
import { findOpenInvitation } from "../server/invitations/loadInvitations.ts";

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

// Sin `export`: la Tarea 7 agrega sus pruebas a ESTE mismo archivo y la usa directo.
async function orgConDuenoYTipo(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);

  const ownerId = crypto.randomUUID();
  await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
  createdProfileIds.push(ownerId);
  await db
    .insert(membership)
    .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

  const [tipo] = await db
    .insert(permissionType)
    .values({ orgId: org.id, name: "Vendedor", grants: { objetivos: "area" } })
    .returning();
  if (!tipo) throw new Error("insert de permission_type no devolvió fila");

  return { org, ownerId, tipo };
}

describe("createInvitation", () => {
  it(
    "WHEN el dueño invita THE SYSTEM SHALL guardar solo el hash del token y devolver el token " +
      "crudo una única vez",
    async () => {
      const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Invita");

      const result = await createInvitation(ownerId, org.id, "nuevo@example.com", tipo.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const [row] = await db.select().from(invitation).where(eq(invitation.orgId, org.id));
      expect(row?.tokenHash).toBe(hashToken(result.data.token));
      expect(row?.tokenHash).not.toBe(result.data.token);
      expect(row?.permissionTypeId).toBe(tipo.id);
      expect(row?.acceptedAt).toBeNull();
    },
  );

  it("WHEN el enlace se emite THE SYSTEM SHALL darle 7 días de vida", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Invita Vence");
    const result = await createInvitation(ownerId, org.id, "otro@example.com", tipo.id);
    if (!result.ok) throw new Error("createInvitation falló");

    const dias = (result.data.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);
  });

  it(
    "WHEN quien invita no es el dueño THE SYSTEM SHALL rechazarlo con FORBIDDEN — un código distinto " +
      "de validación probaría que el guard corrió, no que la forma del input estaba mal",
    async () => {
      const { org, tipo } = await orgConDuenoYTipo("Test Org Invita Empleado");
      const employeeId = crypto.randomUUID();
      await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
      createdProfileIds.push(employeeId);
      await db
        .insert(membership)
        .values({ userId: employeeId, orgId: org.id, role: "employee", acceptedAt: new Date() });

      const result = await createInvitation(employeeId, org.id, "colado@example.com", tipo.id);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");

      const [row] = await db.select().from(invitation).where(eq(invitation.orgId, org.id));
      expect(row).toBeUndefined();
    },
  );

  it(
    "WHEN el tipo de permiso es de OTRA empresa THE SYSTEM SHALL rechazarlo sin crear la fila — si " +
      "no, el dueño de una empresa podría colar el tipo de otra y conceder lo que no es suyo",
    async () => {
      const a = await orgConDuenoYTipo("Test Org Invita A");
      const b = await orgConDuenoYTipo("Test Org Invita B");

      const result = await createInvitation(a.ownerId, a.org.id, "cruzado@example.com", b.tipo.id);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

      const [row] = await db.select().from(invitation).where(eq(invitation.orgId, a.org.id));
      expect(row).toBeUndefined();
    },
  );
});

const formValido = {
  fullName: "Lucía Ramírez",
  phone: "5215512345678",
  areaId: null,
  jobTitle: "Jefa de obra",
  responsibilities: "Coordina a los maestros y cierra las bitácoras",
};

describe("acceptInvitation", () => {
  it(
    "WHEN alguien acepta con un token vivo THE SYSTEM SHALL crear su perfil y su membresía con el " +
      "puesto y el tipo de permiso que traía la invitación",
    async () => {
      const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta");
      const emitida = await createInvitation(ownerId, org.id, "lucia@example.com", tipo.id);
      if (!emitida.ok) throw new Error("createInvitation falló");

      const nuevoId = crypto.randomUUID();
      createdProfileIds.push(nuevoId);

      const result = await acceptInvitation(
        emitida.data.token,
        { id: nuevoId, email: "lucia@example.com" },
        formValido,
      );
      expect(result.ok).toBe(true);

      const [row] = await db
        .select()
        .from(membership)
        .where(and(eq(membership.userId, nuevoId), eq(membership.orgId, org.id)));
      expect(row?.permissionTypeId).toBe(tipo.id);
      expect(row?.jobTitle).toBe("Jefa de obra");
      expect(row?.role).toBe("employee");

      const [perfil] = await db.select().from(profile).where(eq(profile.id, nuevoId));
      expect(perfil?.phone).toBe("5215512345678");
    },
  );

  it("WHEN el mismo enlace se usa dos veces THE SYSTEM SHALL rechazar el segundo intento", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Dos Veces");
    const emitida = await createInvitation(ownerId, org.id, "repetida@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    const primero = crypto.randomUUID();
    const segundo = crypto.randomUUID();
    createdProfileIds.push(primero, segundo);

    const uno = await acceptInvitation(emitida.data.token, { id: primero, email: "repetida@example.com" }, formValido);
    const dos = await acceptInvitation(emitida.data.token, { id: segundo, email: "repetida@example.com" }, formValido);

    expect(uno.ok).toBe(true);
    expect(dos.ok).toBe(false);
    expect(dos.ok === false && dos.error.code).toBe("NOT_FOUND");

    const filas = await db.select().from(membership).where(eq(membership.userId, segundo));
    expect(filas.length).toBe(0);
  });

  it(
    "WHEN quien acepta se registró con OTRO correo THE SYSTEM SHALL rechazarlo — el correo lo fijó " +
      "el dueño al invitar y el formulario no lo puede cambiar",
    async () => {
      const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Otro Correo");
      const emitida = await createInvitation(ownerId, org.id, "invitado@example.com", tipo.id);
      if (!emitida.ok) throw new Error("createInvitation falló");

      const intruso = crypto.randomUUID();
      const result = await acceptInvitation(
        emitida.data.token,
        { id: intruso, email: "intruso@example.com" },
        formValido,
      );
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");

      const filas = await db.select().from(membership).where(eq(membership.userId, intruso));
      expect(filas.length).toBe(0);
    },
  );

  it("WHEN el enlace ya venció THE SYSTEM SHALL rechazarlo", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Vencida");
    const emitida = await createInvitation(ownerId, org.id, "tarde@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitation.tokenHash, hashToken(emitida.data.token)));

    const tarde = crypto.randomUUID();
    const result = await acceptInvitation(emitida.data.token, { id: tarde, email: "tarde@example.com" }, formValido);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

    const filas = await db.select().from(membership).where(eq(membership.userId, tarde));
    expect(filas.length).toBe(0);
  });

  it("WHEN el formulario viene incompleto THE SYSTEM SHALL rechazarlo sin crear nada", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Incompleto");
    const emitida = await createInvitation(ownerId, org.id, "incompleto@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    const usuario = crypto.randomUUID();
    const result = await acceptInvitation(
      emitida.data.token,
      { id: usuario, email: "incompleto@example.com" },
      { ...formValido, fullName: "" },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("VALIDATION_ERROR");

    const filas = await db.select().from(membership).where(eq(membership.userId, usuario));
    expect(filas.length).toBe(0);
  });

  it(
    "WHEN el areaId del formulario es de OTRA empresa THE SYSTEM SHALL rechazarlo sin crear perfil " +
      "ni membresía — el areaId lo manda quien acepta, alguien todavía sin confiar, y podría mandar " +
      "el id de un área ajena",
    async () => {
      const propia = await orgConDuenoYTipo("Test Org Acepta Area Propia");
      const ajena = await orgConDuenoYTipo("Test Org Acepta Area Ajena");

      const [areaAjena] = await db
        .insert(area)
        .values({ orgId: ajena.org.id, name: "Ventas", color: "#7c5cff" })
        .returning();
      if (!areaAjena) throw new Error("insert de area no devolvió fila");

      const emitida = await createInvitation(propia.ownerId, propia.org.id, "colado@example.com", propia.tipo.id);
      if (!emitida.ok) throw new Error("createInvitation falló");

      const usuario = crypto.randomUUID();
      const result = await acceptInvitation(
        emitida.data.token,
        { id: usuario, email: "colado@example.com" },
        { ...formValido, areaId: areaAjena.id },
      );
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

      const filas = await db.select().from(membership).where(eq(membership.userId, usuario));
      expect(filas.length).toBe(0);
      const perfiles = await db.select().from(profile).where(eq(profile.id, usuario));
      expect(perfiles.length).toBe(0);
    },
  );

  it(
    "WHEN quien acepta YA es miembro de esta empresa THE SYSTEM SHALL rechazar con ALREADY_MEMBER " +
      "sin tocar su membresía ni consumir el enlace — nada impide hoy invitar de nuevo a un correo " +
      "que ya está adentro, y cambiarle el puesto o el tipo de permiso con lo que teclee en un " +
      "formulario es decisión del dueño, no de un enlace",
    async () => {
      const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Acepta Ya Miembro");

      const [tipoNuevo] = await db
        .insert(permissionType)
        .values({ orgId: org.id, name: "Supervisor", grants: { objetivos: "area" } })
        .returning();
      if (!tipoNuevo) throw new Error("insert de permission_type no devolvió fila");

      const miembroId = crypto.randomUUID();
      await db.insert(profile).values({ id: miembroId, email: "yamiembro@example.com" });
      createdProfileIds.push(miembroId);
      await db.insert(membership).values({
        userId: miembroId,
        orgId: org.id,
        role: "employee",
        permissionTypeId: tipo.id,
        jobTitle: "Puesto original",
        responsibilities: "Responsabilidades originales",
        acceptedAt: new Date(),
      });

      const emitida = await createInvitation(ownerId, org.id, "yamiembro@example.com", tipoNuevo.id);
      if (!emitida.ok) throw new Error("createInvitation falló");

      const result = await acceptInvitation(
        emitida.data.token,
        { id: miembroId, email: "yamiembro@example.com" },
        { ...formValido, jobTitle: "Puesto nuevo del formulario" },
      );
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("ALREADY_MEMBER");

      const [row] = await db
        .select()
        .from(membership)
        .where(and(eq(membership.userId, miembroId), eq(membership.orgId, org.id)));
      expect(row?.permissionTypeId).toBe(tipo.id);
      expect(row?.jobTitle).toBe("Puesto original");
      expect(row?.areaId).toBeNull();

      const [inv] = await db
        .select()
        .from(invitation)
        .where(eq(invitation.tokenHash, hashToken(emitida.data.token)));
      expect(inv?.acceptedAt).toBeNull();
    },
  );
});

describe("findOpenInvitation", () => {
  it("WHEN el token está vivo THE SYSTEM SHALL devolver la invitación", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Find Vivo");
    const emitida = await createInvitation(ownerId, org.id, "viva@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    const encontrada = await findOpenInvitation(emitida.data.token);
    expect(encontrada?.orgId).toBe(org.id);
    expect(encontrada?.email).toBe("viva@example.com");
    expect(encontrada?.orgName).toBe(org.name);
  });

  it("WHEN el token no existe THE SYSTEM SHALL devolver null", async () => {
    const encontrada = await findOpenInvitation(crypto.randomUUID());
    expect(encontrada).toBeNull();
  });

  it("WHEN el token ya fue usado THE SYSTEM SHALL devolver null", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Find Usado");
    const emitida = await createInvitation(ownerId, org.id, "usada@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    const usuario = crypto.randomUUID();
    createdProfileIds.push(usuario);
    const aceptado = await acceptInvitation(emitida.data.token, { id: usuario, email: "usada@example.com" }, formValido);
    if (!aceptado.ok) throw new Error("acceptInvitation falló preparando el caso");

    const encontrada = await findOpenInvitation(emitida.data.token);
    expect(encontrada).toBeNull();
  });

  it("WHEN el token venció THE SYSTEM SHALL devolver null", async () => {
    const { org, ownerId, tipo } = await orgConDuenoYTipo("Test Org Find Vencido");
    const emitida = await createInvitation(ownerId, org.id, "vencida@example.com", tipo.id);
    if (!emitida.ok) throw new Error("createInvitation falló");

    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitation.tokenHash, hashToken(emitida.data.token)));

    const encontrada = await findOpenInvitation(emitida.data.token);
    expect(encontrada).toBeNull();
  });
});
