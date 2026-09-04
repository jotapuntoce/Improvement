"use server";

// Server Action — un usuario solo puede cambiar SU PROPIO avatar_color, nunca el de otro (ni
// siquiera un platform admin puede cambiar el de un cliente). updateAvatarColor (el export público,
// llamado desde el cliente) SIEMPRE resuelve el userId desde la sesión real vía getSessionUserId()
// — nunca acepta un userId externo. setAvatarColorForUser es la lógica de negocio pura, sin ese
// guard, para poder probarla sin mockear cookies() (mismo patrón que provisionOrganization en
// apps/admin/app/prospects/actions.js).
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { profile } from "@jotapuntoce/db/schema";
import { getSessionUserId } from "../auth/guard.ts";

const VALID_PRESETS = ["aurora", "esmeralda", "solar", "indigo"] as const;
type AvatarColorPreset = (typeof VALID_PRESETS)[number];

function isValidPreset(value: string): value is AvatarColorPreset {
  return (VALID_PRESETS as readonly string[]).includes(value);
}

export async function setAvatarColorForUser(
  userId: string,
  preset: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidPreset(preset)) {
    return { ok: false, error: `Preset inválido: ${preset}` };
  }

  await db.update(profile).set({ avatarColor: preset }).where(eq(profile.id, userId));
  return { ok: true };
}

export async function updateAvatarColor(preset: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sin sesión" };

  return setAvatarColorForUser(userId, preset);
}
