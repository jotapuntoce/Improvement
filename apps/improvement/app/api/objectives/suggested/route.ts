// GET  /api/objectives/suggested?orgId=… — lo que Improvement le propuso a ESTA persona.
// POST /api/objectives/suggested      — la acepta, la rechaza o la da por terminada.
//
// Vive bajo /objectives y no bajo /improvement a propósito: para quien la recibe esto es trabajo,
// no un experimento de dirección. El empleado ve la tarea —qué hay que hacer y para qué— y nunca
// el ciclo del que salió (decisión de diseño #1 del plan).
//
// La que se ve marcada como "Sugerida por Improvement" es la de estado `sugerida`: la
// diferenciación visual que pide el plan sale del propio estado, sin un campo extra que pudiera
// contradecirlo.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import {
  completeDelegatedTask,
  listMyDelegatedTasks,
  respondToTask,
} from "@/server/improvement/delegation";

async function sesion() {
  const userId = await getSessionUserId();
  return userId;
}

export async function GET(request: Request) {
  const userId = await sesion();
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

  const todas = url.searchParams.get("todas") === "1";
  const tasks = await listMyDelegatedTasks(userId, orgId.data, !todas);
  return NextResponse.json({ ok: true, data: { tasks } });
}

const accionSchema = z.object({
  orgId: z.uuid(),
  taskId: z.uuid(),
  action: z.enum(["aceptar", "rechazar", "empezar", "completar"]),
  note: z.string().trim().max(1000).optional(),
  quality: z.coerce.number().int().min(1).max(5).optional(),
});

/** Qué estado deja cada acción. Un mapa y no un switch: las cuatro son la misma operación. */
const ESTADO: Record<"aceptar" | "rechazar" | "empezar", "aceptada" | "rechazada" | "en_progreso"> = {
  aceptar: "aceptada",
  rechazar: "rechazada",
  empezar: "en_progreso",
};

export async function POST(request: Request) {
  const userId = await sesion();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Inicia sesión." } },
      { status: 401 },
    );
  }

  const parsed = accionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Cuerpo inválido." } },
      { status: 400 },
    );
  }
  const { orgId, taskId, action, note, quality } = parsed.data;

  const result =
    action === "completar"
      ? await completeDelegatedTask(userId, orgId, taskId, { feedback: note, quality })
      : await respondToTask(userId, orgId, taskId, { status: ESTADO[action], note });

  if (!result.ok) {
    const status = result.error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, data: true });
}
