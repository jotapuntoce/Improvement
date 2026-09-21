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
import { belongsToOrg } from "../db/belongsToOrg.ts";

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

  // NOT_FOUND y no VALIDATION_ERROR: desde el punto de vista de este org, un id de tipo ajeno
  // simplemente no existe (mismo criterio que server/areas/mutations.ts con un id ajeno).
  if (!(await belongsToOrg(permissionType, permissionTypeId, orgId))) {
    return fail("Ese tipo de permiso no es de esta empresa.", "NOT_FOUND");
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + DIAS_DE_VIDA * 86_400_000);

  const [row] = await db
    .insert(invitation)
    .values({
      orgId,
      email: correo.data,
      role: "employee",
      tokenHash: hashToken(token),
      permissionTypeId,
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

  if (parsed.data.areaId !== null && !(await belongsToOrg(area, parsed.data.areaId, inv.orgId))) {
    return fail("Esa área no es de esta empresa.", "NOT_FOUND");
  }

  // Nada impide hoy que el dueño invite otra vez a un correo que ya está adentro (createInvitation
  // no lo comprueba). Sin este chequeo, el insert de membership de abajo chocaría en silencio contra
  // uq_membership_user_org (.onConflictDoNothing(), sin .returning()) y la persona creería que su
  // puesto, área y tipo de permiso quedaron como dice el formulario — siguen siendo los viejos.
  // Rechazamos explícito en vez de sobrescribir: cambiarle el acceso a un empleado que ya está dentro
  // es decisión del dueño, con su propia pantalla, no algo que un enlace resuelva solo.
  const [yaMiembro] = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(and(eq(membership.userId, sessionUser.id), eq(membership.orgId, inv.orgId)))
    .limit(1);
  if (yaMiembro) {
    return fail("Ya eres parte de esta empresa. Entra desde /login.", "ALREADY_MEMBER");
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

      // El chequeo de arriba (`yaMiembro`) no cierra la ventana entera: si la misma persona acepta
      // dos invitaciones a la misma empresa casi al mismo tiempo, ambas transacciones pueden pasarlo
      // antes de que cualquiera confirme. El `.returning()` aquí es la segunda cerradura — si el
      // índice único (uq_membership_user_org) se comió el insert en silencio, no hay fila que
      // devolver y lo convertimos en un fallo fuerte en vez de reportar ok:true sobre una escritura
      // que no ocurrió (mismo criterio que `claimed` arriba, dos líneas más arriba).
      const [insertedMembership] = await tx
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
        .onConflictDoNothing()
        .returning({ userId: membership.userId });
      if (!insertedMembership) throw new Error("ALREADY_MEMBER");

      return { ok: true as const, data: { orgId: inv.orgId } };
    });
  } catch (err) {
    // Misma persona, misma situación que el chequeo previo a la transacción: le decimos lo mismo.
    if (err instanceof Error && err.message === "ALREADY_MEMBER") {
      return fail("Ya eres parte de esta empresa. Entra desde /login.", "ALREADY_MEMBER");
    }
    return fail("Este enlace ya no sirve.", "NOT_FOUND");
  }
}
