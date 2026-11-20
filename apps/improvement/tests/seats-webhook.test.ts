// Webhook de butacas (oficinas-digitales paso 44): payloads firmados con generateTestHeaderString contra la ruta,
// pago tardío, expiración y el barrido de la tarea `butacas`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, seatBooking, stripeAccount, venueMap, venueSeat, venueSession } from "@jotapuntoce/db/schema";

const SECRET = "whsec_prueba_butacas";
let POST: typeof import("@/app/api/stripe/butacas/route.ts").POST;
let holdSeats: typeof import("@/server/seats/hold.ts").holdSeats;
let runTarea: typeof import("@/server/agents/runtime.ts").runTarea;
let sign: (payload: string, secret?: string) => string;
beforeAll(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_inventada_123");
  vi.stubEnv("STRIPE_SEATS_WEBHOOK_SECRET", SECRET);
  vi.resetModules();
  ({ POST } = await import("@/app/api/stripe/butacas/route.ts"));
  ({ holdSeats } = await import("@/server/seats/hold.ts"));
  ({ runTarea } = await import("@/server/agents/runtime.ts"));
  const { getStripe } = await import("@/server/stripe/client.ts");
  sign = (payload, secret = SECRET) => getStripe().webhooks.generateTestHeaderString({ payload, secret });
});
afterAll(() => vi.unstubAllEnvs());

const orgIds: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

const NOW = new Date("2030-01-05T18:00:00Z");
const min = (m: number, from = NOW) => new Date(from.getTime() + m * 60_000);

async function funcion() {
  const [o] = await db.insert(organization).values({ name: "t-webhook", slug: `t-webhook-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const account = `acct_test_${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(stripeAccount).values({ orgId: o.id, stripeAccountId: account, chargesEnabled: true });
  const [map] = await db.insert(venueMap).values({ orgId: o.id, name: "Sala", kind: "teatro", layout: {} }).returning();
  const seats = await db
    .insert(venueSeat)
    .values([1, 2].map((i) => ({ orgId: o.id, mapId: map!.id, label: `A${i}`, x: i, y: 0, kind: "butaca" as const })))
    .returning();
  const [s] = await db
    .insert(venueSession)
    .values({ orgId: o.id, mapId: map!.id, title: "F", startsAt: min(6000), status: "a_la_venta", priceCents: 10000 })
    .returning();
  return { sessionId: s!.id, seat: seats.map((x) => x.id), account };
}

async function apartar(sessionId: string, seatIds: string[], now = NOW) {
  const r = await holdSeats({ sessionId, seatIds, channel: "web", now });
  if (!r.ok) throw new Error(r.error.message);
  return r.data.holdToken;
}

function evento(type: string, account: string, created: Date, metadata: Record<string, string>) {
  return JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    object: "event",
    type,
    account,
    created: Math.floor(created.getTime() / 1000),
    data: { object: { id: "cs_test_456", object: "checkout.session", metadata, customer_details: { name: "Ana Compra", email: "ana@example.com" } } },
  });
}

const post = (payload: string, signature = sign(payload)) =>
  POST(new Request("https://app.example.com/api/stripe/butacas", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
const bookings = (sessionId: string) => db.select().from(seatBooking).where(eq(seatBooking.sessionId, sessionId));

describe("POST /api/stripe/butacas", () => {
  it("WHEN llega checkout.session.completed firmado de un apartado vigente THE SYSTEM SHALL marcar sold con nombre y correo", async () => {
    const f = await funcion();
    const token = await apartar(f.sessionId, f.seat);
    const res = await post(evento("checkout.session.completed", f.account, min(5), { hold_token: token, venue_session_id: f.sessionId, seat_count: "2" }));
    expect(res.status).toBe(200);
    expect((await bookings(f.sessionId)).map((b) => [b.status, b.buyerName, b.buyerEmail])).toEqual([
      ["sold", "Ana Compra", "ana@example.com"],
      ["sold", "Ana Compra", "ana@example.com"],
    ]);
  });

  it("WHEN la firma no es válida THE SYSTEM SHALL responder 400 sin escribir", async () => {
    const f = await funcion();
    const token = await apartar(f.sessionId, f.seat);
    const payload = evento("checkout.session.completed", f.account, min(5), { hold_token: token, venue_session_id: f.sessionId, seat_count: "2" });
    expect((await post(payload, sign(payload, "whsec_otro"))).status).toBe(400);
    expect((await bookings(f.sessionId)).map((b) => b.status)).toEqual(["held", "held"]);
  });

  it("WHEN otro comprador ya re-apartó un lugar THE SYSTEM SHALL dejar su apartado intacto y registrar seat_paid_after_expiry", async () => {
    const f = await funcion();
    const viejo = await apartar(f.sessionId, f.seat);
    const nuevo = await apartar(f.sessionId, [f.seat[0]!], min(40)); // el viejo venció a los 31 min
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Pagó a tiempo (minuto 20) pero el webhook llega tarde.
    await post(evento("checkout.session.completed", f.account, min(20), { hold_token: viejo, venue_session_id: f.sessionId, seat_count: "2" }));
    expect(warn).toHaveBeenCalledWith("seat_paid_after_expiry", expect.objectContaining({ checkoutSessionId: "cs_test_456" }));
    const rows = await bookings(f.sessionId);
    expect(rows.find((b) => b.seatId === f.seat[0])).toMatchObject({ status: "held", holdToken: nuevo });
    expect(rows.find((b) => b.seatId === f.seat[1])).toMatchObject({ status: "held", holdToken: viejo });
  });

  it("WHEN llega checkout.session.expired THE SYSTEM SHALL liberar los lugares del apartado", async () => {
    const f = await funcion();
    const token = await apartar(f.sessionId, f.seat);
    await post(evento("checkout.session.expired", f.account, min(31), { hold_token: token, venue_session_id: f.sessionId, seat_count: "2" }));
    expect((await bookings(f.sessionId)).map((b) => b.status)).toEqual(["released", "released"]);
  });
});

describe("runTarea(butacas)", () => {
  it("WHEN hay un apartado vencido hace 11 minutos THE SYSTEM SHALL liberarlo y devolver procesadas 1", async () => {
    // Fecha remota: el barrido es global y ningún otro apartado de la base venció antes de ella.
    const now = new Date("2001-01-01T00:00:00Z");
    const f = await funcion();
    await apartar(f.sessionId, [f.seat[0]!], min(-42, now));
    expect(await runTarea("butacas", now)).toEqual({ procesadas: 1 });
    expect((await bookings(f.sessionId)).map((b) => b.status)).toEqual(["released"]);
  });
});
