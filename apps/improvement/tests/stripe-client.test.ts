// getStripe(): exige STRIPE_SECRET_KEY al usarse y arma el cliente sin red. Patrón de env de §9.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function load(key: string) {
  vi.stubEnv("STRIPE_SECRET_KEY", key);
  vi.resetModules();
  return import("@/server/stripe/client.ts");
}

describe("getStripe", () => {
  it("WHEN falta STRIPE_SECRET_KEY THE SYSTEM SHALL lanzar con el nombre de la variable", async () => {
    const { getStripe } = await load("");
    expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY no está configurada");
  });

  it("WHEN hay una llave de prueba THE SYSTEM SHALL devolver checkout y webhooks sin tocar la red", async () => {
    const { getStripe } = await load("sk_test_inventada_123");
    const stripe = getStripe();
    expect(typeof stripe.checkout.sessions.create).toBe("function");
    expect(typeof stripe.webhooks.constructEvent).toBe("function");
  });
});
