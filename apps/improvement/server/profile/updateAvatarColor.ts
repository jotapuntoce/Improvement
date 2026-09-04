"use server";

// Server Action — un usuario solo puede cambiar SU PROPIO avatar_color, nunca el de otro (ni
// siquiera un platform admin puede cambiar el de un cliente). Este es el ÚNICO export de este
// archivo "use server" a propósito: en un módulo "use server" cualquier export es candidato a
// quedar expuesto como endpoint público de Next si algo llegara a importarlo desde un "use client",
// así que la lógica sin guard (setAvatarColorForUser, que acepta un userId explícito) vive en un
// archivo plano aparte — ver setAvatarColorForUser.ts. updateAvatarColor SIEMPRE resuelve el userId
// desde la sesión real vía getSessionUserId() antes de delegar — nunca acepta un userId externo.
import { getSessionUserId } from "../auth/guard.ts";
import { setAvatarColorForUser } from "./setAvatarColorForUser.ts";

export async function updateAvatarColor(preset: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sin sesión" };

  return setAvatarColorForUser(userId, preset);
}
