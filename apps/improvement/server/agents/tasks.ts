// Recepción única de encargos: todo encargo entra aquí y se rutea al especialista del área o al manager.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { agent, agentTask, area, message } from "@jotapuntoce/db/schema";
import { findMembership } from "../auth/guard.ts";
import { ensureAgentChannel } from "../channels/channels.ts";

type Failure = { ok: false; error: { code: "NOT_FOUND" | "VALIDATION_ERROR" | "NOT_READY"; message: string } };
const notFound: Failure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };

interface RoutableAgent {
  id: string;
  kind: string;
  areaId: string | null;
}

/** El especialista del área si existe; si no, el manager; sin manager, null. */
export function routeEncargo<A extends RoutableAgent>(agents: readonly A[], areaId?: string | null): A | null {
  const especialista = areaId ? agents.find((a) => a.kind === "especialista" && a.areaId === areaId) : undefined;
  return especialista ?? agents.find((a) => a.kind === "manager") ?? null;
}

const encargoSchema = z.object({
  body: z.string().trim().min(1, "Escribe el encargo.").max(2000, "Máximo 2000 caracteres."),
  areaId: z.string().uuid().optional(),
});

export async function createEncargo(
  userId: string,
  orgId: string,
  input: unknown,
): Promise<{ ok: true; data: { id: string } } | Failure> {
  if (!(await findMembership(userId, orgId))) return notFound;
  const parsed = encargoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]!.message } };
  const { body, areaId } = parsed.data;

  const [agents, areaRows] = await Promise.all([
    db.select({ id: agent.id, kind: agent.kind, areaId: agent.areaId, name: agent.name }).from(agent).where(eq(agent.orgId, orgId)),
    areaId ? db.select({ id: area.id }).from(area).where(and(eq(area.id, areaId), eq(area.orgId, orgId))) : Promise.resolve([]),
  ]);
  if (areaId && !areaRows.length) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Esa área no es de esta empresa." } };
  const asignado = routeEncargo(agents, areaId);
  if (!asignado) return { ok: false, error: { code: "NOT_READY", message: "El dueño aún no activa los agentes." } };
  const recepcion = agents.find((a) => a.kind === "recepcion") ?? asignado;

  const id = await db.transaction(async (tx) => {
    const canal = await ensureAgentChannel(asignado.id, userId, tx);
    if (!canal) throw new Error("No se pudo abrir el canal del agente.");
    const [task] = await tx
      .insert(agentTask)
      .values({ orgId, agentId: asignado.id, requestedBy: userId, areaId: areaId ?? null, channelId: canal.id, body, status: "asignado" })
      .returning({ id: agentTask.id });
    // Mismo now() dentro de la transacción: horas explícitas para que el orden del canal sea el de la conversación.
    const t = Date.now();
    await tx.insert(message).values([
      { orgId, channelId: canal.id, authorProfileId: userId, body, createdAt: new Date(t) },
      { orgId, channelId: canal.id, authorAgentId: recepcion.id, body: `Recibido. Lo atiende ${asignado.name}.`, createdAt: new Date(t + 1) },
    ]);
    return task!.id;
  });
  return { ok: true, data: { id } };
}

/** Los encargos propios; el dueño ve todos los del org. */
export async function listEncargos(userId: string, orgId: string) {
  const m = await findMembership(userId, orgId);
  if (!m) return notFound;
  const data = await db
    .select()
    .from(agentTask)
    .where(and(eq(agentTask.orgId, orgId), m.role === "owner" ? undefined : eq(agentTask.requestedBy, userId)))
    .orderBy(desc(agentTask.createdAt));
  return { ok: true as const, data };
}
