// Invitaciones: el token vive una vez y solo en el correo de quien lo recibió — en la base queda
// únicamente su hash, así que quien se robe la base no se roba invitaciones usables.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { invitation, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { createInvitation, hashToken } from "../server/invitations/mutations.ts";

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
