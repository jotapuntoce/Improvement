// Lógica de negocio pura, SIN "use server" — este archivo nunca queda expuesto como endpoint
// público de Next, aunque algo llegue a importarlo desde un "use client". Acepta un userId
// explícito porque existe solo para ser llamado desde código server-side ya autorizado
// (updateAvatarColor.ts, que resuelve el userId real vía getSessionUserId() antes de llamar aquí) o
// desde tests, sin mockear cookies() — mismo patrón que provisionOrganization en
// apps/admin/app/prospects/actions.js.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { profile } from "@jotapuntoce/db/schema";

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
