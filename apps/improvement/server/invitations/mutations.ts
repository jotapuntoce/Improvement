// El dueño emite un enlace de invitación. El token crudo se devuelve UNA vez, para que la pantalla
// lo muestre; en la base queda solo su SHA-256, así que quien se robe la base no se roba
// invitaciones usables.
//
// Mandarlo por correo o WhatsApp no es de este módulo: esa integración está en pausa por decisión de
// Jose Carlos hasta terminar de construir la empresa digital. Hoy el dueño copia el enlace.
import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, invitation, membership, permissionType, profile } from "@jotapuntoce/db/schema";
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

const acceptSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe tu nombre completo."),
  phone: z.string().trim().min(7, "Escribe un teléfono donde te podamos avisar."),
  areaId: z.uuid().nullable(),
  jobTitle: z.string().trim().min(2, "Escribe tu puesto."),
  responsibilities: z.string().trim().min(3, "Escribe de qué te encargas."),
});

/**
 * El empleado ya se registró en Supabase Auth del lado del cliente (signUp con la llave anon — la
 * service-role key no existe en esta app, Non-negotiable #3). Aquí solo se confía en `sessionUser`,
 * que el guard resolvió del access token real: el id NUNCA llega como parámetro del formulario.
 *
 * WHEN el token está muerto, el correo registrado no es el invitado, o el areaId no es de la misma
 * empresa que invita THE SYSTEM SHALL rechazar sin escribir nada. El areaId lo manda el formulario —
 * quien acepta, alguien todavía sin confiar — así que sin este chequeo podría mandar el id de un área
 * de otra empresa y dejar una fila de membership apuntando a un área ajena (mismo criterio que el
 * permissionTypeId de createInvitation, arriba). WHEN todo cuadra THE SYSTEM SHALL crear perfil y
 * membresía en UNA transacción, para que un fallo a media pasada no deje a alguien a medio entrar.
 */
export async function acceptInvitation(
  token: string,
  sessionUser: { id: string; email: string },
  form: unknown,
): Promise<Result<{ orgId: string }>> {
  const parsed = acceptSchema.safeParse(form);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Faltan datos del formulario.");
  }

  const [inv] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.tokenHash, hashToken(token)),
        isNull(invitation.acceptedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!inv) return fail("Este enlace ya no sirve.", "NOT_FOUND");
  if (inv.email.toLowerCase() !== sessionUser.email.toLowerCase()) {
    return fail("Este enlace es para otro correo.", "FORBIDDEN");
  }

  if (parsed.data.areaId !== null) {
    const [areaPropia] = await db
      .select({ id: area.id })
      .from(area)
      .where(and(eq(area.id, parsed.data.areaId), eq(area.orgId, inv.orgId)))
      .limit(1);
    if (!areaPropia) return fail("Esa área no es de esta empresa.", "NOT_FOUND");
  }

  try {
    return await db.transaction(async (tx) => {
      // El reclamo del enlace va PRIMERO: si dos personas abren el mismo enlace a la vez, la carrera
      // se resuelve antes de escribir nada. Misma guarda que server/reminders/deliver.ts.
      const [claimed] = await tx
        .update(invitation)
        .set({ acceptedAt: new Date() })
        .where(and(eq(invitation.id, inv.id), isNull(invitation.acceptedAt)))
        .returning({ id: invitation.id });
      if (!claimed) throw new Error("INVITACION_YA_USADA");

      await tx
        .insert(profile)
        .values({
          id: sessionUser.id,
          email: inv.email,
          fullName: parsed.data.fullName,
          phone: parsed.data.phone,
        })
        // Ya puede existir: la misma persona pudo haber entrado antes a otra empresa del mismo dueño.
        .onConflictDoUpdate({
          target: profile.id,
          set: { fullName: parsed.data.fullName, phone: parsed.data.phone },
        });

      await tx
        .insert(membership)
        .values({
          userId: sessionUser.id,
          orgId: inv.orgId,
          role: "employee",
          permissionTypeId: inv.permissionTypeId,
          areaId: parsed.data.areaId,
          jobTitle: parsed.data.jobTitle,
          responsibilities: parsed.data.responsibilities,
          acceptedAt: new Date(),
        })
        .onConflictDoNothing();

      return { ok: true as const, data: { orgId: inv.orgId } };
    });
  } catch {
    return fail("Este enlace ya no sirve.", "NOT_FOUND");
  }
}
