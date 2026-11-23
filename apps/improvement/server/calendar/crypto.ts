// Cifrado AES-256-GCM de refresh tokens (puro, solo node:crypto). La llave entra por parámetro —
// TOKEN_ENCRYPTION_KEY en base64, 32 bytes— y nunca se lee del entorno aquí. Formato:
// `v1.<iv>.<tag>.<cifrado>`, cada parte en base64url. Nunca lanza.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: "BAD_KEY" | "BAD_TOKEN"; message: string } };

const BAD_KEY = { ok: false, error: { code: "BAD_KEY", message: "TOKEN_ENCRYPTION_KEY debe ser de 32 bytes en base64." } } as const;
const BAD_TOKEN = { ok: false, error: { code: "BAD_TOKEN", message: "Token cifrado inválido." } } as const;

function key(keyB64: string): Buffer | null {
  const k = Buffer.from(keyB64, "base64");
  return k.length === 32 ? k : null;
}

export function encryptToken(plain: string, keyB64: string): Result<string> {
  const k = key(keyB64);
  if (!k) return BAD_KEY;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url"));
  return { ok: true, data: `v1.${parts.join(".")}` };
}

export function decryptToken(blob: string, keyB64: string): Result<string> {
  const k = key(keyB64);
  if (!k) return BAD_KEY;
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return BAD_TOKEN;
  try {
    const [iv, tag, enc] = parts.slice(1).map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", k, iv!);
    decipher.setAuthTag(tag!);
    return { ok: true, data: Buffer.concat([decipher.update(enc!), decipher.final()]).toString("utf8") };
  } catch {
    return BAD_TOKEN;
  }
}
