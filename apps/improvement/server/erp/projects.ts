// Proyectos/obra (blueprint summum-improvement, E1-T2): autorización del dueño, responsable y etapas
// con avance ponderado. server/projects/mutations.ts sigue siendo el camino manual del avance: cuando
// un proyecto tiene etapas, su `progress` lo escribe este archivo; sin etapas, se queda como esté.
//
// Los proyectos los lee cualquier miembro (misma decisión que la política RLS de 0020); escribir es
// del dueño, salvo el avance de una etapa, que también puede moverlo el responsable del proyecto.
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { client, profile, project, projectStage, STAGE_STATUSES } from "@jotapuntoce/db/schema";
import { assertMembership, findMembership, findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type StageRow = typeof projectStage.$inferSelect;

export interface ProjectBoardItem {
  id: string;
  name: string;
  status: string;
  progress: number;
  authorizationStatus: string;
  clientName: string | null;
  ownerProfileId: string | null;
  ownerName: string | null;
  dueAt: Date | null;
  stages: StageRow[];
}

export interface ProjectBoard {
  canManage: boolean;
  projects: ProjectBoardItem[];
}

const isUuid = (id: unknown): id is string => z.uuid().safeParse(id).success;

const addStageSchema = z.object({
  name: z.string().trim().min(2, "El nombre de la etapa lleva al menos 2 letras.").max(120),
  weight: z.coerce.number().int().min(1).max(100).default(1),
});

const updateStageSchema = z.object({
  progress: z.coerce.number().int().min(0).max(100),
  status: z.enum(STAGE_STATUSES),
});

/** Promedio de avance ponderado por peso, redondeado. `null` sin etapas: no hay nada que promediar. */
export function stageWeightedProgress(stages: { weight: number; progress: number }[]): number | null {
  if (stages.length === 0) return null;
  const totalWeight = stages.reduce((sum, s) => sum + s.weight, 0);
  return Math.round(stages.reduce((sum, s) => sum + s.weight * s.progress, 0) / totalWeight);
}

async function findProject(orgId: string, projectId: unknown) {
  if (!isUuid(projectId)) return null;
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.orgId, orgId)));
  return row ?? null;
}

async function findStage(orgId: string, stageId: unknown) {
  if (!isUuid(stageId)) return null;
  const [row] = await db
    .select()
    .from(projectStage)
    .where(and(eq(projectStage.id, stageId), eq(projectStage.orgId, orgId)));
  return row ?? null;
}

/** Recalcula el avance del proyecto desde sus etapas, en la misma transacción que las movió. */
async function syncProgress(tx: Tx, orgId: string, projectId: string) {
  const stages = await tx
    .select({ weight: projectStage.weight, progress: projectStage.progress })
    .from(projectStage)
    .where(and(eq(projectStage.projectId, projectId), eq(projectStage.orgId, orgId)));
  const progress = stageWeightedProgress(stages);
  if (progress === null) return;
  await tx
    .update(project)
    .set({ progress, updatedAt: new Date() })
    .where(and(eq(project.id, projectId), eq(project.orgId, orgId)));
}

/** Todos los proyectos del org con sus etapas en orden. `assertMembership` lanza 404 a un ajeno. */
export async function loadProjectBoard(userId: string, orgId: string): Promise<ProjectBoard> {
  const me = await assertMembership(userId, orgId);

  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      progress: project.progress,
      authorizationStatus: project.authorizationStatus,
      clientName: client.name,
      ownerProfileId: project.ownerProfileId,
      ownerName: profile.fullName,
      dueAt: project.dueAt,
    })
    .from(project)
    .leftJoin(client, eq(client.id, project.clientId))
    .leftJoin(profile, eq(profile.id, project.ownerProfileId))
    .where(eq(project.orgId, orgId))
    .orderBy(asc(project.createdAt));

  const stages = rows.length
    ? await db
        .select()
        .from(projectStage)
        .where(and(eq(projectStage.orgId, orgId), inArray(projectStage.projectId, rows.map((r) => r.id))))
        .orderBy(asc(projectStage.position), asc(projectStage.createdAt))
    : [];

  return {
    canManage: me.role === "owner",
    projects: rows.map((r) => ({ ...r, stages: stages.filter((s) => s.projectId === r.id) })),
  };
}

