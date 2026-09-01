// POST /api/ai/suggestions — exige rol owner (regla de protección de rutas del blueprint §12: el
// gateway limita 10 solicitudes/org/hora, este handler solo agrega el guard de sesión + rol).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMembership } from "@/server/auth/guard";
import { generateSuggestion } from "@/server/ai/gateway";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  category: z.enum(["upgrade", "servicio_cliente"]),
});

const ERROR_STATUS: Record<string, number> = {
  RATE_LIMITED: 429,
  PROVIDER_RATE_LIMIT: 429,
  VALIDATION_ERROR: 422,
  INTERNAL: 500,
};

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Body inválido." } },
      { status: 422 },
    );
  }
  const { orgId, category } = parsed.data;

  const membership = await requireOrgMembership(orgId);
  if (membership.role !== "owner") {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Solo el owner puede generar sugerencias." } },
      { status: 403 },
    );
  }

  const result = await generateSuggestion(orgId, category);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: ERROR_STATUS[result.error.code] ?? 500 },
    );
  }

  return NextResponse.json({ ok: true, data: result.data });
}
