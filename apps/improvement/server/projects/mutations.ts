// Los proyectos vivos de la empresa: lo que su equipo está sacando adelante ahora mismo.
//
// Es lo que se ve en la pantalla de la computadora del mostrador, en la recepción. No es la lista
// de objetivos (esos son metas con puntos que alguien cobra al completarlas) ni los Planos de Jose
// Carlos: es la cartera de trabajo del cliente, lo que contesta "¿en qué anda la empresa?".
//
// Los lee cualquiera que trabaje en la empresa, no solo el dueño — misma decisión que la política
// RLS de 0020. El trabajo en curso es información compartida; el diagnóstico (org_need) no.
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, client, project } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";
import { belongsToOrg } from "../db/belongsToOrg.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export const PROJECT_STATUSES = ["activo", "pausado", "terminado"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  activo: "En curso",
  pausado: "En pausa",
  terminado: "Entregado",
};

export type ProjectRow = typeof project.$inferSelect;

export interface ProjectCard {
  id: string;
  name: string;
  detail: string | null;
  status: ProjectStatus;
  progress: number;
  areaName: string | null;
  areaColor: string | null;
  clientName: string | null;
  dueAt: Date | null;
}

const projectSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre del proyecto."),
  detail: z.string().trim().max(2000).nullable(),
  areaId: z.uuid().nullable(),
  clientId: z.uuid().nullable(),
  status: z.enum(PROJECT_STATUSES),
  progress: z.coerce.number().int().min(0).max(100),
});

/**
 * Los proyectos de la empresa, los que van más adelantados arriba.
 *
 * El alcance se resuelve ADENTRO, como todo loader de la casa: `assertMembership` lanza 404 a quien
 * no es de esta empresa, así que la pantalla nunca tiene que acordarse de filtrar.
 *
 * `soloActivos` es el default porque la pantalla del mostrador enseña en qué anda la empresa hoy,
 * no su historial. Un proyecto entregado no desaparece: deja de estar en la pantalla.
 */
export async function listProjects(
  userId: string,
  orgId: string,
  soloActivos = true,
): Promise<ProjectCard[]> {
  await assertMembership(userId, orgId);

  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      detail: project.detail,
      status: project.status,
      progress: project.progress,
      dueAt: project.dueAt,
      areaName: area.name,
      areaColor: area.color,
      clientName: client.name,
    })
    .from(project)
    .leftJoin(area, eq(area.id, project.areaId))
    .leftJoin(client, eq(client.id, project.clientId))
    .where(
      soloActivos
        ? and(eq(project.orgId, orgId), eq(project.status, "activo"))
        : eq(project.orgId, orgId),
    )
    .orderBy(desc(project.progress), asc(project.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    detail: r.detail,
    status: r.status as ProjectStatus,
    progress: r.progress,
    areaName: r.areaName,
    areaColor: r.areaColor,
    clientName: r.clientName,
    dueAt: r.dueAt,
  }));
}

/**
 * Da de alta un proyecto. Solo el dueño: decidir en qué se mete la empresa no es una decisión que
 * pueda tomar cualquier empleado con sesión.
 *
 * El área y el cliente se validan contra ESTA empresa antes de escribir — un id de otra empresa en
 * el formulario no puede acabar en la fila (mismo patrón que createObjective).
 */
export async function createProject(
  userId: string,
  orgId: string,
  input: unknown,
): Promise<Result<ProjectRow>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño da de alta proyectos.", "FORBIDDEN");
  }

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const data = parsed.data;

  if (data.areaId && !(await belongsToOrg(area, data.areaId, orgId))) {
    return fail("Esa área no es de esta empresa.");
  }
  if (data.clientId && !(await belongsToOrg(client, data.clientId, orgId))) {
    return fail("Ese cliente no es de esta empresa.");
  }

  const [row] = await db
    .insert(project)
    .values({
      orgId,
      name: data.name,
      detail: data.detail,
      areaId: data.areaId,
      clientId: data.clientId,
      status: data.status,
      progress: data.progress,
    })
    .returning();

  if (!row) return fail("No se pudo guardar el proyecto.", "DB_ERROR");
  return { ok: true, data: row };
}
