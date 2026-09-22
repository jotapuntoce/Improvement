// POST /api/director — la burbuja. Dos acciones sobre el mismo Director.
//
//  · "preguntar" → mira la empresa y contesta; puede devolver un panel al que llevarte y acciones
//                  preparadas, que NO se ejecutaron.
//  · "ejecutar"  → corre una de esas acciones, ya confirmada por quien la ve.
//
// Van juntas y no en dos rutas porque son las dos mitades de un mismo gesto, y la pantalla las
// llama con el mismo fetch. Quién puede hacer qué NO se decide aquí: lo decide la función de
// server/** que cada herramienta envuelve, igual que cuando la llama una pantalla. Por eso da lo
// mismo que el navegador mande una acción que el modelo nunca propuso — recibe el mismo no.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import { loadBurbujaCtx } from "@/server/ai/burbujaContext";
import { askDirector, historiaSchema, runAccion } from "@/server/ai/conversation";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preguntar"),
    orgId: z.uuid(),
    /** En qué pantalla está parado, para que "esto" y "aquí" tengan referente. */
    panel: z.string().trim().max(60).default("recepción"),
    pregunta: z.string().trim().min(1).max(2000),
    historia: historiaSchema,
  }),
  z.object({
    action: z.literal("ejecutar"),
    orgId: z.uuid(),
    tool: z.string().trim().min(1).max(60),
    input: z.unknown(),
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

  const ctx = await loadBurbujaCtx(userId, body.orgId);
  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Esa empresa no es tuya." } },
      { status: 404 },
    );
  }
  const base = { userId, orgId: body.orgId, esDueno: ctx.esDueno };

  if (body.action === "ejecutar") {
    const r = await runAccion(base, body.tool, body.input);
    return NextResponse.json(r, { status: r.ok ? 200 : estado(r.error.code) });
  }

  const r = await askDirector(
    {
      ...base,
      nombre: ctx.nombre,
      empresa: ctx.empresa,
      panel: body.panel,
      inventario: ctx.inventario,
      ownerBrief: ctx.ownerBrief,
      relacion: ctx.relacion,
    },
    body.historia,
    body.pregunta,
  );
  return NextResponse.json(r, { status: r.ok ? 200 : estado(r.error.code) });
}

function estado(code: string): number {
  if (code === "FORBIDDEN") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "RATE_LIMITED" || code === "PROVIDER_RATE_LIMIT") return 429;
  // Falta una variable de entorno: el problema es del servidor, no de lo que mandó el navegador.
  // Con 400 se vería como "escribiste algo mal" y se buscaría en el lugar equivocado.
  if (code === "CONFIG_ERROR") return 503;
  return 400;
}
