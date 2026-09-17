// La foto de perfil del dueño, en el bucket `avatars` de Supabase Storage.
//
// Se sube CON EL TOKEN DEL USUARIO, no con la service-role key: esa clave es exclusiva de
// apps/admin y no se importa nunca desde aquí (regla no negociable #3 de CLAUDE.md). La política
// del bucket (migración 0011) exige que el primer segmento de la ruta sea auth.uid(), así que aun
// si este código tuviera un bug de autorización, Postgres no dejaría a nadie escribir en la carpeta
// de otro.
//
// La columna profile.avatar_path guarda la ruta dentro del bucket, no la URL: el proyecto de
// Supabase puede cambiar de dominio sin migrar filas.
import { createClient } from "@supabase/supabase-js";
import { env } from "../../lib/env.ts";

export const AVATAR_BUCKET = "avatars";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** La URL pública de una ruta guardada, o null si el perfil no tiene foto. */
export function avatarPublicUrl(path: string | null): string | null {
  if (!path || !env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

/**
 * WHEN el archivo no es una imagen de un tipo permitido, o pesa más de 2 MB, THE SYSTEM SHALL
 * rechazarlo sin subir nada — validación en el borde de confianza, antes de tocar Storage.
 *
 * Devuelve la ruta dentro del bucket para que el caller la persista. `upsert: true` con un nombre
 * fijo por usuario: cada foto nueva pisa la anterior en vez de dejar basura acumulada en el bucket,
 * y la ruta sigue siendo estable.
 */
export async function uploadAvatar(
  userId: string,
  accessToken: string,
  file: File,
): Promise<{ ok: true; data: string } | { ok: false; error: { code: string; message: string } }> {
  if (!ALLOWED_TYPES.has(file.type)) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "La foto debe ser JPG, PNG o WebP." },
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "La foto no puede pesar más de 2 MB." },
    };
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      ok: false,
      error: { code: "CONFIG_ERROR", message: "Supabase no está configurado en este entorno." },
    };
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${extension}`;

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    return { ok: false, error: { code: "STORAGE_ERROR", message: error.message } };
  }

  return { ok: true, data: path };
}
