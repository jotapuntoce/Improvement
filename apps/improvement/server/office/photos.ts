// Fotos del local del dueño, en el bucket PRIVADO `espacios` (migración 0060).
//
// Igual que server/storage/avatar.ts: se habla con Storage CON EL TOKEN DEL USUARIO, nunca con la
// service-role key (regla no negociable #3). La política del bucket exige que el primer segmento de
// la ruta sea un org del que el usuario es dueño, así que aun con un bug aquí nadie escribe en otro org.
// La ruta guardada es `{orgId}/{uuid}.{ext}`: las fotos no se reemplazan, se suben de nuevo.
import { createClient } from "@supabase/supabase-js";
import { env } from "../../lib/env.ts";
import { findOwnerMembership, getSessionAccessToken } from "../auth/guard.ts";

export const SPACE_BUCKET = "espacios";
export const MAX_SPACE_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type SpacePhotoType = keyof typeof EXTENSIONS;
const TYPE_BY_EXTENSION: Record<string, SpacePhotoType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export interface SpaceStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<{ error: string | null }>;
  download(path: string): Promise<{ data: { bytes: Uint8Array; contentType: string } | null; error: string | null }>;
}

type Failure = { ok: false; error: { code: string; message: string } };
const fail = (code: string, message: string): Failure => ({ ok: false, error: { code, message } });

/** Storage del bucket `espacios` hablando como el usuario dueño del token. */
export function userSpaceStorage(accessToken: string): SpaceStorage {
  const bucket = createClient(env.NEXT_PUBLIC_SUPABASE_URL ?? "", env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  }).storage.from(SPACE_BUCKET);
  return {
    async upload(path, bytes, contentType) {
      const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
      return { error: error?.message ?? null };
    },
    async download(path) {
      const { data, error } = await bucket.download(path);
      if (error || !data) return { data: null, error: error?.message ?? "Sin datos" };
      return { data: { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type }, error: null };
    },
  };
}

async function sessionStorage(): Promise<SpaceStorage | Failure> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return fail("CONFIG_ERROR", "Supabase no está configurado en este entorno.");
  }
  const token = await getSessionAccessToken();
  return token ? userSpaceStorage(token) : fail("UNAUTHENTICATED", "Tu sesión expiró. Vuelve a entrar.");
}

/**
 * WHEN el dueño sube de 1 a 6 fotos JPG/PNG/WebP de hasta 5 MB THE SYSTEM SHALL guardarlas bajo
 * `{orgId}/` y devolver sus rutas. Todo se valida antes de subir la primera.
 */
export async function uploadSpacePhotos(
  userId: string,
  orgId: string,
  files: File[],
  storage?: SpaceStorage,
): Promise<{ ok: true; data: string[] } | Failure> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("NOT_FOUND", "No encontrado.");
  if (files.length < 1 || files.length > MAX_SPACE_PHOTOS) {
    return fail("VALIDATION_ERROR", `Sube de 1 a ${MAX_SPACE_PHOTOS} fotos.`);
  }
  for (const file of files) {
    if (!(file.type in EXTENSIONS)) return fail("VALIDATION_ERROR", "Las fotos deben ser JPG, PNG o WebP.");
    if (file.size > MAX_PHOTO_BYTES) return fail("VALIDATION_ERROR", "Cada foto puede pesar hasta 5 MB.");
  }
  const store = storage ?? (await sessionStorage());
  if ("ok" in store) return store;

  const paths: string[] = [];
  for (const file of files) {
    const path = `${orgId}/${crypto.randomUUID()}.${EXTENSIONS[file.type as SpacePhotoType]}`;
    // ponytail: si falla a la mitad quedan las anteriores sin referencia; limpiar si llega a importar.
    const { error } = await store.upload(path, new Uint8Array(await file.arrayBuffer()), file.type);
    if (error) return fail("STORAGE_ERROR", error);
    paths.push(path);
  }
  return { ok: true, data: paths };
}

/** WHEN el dueño pide fotos de su org THE SYSTEM SHALL devolverlas en base64 con su tipo. */
export async function readSpacePhotos(
  userId: string,
  orgId: string,
  paths: string[],
  storage?: SpaceStorage,
): Promise<{ ok: true; data: { mediaType: SpacePhotoType; data: string }[] } | Failure> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("NOT_FOUND", "No encontrado.");
  const own = new RegExp(`^${orgId}/[0-9a-f-]+\\.(jpg|png|webp)$`);
  if (paths.length > MAX_SPACE_PHOTOS || paths.some((p) => !own.test(p))) {
    return fail("VALIDATION_ERROR", "Alguna foto no pertenece a esta empresa.");
  }
  const store = storage ?? (await sessionStorage());
  if ("ok" in store) return store;

  const photos: { mediaType: SpacePhotoType; data: string }[] = [];
  for (const path of paths) {
    const { data, error } = await store.download(path);
    if (error || !data) return fail("STORAGE_ERROR", error ?? "No se pudo leer la foto.");
    const mediaType = TYPE_BY_EXTENSION[path.slice(path.lastIndexOf(".") + 1)] as SpacePhotoType;
    photos.push({ mediaType, data: Buffer.from(data.bytes).toString("base64") });
  }
  return { ok: true, data: photos };
}
