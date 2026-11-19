// POST /api/agentes/<tarea> — lo llama el worker de apps/agentes. Sin sesión de usuario: la única
// autorización es el bearer AGENTS_API_SECRET; nunca requireOrgMembership, esto no corre en nombre de nadie.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isAuthorizedBearer, runTarea } from "@/server/agents/runtime";
import { TAREAS, type Tarea } from "@/server/agents/tareas";

export async function POST(request: Request, { params }: { params: Promise<{ tarea: string }> }) {
  if (!isAuthorizedBearer(request.headers.get("authorization"), env.AGENTS_API_SECRET)) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } }, { status: 401 });
  }
  const { tarea } = await params;
  if (!(TAREAS as readonly string[]).includes(tarea)) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Tarea desconocida." } }, { status: 404 });
  }
  const data = await runTarea(tarea as Tarea, new Date());
  return NextResponse.json({ ok: true, data });
}
