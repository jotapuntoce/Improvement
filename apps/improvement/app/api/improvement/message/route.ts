// POST /api/improvement/message — el dueño le escribe a Improvement.
//
// Ruta API y no Server Action porque el chat se va a consumir también desde fuera de la pantalla
// (un widget en la recepción, y mañana un mensaje que llegue por otro canal). Todo lo demás sigue
// la misma regla que el resto de la casa: valida en el borde con zod, resuelve la tenencia con el
// guard antes de tocar datos, y devuelve un resultado tipado, nunca un string lanzado.
//
// El orgId viaja en el cuerpo y no en la ruta: el hilo es del dueño con SU empresa, y el guard lo
// comprueba de todos modos. Una ruta /[org]/api/... no daría ninguna garantía extra — el 404 sale
// del guard, no del segmento.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import { listConversation, sendOwnerMessage } from "@/server/improvement/chat";
import { activeCycle } from "@/server/improvement/motor";

const bodySchema = z.object({
  orgId: z.uuid(),
  message: z.string().trim().min(1).max(4000),
  cycleId: z.uuid().nullable().optional(),
});

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
  const { orgId, message, cycleId } = parsed.data;

  // Si el dueño no dijo de qué ciclo habla, se cuelga del que esté vivo: escribir "ya lo hice"
  // mientras hay una vuelta en curso casi siempre es sobre esa vuelta, y colgarlo de null lo
  // dejaría fuera del contexto que el motor lee en la siguiente fase.
  const vivo = cycleId === undefined ? await activeCycle(userId, orgId) : null;

  const result = await sendOwnerMessage(userId, orgId, {
    content: message,
    cycleId: cycleId ?? vivo?.id ?? null,
  });

  if (!result.ok) {
    const status = result.error.code === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({
    ok: true,
    data: {
      message: result.data,
      // Improvement no contesta en el acto. Lo hace el motor, cuando tiene algo que decir — ver
      // server/improvement/phases.ts. Se devuelve la fase para que la pantalla pueda decir en qué
      // anda en vez de fingir que alguien está escribiendo.
      activePhase: vivo?.phase ?? null,
      activeCycleId: vivo?.id ?? null,
    },
  });
}

/** GET /api/improvement/message?orgId=… — el hilo, lo más reciente primero. */
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

  const cycleId = url.searchParams.get("cycleId");
  const messages = await listConversation(userId, orgId.data, {
    ...(cycleId ? { cycleId } : {}),
  });

  return NextResponse.json({ ok: true, data: { messages } });
}
