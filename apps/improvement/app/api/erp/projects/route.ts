// GET  /api/erp/projects?orgId=… — los proyectos con dependencias, riesgo y subtareas contadas.
// POST /api/erp/projects          — agrega una subtarea, la mueve, o declara la coordinación.
//
// `?projectId=` en el GET devuelve además las subtareas de ese proyecto: la pantalla las pide al
// abrir una tarjeta, y una segunda ruta para eso sería un round-trip más por cada clic.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/server/auth/guard";
import {
  addProjectTask,
  listProjectTasks,
  loadProjectGraph,
  moveProjectTask,
  RISK_LEVELS,
  setProjectCoordination,
  TASK_STATUSES,
} from "@/server/erp/projects";

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

  const projectId = url.searchParams.get("projectId");
  const [projects, tasks] = await Promise.all([
    loadProjectGraph(userId, orgId.data),
    projectId ? listProjectTasks(userId, orgId.data, projectId) : Promise.resolve([]),
  ]);

  return NextResponse.json({ ok: true, data: { projects, tasks } });
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("tarea"),
    orgId: z.uuid(),
    projectId: z.uuid(),
    title: z.string().trim().min(3).max(300),
    assignedTo: z.uuid().nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    dueAt: z.coerce.date().nullable().optional(),
    estimatedHours: z.coerce.number().min(0).max(9999).nullable().optional(),
  }),
  z.object({
    action: z.literal("mover"),
    orgId: z.uuid(),
    taskId: z.uuid(),
    status: z.enum(TASK_STATUSES),
    actualHours: z.coerce.number().min(0).max(9999).nullable().optional(),
  }),
  z.object({
    action: z.literal("coordinar"),
    orgId: z.uuid(),
    projectId: z.uuid(),
    dependsOn: z.array(z.uuid()).max(20).optional(),
    risk: z.enum(RISK_LEVELS).optional(),
    leadId: z.uuid().nullable().optional(),
    budget: z.coerce.number().min(0).nullable().optional(),
    spent: z.coerce.number().min(0).nullable().optional(),
    startAt: z.coerce.date().nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
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
  const b = parsed.data;

  const result =
    b.action === "tarea"
      ? await addProjectTask(userId, b.orgId, b.projectId, b)
      : b.action === "mover"
        ? await moveProjectTask(userId, b.orgId, b.taskId, b.status, b.actualHours)
        : await setProjectCoordination(userId, b.orgId, b.projectId, b);

  if (!result.ok) {
    const status =
      result.error.code === "FORBIDDEN" ? 403 : result.error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
