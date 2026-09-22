// GET  /api/crm/clients?orgId=… — la cartera con su contexto (área, etapa, valor, riesgo).
// POST /api/crm/clients          — registra un contacto, o mueve la etapa de una cuenta.
//
// Dos verbos en una ruta y no dos rutas: las dos operaciones son sobre la misma cuenta y el
// cliente de la pantalla las llama con el mismo `fetch`. Quién puede hacer cada una lo decide el
// módulo de dominio —registrar un contacto lo hace cualquiera del equipo, mover la etapa solo el
// dueño— y no esta ruta, que si lo repitiera sería una segunda regla desincronizable.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import {
  DEAL_STAGES,
  listClientContext,
  registerContact,
  RISK_FACTORS,
  updateClientContext,
} from "@/server/crm/client-extensions";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Inicia sesión." } },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const orgId = z.uuid().safeParse(url.searchParams.get("orgId"));
  if (!orgId.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Falta orgId." } },
      { status: 400 },
    );
  }

  const stage = z.enum(DEAL_STAGES).safeParse(url.searchParams.get("stage"));
  const areaId = url.searchParams.get("areaId");

  const clients = await listClientContext(userId, orgId.data, {
    ...(stage.success ? { stage: stage.data } : {}),
    ...(areaId ? { areaId } : {}),
  });

  return NextResponse.json({ ok: true, data: { clients } });
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contacto"),
    orgId: z.uuid(),
    clientId: z.uuid(),
    note: z.string().trim().min(3).max(1000),
    nextFollowUpAt: z.coerce.date().nullable().optional(),
    healthStatus: z.enum(["healthy", "neutral", "at_risk"]).optional(),
  }),
  z.object({
    action: z.literal("contexto"),
    orgId: z.uuid(),
    clientId: z.uuid(),
    areaId: z.uuid().nullable().optional(),
    dealValue: z.coerce.number().min(0).nullable().optional(),
    dealStage: z.enum(DEAL_STAGES).optional(),
    riskFactors: z.array(z.enum(RISK_FACTORS)).optional(),
    nextFollowUpAt: z.coerce.date().nullable().optional(),
  }),
]);

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Inicia sesión." } },
      { status: 401 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Cuerpo inválido." } },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const result =
    body.action === "contacto"
      ? await registerContact(userId, body.orgId, body.clientId, body)
      : await updateClientContext(userId, body.orgId, body.clientId, body);

  if (!result.ok) {
    const status =
      result.error.code === "FORBIDDEN" ? 403 : result.error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