/** El dueño autoriza o rechaza un proyecto, una sola vez: solo desde `pendiente`. */
export async function authorizeProject(
  userId: string,
  orgId: string,
  projectId: string,
  decision: unknown,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño autoriza proyectos.", "FORBIDDEN");
  const parsed = z.enum(["autorizado", "rechazado"]).safeParse(decision);
  if (!parsed.success) return fail("La decisión es autorizar o rechazar.");
  const row = await findProject(orgId, projectId);
  if (!row) return fail("Ese proyecto no existe en esta empresa.", "NOT_FOUND");
  if (row.authorizationStatus !== "pendiente") {
    return fail("Ese proyecto ya tiene una decisión.", "INVALID_TRANSITION");
  }

  await db
    .update(project)
    .set({ authorizationStatus: parsed.data, authorizedBy: userId, authorizedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(project.id, row.id), eq(project.orgId, orgId)));
  return { ok: true, data: true };
}

/** El dueño nombra al responsable del proyecto (o lo quita con `null`). Debe ser miembro del org. */
export async function setProjectOwner(
  userId: string,
  orgId: string,
  projectId: string,
  ownerProfileId: string | null,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño asigna responsables.", "FORBIDDEN");
  const row = await findProject(orgId, projectId);
  if (!row) return fail("Ese proyecto no existe en esta empresa.", "NOT_FOUND");
  if (ownerProfileId && !(isUuid(ownerProfileId) && (await findMembership(ownerProfileId, orgId)))) {
    return fail("El responsable no es parte de esta empresa.", "NOT_FOUND");
  }

  await db
    .update(project)
    .set({ ownerProfileId, updatedAt: new Date() })
    .where(and(eq(project.id, row.id), eq(project.orgId, orgId)));
  return { ok: true, data: true };
}

/** El dueño agrega una etapa al final del proyecto. */
export async function addStage(
  userId: string,
  orgId: string,
  projectId: string,
  input: unknown,
): Promise<Result<StageRow>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño arma las etapas.", "FORBIDDEN");
  const parsed = addStageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const row = await findProject(orgId, projectId);
  if (!row) return fail("Ese proyecto no existe en esta empresa.", "NOT_FOUND");

  const stage = await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ position: max(projectStage.position) })
      .from(projectStage)
      .where(eq(projectStage.projectId, row.id));
    const [inserted] = await tx
      .insert(projectStage)
      .values({
        orgId,
        projectId: row.id,
        name: parsed.data.name,
        weight: parsed.data.weight,
        position: last?.position == null ? 0 : last.position + 1,
      })
      .returning();
    await syncProgress(tx, orgId, row.id);
    return inserted;
  });

  if (!stage) return fail("No se pudo guardar la etapa.", "DB_ERROR");
  return { ok: true, data: stage };
}

/** Mueve el avance de una etapa. Lo puede hacer el dueño o el responsable de ese proyecto. */
export async function updateStage(
  userId: string,
  orgId: string,
  stageId: string,
  input: unknown,
): Promise<Result<true>> {
  const me = await assertMembership(userId, orgId);
  const parsed = updateStageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const stage = await findStage(orgId, stageId);
  if (!stage) return fail("Esa etapa no existe en esta empresa.", "NOT_FOUND");
  const parent = await findProject(orgId, stage.projectId);
  if (!parent) return fail("Ese proyecto no existe en esta empresa.", "NOT_FOUND");
  if (me.role !== "owner" && parent.ownerProfileId !== userId) {
    return fail("Solo el dueño o el responsable mueven el avance.", "FORBIDDEN");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(projectStage)
      .set({ progress: parsed.data.progress, status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(projectStage.id, stage.id), eq(projectStage.orgId, orgId)));
    await syncProgress(tx, orgId, parent.id);
  });
  return { ok: true, data: true };
}

/** El dueño quita una etapa. Si era la última, el avance manual del proyecto se queda como estaba. */
export async function removeStage(userId: string, orgId: string, stageId: string): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño arma las etapas.", "FORBIDDEN");
  const stage = await findStage(orgId, stageId);
  if (!stage) return fail("Esa etapa no existe en esta empresa.", "NOT_FOUND");

  await db.transaction(async (tx) => {
    await tx.delete(projectStage).where(and(eq(projectStage.id, stage.id), eq(projectStage.orgId, orgId)));
    await syncProgress(tx, orgId, stage.projectId);
  });
  return { ok: true, data: true };
}
