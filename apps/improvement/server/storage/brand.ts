// El logo del negocio, en el bucket `brand` de Supabase Storage. Mismo patrón que avatar.ts: se sube
// con el token del usuario, nunca con la service-role key, y la política del bucket (0061) solo deja
// escribir al dueño dentro de la carpeta de su org.
import { createClient } from "@supabase/supabase-js";
import { env } from "../../lib/env.ts";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const BRAND_BUCKET = "brand";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Sube (o reemplaza) el logo y devuelve su URL pública, lista para org_brand.logo_url. */
export async function uploadBrandLogo(userId: string, orgId: string, accessToken: string, file: File): Promise<Result<string>> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño cambia la marca." } };
  if (!ALLOWED_TYPES.has(file.type)) return { ok: false, error: { code: "VALIDATION_ERROR", message: "El logo debe ser JPG, PNG o WebP." } };
  if (file.size > MAX_BYTES) return { ok: false, error: { code: "VALIDATION_ERROR", message: "El logo no puede pesar más de 2 MB." } };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { ok: false, error: { code: "CONFIG_ERROR", message: "Supabase no está configurado en este entorno." } };
  }
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${orgId}/logo.${extension}`;
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { error } = await supabase.storage.from(BRAND_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { ok: false, error: { code: "STORAGE_ERROR", message: error.message } };
  // ?v= para que el navegador no siga mostrando el logo anterior tras reemplazarlo.
  return { ok: true, data: `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BRAND_BUCKET}/${path}?v=${Date.now()}` };
}
