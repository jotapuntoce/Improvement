// POST /api/butacas/<sessionId>/apartar — público, sin sesión: aparta 1-10 lugares y devuelve la url de
// Checkout. Nada aquí corre en nombre de un usuario; la única autoridad es la función `a_la_venta`.
import { NextResponse } from "next/server";
import { z } from "zod";
import { startSeatCheckout } from "@/server/seats/checkout";

const bodySchema = z.object({
  seatIds: z.array(z.uuid()).min(1).max(10),
  name: z.string().trim().min(1).max(80),
  email: z.email(),
});

const STATUS: Record<string, number> = { SEATS_TAKEN: 409, TAQUILLA_ONLY: 409, VALIDATION_ERROR: 400, NOT_FOUND: 400, PAYMENT_UNAVAILABLE: 503 };

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(sessionId).success) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Revisa los lugares, tu nombre y tu correo." } }, { status: 400 });
  }
  const { seatIds, name, email } = parsed.data;
  const r = await startSeatCheckout({ sessionId, seatIds, buyer: { name, email }, now: new Date() });
  return NextResponse.json(r, { status: r.ok ? 200 : (STATUS[r.error.code] ?? 400) });
}
