// El perfil del dueño tal como se ve en su panel: nombre, etiqueta y foto.
//
// Los indicadores NO viven aquí: qué mide cada empresa es de la empresa, no de la persona (un dueño
// con una constructora y un restaurante no mide lo mismo en las dos). Están en org_kpi, y los edita
// server/kpis/mutations.ts.
//
// Sin guard de org a propósito: un profile no pertenece a ninguna organización, y cada función
// recibe el userId ya resuelto de la sesión por el caller (vía getSessionUserId) — nadie puede
// pasar el id de otro porque nunca viaja en la request, sale de la cookie.
//
// Por qué existe updateMyFullName: provisionOrganization (apps/admin) guarda fullName cuando el
// cliente viene de un prospecto, pero quien llega por auto-registro nunca tuvo dónde escribirlo, y
// las vistas caen a `fullName ?? email` — el dueño terminaba viendo su propio correo como nombre.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { profile } from "@jotapuntoce/db/schema";
import { isOwnerLabel } from "@jotapuntoce/ui/building/ownerLabels.ts";
import { avatarPublicUrl } from "../storage/avatar.ts";

export interface MyProfile {
  id: string;
  email: string;
  fullName: string | null;
  ownerLabel: string | null;
  /** Ya resuelta a URL pública — la columna guarda solo la ruta dentro del bucket. */
  avatarUrl: string | null;
}

export async function getMyProfile(userId: string): Promise<MyProfile | null> {
  const [row] = await db
    .select({
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      ownerLabel: profile.ownerLabel,
      avatarPath: profile.avatarPath,
    })
    .from(profile)
    .where(eq(profile.id, userId))
    .limit(1);
  if (!row) return null;

  const { avatarPath, ...rest } = row;
  return { ...rest, avatarUrl: avatarPublicUrl(avatarPath) };
}

/**
 * WHEN el nombre viene vacío o solo con espacios THE SYSTEM SHALL rechazarlo sin escribir, para no
 * cambiar un nombre real por una cadena en blanco. Mismo shape de resultado tipado que
 * server/companyRequests/mutations.ts.
 */
export async function updateMyFullName(userId: string, fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return {
      ok: false as const,
      error: { code: "VALIDATION_ERROR" as const, message: "El nombre no puede estar vacío." },
    };
  }

  return writeProfile(userId, { fullName: trimmed });
}

/**
 * WHEN la etiqueta no es uno de los ids de OWNER_LABELS THE SYSTEM SHALL rechazarla sin escribir —
 * el chip del panel dibuja el texto del catálogo, así que un valor libre se vería como "sin
 * etiqueta" y el dueño no entendería por qué su cambio no tuvo efecto. Cadena vacía sí es válida y
 * significa quitar la etiqueta.
 */
export async function updateMyOwnerLabel(userId: string, ownerLabel: string) {
  if (ownerLabel === "") return writeProfile(userId, { ownerLabel: null });

  if (!isOwnerLabel(ownerLabel)) {
    return {
      ok: false as const,
      error: { code: "VALIDATION_ERROR" as const, message: "Esa etiqueta no existe." },
    };
  }

  return writeProfile(userId, { ownerLabel });
}

/** La ruta dentro del bucket ya subida por server/storage/avatar.ts — aquí solo se persiste. */
export async function updateMyAvatarPath(userId: string, avatarPath: string) {
  return writeProfile(userId, { avatarPath });
}

/** Un solo update + la misma traducción de "no existe" para las cuatro mutaciones de arriba. */
async function writeProfile(userId: string, values: Partial<typeof profile.$inferInsert>) {
  const [row] = await db.update(profile).set(values).where(eq(profile.id, userId)).returning();
  if (!row) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "El profile no existe." },
    };
  }
  return { ok: true as const, data: row };
}
