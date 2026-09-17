// El dueño emite un enlace de invitación. El token crudo se devuelve UNA vez, para que la pantalla
// lo muestre; en la base queda solo su SHA-256, así que quien se robe la base no se roba
// invitaciones usables.
//
// Mandarlo por correo o WhatsApp no es de este módulo: esa integración está en pausa por decisión de
// Jose Carlos hasta terminar de construir la empresa digital. Hoy el dueño copia el enlace.
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { invitation, permissionType } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

const DIAS_DE_VIDA = 7;
const emailSchema = z.email();

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation(
  userId: string,
  orgId: string,
  email: string,
  permissionTypeId: string,
): Promise<Result<{ token: string; expiresAt: Date }>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño invita a su equipo.", "FORBIDDEN");
  }

  const correo = emailSchema.safeParse(email.trim().toLowerCase());
  if (!correo.success) return fail("Ese correo no es válido.");

  // El tipo tiene que ser de ESTA empresa: sin este chequeo, el dueño de una podría colar el id de
  // un tipo de otra y conceder permisos que no son suyos. NOT_FOUND y no VALIDATION_ERROR: desde el
  // punto de vista de este org, ese id de tipo simplemente no existe (mismo criterio que
  // server/areas/mutations.ts con un id ajeno).
  const [tipo] = await db
    .select({ id: permissionType.id })
    .from(permissionType)
    .where(and(eq(permissionType.id, permissionTypeId), eq(permissionType.orgId, orgId)))
    .limit(1);
  if (!tipo) return fail("Ese tipo de permiso no es de esta empresa.", "NOT_FOUND");

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + DIAS_DE_VIDA * 86_400_000);

  const [row] = await db
    .insert(invitation)
    .values({
      orgId,
      email: correo.data,
      role: "employee",
      tokenHash: hashToken(token),
      permissionTypeId: tipo.id,
      expiresAt,
    })
    .returning({ id: invitation.id });

  return row ? { ok: true, data: { token, expiresAt } } : fail("No se pudo crear la invitación.", "NOT_FOUND");
}
