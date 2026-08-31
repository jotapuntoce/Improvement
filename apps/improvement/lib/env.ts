// Validación de variables de entorno con zod — TODAS opcionales aquí a propósito: cada variable se
// vuelve requerida solo desde el paso que la activa (ver blueprint §10, columna "Required by step"),
// nunca todas a la vez. Importar este archivo antes de que exista, por ejemplo, ANTHROPIC_API_KEY
// (paso 11) nunca debe lanzar — ese es exactamente el criterio de aceptación de este paso (4).
// La feature que sí necesita una variable llama requireEnv() en el momento de usarla, con un error
// claro si falta — así el "requerida desde el paso N" se aplica en código, no solo en un comentario.
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  // SUPABASE_SERVICE_ROLE_KEY es exclusiva de apps/admin (paso 5) — nunca se lee desde
  // apps/improvement, pero se declara aquí también para que un grep de "toda variable documentada
  // en .env.example" encuentre una fila por variable, no para usarla.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(), // paso 11 — gateway de IA
  RESEND_API_KEY: z.string().min(1).optional(), // paso 9 — recordatorios por email
  CRON_SECRET: z.string().min(1).optional(), // paso 9 — valida el bearer del cron de Vercel
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export const env = schema.parse(process.env);

/**
 * Lee una variable ya validada por el esquema de arriba y lanza un error claro si aún no está
 * configurada — el punto donde "requerida desde el paso N" se vuelve real en tiempo de ejecución,
 * en vez de en todo el proceso al arrancar.
 */
export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(`${key} no está configurada — ver .env.example (blueprint §10)`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
