// Mismo patrón que apps/improvement/lib/env.ts: todo opcional al importar; requireEnv() la exige
// en el momento de usarla. Las llaves de Stripe solo se leen en server/** y app/api/**.
import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STRIPE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().startsWith("sk_").optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().startsWith("whsec_").optional()),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().startsWith("whsec_").optional()),
  NEXT_PUBLIC_SUMMUM_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

export const env = schema.parse(process.env);

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") throw new Error(`${key} no está configurada — ver .env.example`);
  return value as NonNullable<(typeof env)[K]>;
}
