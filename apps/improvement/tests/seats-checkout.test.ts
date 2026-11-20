// Checkout de butacas (oficinas-digitales paso 43): cargo directo con un StripeLike falso que registra
// argumentos, vencimiento igual al apartado, taquilla sin charges_enabled y la ruta pública.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, seatBooking, stripeAccount, venueMap, venueSeat, venueSession } from "@jotapuntoce/db/schema";
import type { StripeLike } from "@/server/stripe/client.ts";

let startSeatCheckout: typeof import("@/server/seats/checkout.ts").startSeatCheckout;
let POST: typeof import("@/app/api/butacas/[sessionId]/apartar/route.ts").POST;
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  vi.resetModules();
  ({ startSeatCheckout } = await import("@/server/seats/checkout.ts"));
  ({ POST } = await import("@/app/api/butacas/[sessionId]/apartar/route.ts"));
});
afterAll(() => vi.unstubAllEnvs());

const orgIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

const NOW = new Date("2030-01-05T18:00:00Z");
const buyer = { name: "Ana", email: "ana@example.com" };

async function funcion(charges: boolean | null) {
  const [o] = await db.insert(organization).values({ name: "t-checkout", slug: `t-checkout-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const accountId = `acct_test_${crypto.randomUUID().slice(0, 8)}`;
  if (charges !== null) await db.insert(stripeAccount).values({ orgId: o.id, stripeAccountId: accountId, chargesEnabled: charges });
  const [map] = await db.insert(venueMap).values({ orgId: o.id, name: "Sala", kind: "teatro", layout: {} }).returning();
  const seats = await db
    .insert(venueSeat)
    .values(Array.from({ length: 11 }, (_, i) => ({ orgId: o.id, mapId: map!.id, label: `A${i + 1}`, x: i, y: 0, kind: "butaca" as const })))
    .returning();
  const [s] = await db
    .insert(venueSession)
    .values({ orgId: o.id, mapId: map!.id, title: "Estreno", startsAt: new Date("2030-02-01T02:00:00Z"), status: "a_la_venta", priceCents: 25000 })
    .returning();
  return { sessionId: s!.id, seat: seats.map((x) => x.id), accountId };
}

function fakeStripe(fail = false) {
  const create = vi.fn(async () => {
    if (fail) throw new Error("stripe caído");
    return { id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" };
  });
  return { stripe: { checkout: { sessions: { create } }, webhooks: {} } as unknown as StripeLike, create };
}

const bookings = (sessionId: string) => db.select().from(seatBooking).where(eq(seatBooking.sessionId, sessionId));

describe("startSeatCheckout", () => {
  it("WHEN el org tiene charges_enabled THE SYSTEM SHALL crear el Checkout en su cuenta, sin comisión y con expires_at = hold_expires_at", async () => {
    const f = await funcion(true);
    const { stripe, create } = fakeStripe();
    const r = await startSeatCheckout({ sessionId: f.sessionId, seatIds: [f.seat[0]!, f.seat[1]!], buyer, now: NOW }, { stripe });
    expect(r).toEqual({ ok: true, data: { url: "https://checkout.stripe.com/c/pay/cs_test_123" } });
    const [params, options] = create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(options).toEqual({ stripeAccount: f.accountId });
    expect(params).not.toHaveProperty("application_fee_amount");
    expect(params).not.toHaveProperty("payment_intent_data");
    expect(params.line_items).toHaveLength(2);
    expect(params.success_url).toBe(`https://app.example.com/butacas/${f.sessionId}?pago=ok`);
    const rows = await bookings(f.sessionId);
    expect(params.expires_at).toBe(Math.floor(rows[0]!.holdExpiresAt!.getTime() / 1000));
    expect(rows.map((b) => b.stripeCheckoutSessionId)).toEqual(["cs_test_123", "cs_test_123"]);
  });

  it("WHEN Stripe lanza un error THE SYSTEM SHALL liberar el apartado y devolver PAYMENT_UNAVAILABLE", async () => {
    const f = await funcion(true);
    const { stripe } = fakeStripe(true);
    expect(await startSeatCheckout({ sessionId: f.sessionId, seatIds: [f.seat[0]!], buyer, now: NOW }, { stripe })).toMatchObject({
      ok: false,
      error: { code: "PAYMENT_UNAVAILABLE" },
    });
    expect((await bookings(f.sessionId)).map((b) => b.status)).toEqual(["released"]);
  });
});

describe("POST /api/butacas/[sessionId]/apartar", () => {
  const call = (sessionId: string, body: unknown) =>
    POST(new Request("https://app.example.com/x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ sessionId }) });

  it("WHEN el org no tiene charges_enabled THE SYSTEM SHALL responder 409 TAQUILLA_ONLY sin apartar", async () => {
    for (const charges of [false, null]) {
      const f = await funcion(charges);
      const res = await call(f.sessionId, { seatIds: [f.seat[0]], ...buyer });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: "TAQUILLA_ONLY" } });
      expect(await bookings(f.sessionId)).toEqual([]);
    }
  });

  it("WHEN la ruta recibe 11 lugares THE SYSTEM SHALL responder 400 sin apartar", async () => {
    const f = await funcion(true);
    const res = await call(f.sessionId, { seatIds: f.seat, ...buyer });
    expect(res.status).toBe(400);
    expect(await bookings(f.sessionId)).toEqual([]);
  });
});
