// Paso 1 de oficinas digitales: las seis variables nuevas son opcionales hasta su paso. env.ts valida
// process.env una sola vez al importarse, así que se sigue el patrón de env de §9: stubEnv → resetModules
// → import dinámico.
import { afterEach, describe, expect, it, vi } from "vitest";

const NUEVAS = [
  "AGENTS_API_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_SEATS_WEBHOOK_SECRET",
] as const;

async function cargarEnvSinNuevas() {
  for (const nombre of NUEVAS) vi.stubEnv(nombre, "");
  vi.resetModules();
  return import("@/lib/env.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env de oficinas digitales", () => {
  it("carga sin lanzar con las seis variables vacías y las deja en undefined", async () => {
    const { env } = await cargarEnvSinNuevas();
    for (const nombre of NUEVAS) expect(env[nombre]).toBeUndefined();
  });

  it("requireEnv nombra la variable que falta", async () => {
    const { requireEnv } = await cargarEnvSinNuevas();
    expect(() => requireEnv("AGENTS_API_SECRET")).toThrow("AGENTS_API_SECRET no está configurada");
  });
});
