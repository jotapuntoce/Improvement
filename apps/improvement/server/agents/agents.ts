// Los agentes de un org: Improvement (manager y agente del dueño), la Recepción (única entrada) y un
// especialista por jefe de área. Todo se deriva de los datos (seat, area, membership); idempotente.
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { agent, area, channel, channelMember, membership, seat } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { areaHeads } from "./heads.ts";

type AgentRow = typeof agent.$inferSelect;
type Failure = { ok: false; error: { code: "NOT_FOUND" | "VALIDATION_ERROR"; message: string } };
const notFound: Failure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };

export async function ensureAgents(userId: string, orgId: string): Promise<{ ok: true; data: AgentRow[] } | Failure> {
  const owner = await findOwnerMembership(userId, orgId);
  if (!owner) return notFound;

  const data = await db.transaction(async (tx) => {
    const [seats, areas, existing] = await Promise.all([
      tx
        .select({
          id: seat.id,
          areaId: seat.areaId,
          parentSeatId: seat.parentSeatId,
          holderProfileId: seat.holderProfileId,
          position: seat.position,
          title: seat.title,
        })
        .from(seat)
        .where(eq(seat.orgId, orgId)),
      tx.select({ id: area.id, name: area.name }).from(area).where(eq(area.orgId, orgId)),
      tx.select().from(agent).where(eq(agent.orgId, orgId)),
    ]);

    // Cada consulta es un viaje a la base: lo que falta se inserta en un solo lote.
    const nuevos: (typeof agent.$inferInsert)[] = [];
    if (!existing.some((a) => a.kind === "manager")) {
      nuevos.push({ orgId, kind: "manager", ownerProfileId: owner.userId, name: "Improvement" });
    }
    if (!existing.some((a) => a.kind === "recepcion")) {
      nuevos.push({ orgId, kind: "recepcion", ownerProfileId: owner.userId, name: "Recepción" });
    }

    const heads = areaHeads(seats);
    for (const a of areas) {
      const head = heads.get(a.id);
      if (!head) continue;
      const name = `Especialista de ${a.name}`;
      const current = existing.find((x) => x.kind === "especialista" && x.areaId === a.id);
      if (!current) {
        nuevos.push({ orgId, kind: "especialista", areaId: a.id, ownerProfileId: head, name });
      } else if (current.ownerProfileId !== head || current.name !== name) {
        await tx.update(agent).set({ ownerProfileId: head, name, updatedAt: new Date() }).where(eq(agent.id, current.id));
      }
    }
    if (nuevos.length) await tx.insert(agent).values(nuevos);
    const conJefe = [...heads.keys()];
    await tx
      .delete(agent)
      .where(
        and(
          eq(agent.orgId, orgId),
          eq(agent.kind, "especialista"),
          conJefe.length ? notInArray(agent.areaId, conJefe) : undefined,
        ),
      );

    // El general es único por org (uq_channel_org_general): si ya existe, el insert no hace nada.
    await tx.insert(channel).values({ orgId, kind: "general", name: "General" }).onConflictDoNothing();
    // Toda membresía del org que falte, en un solo viaje (insert … select de Drizzle exige todas las columnas).
    await tx.execute(sql`
      insert into ${channelMember} (${sql.identifier(channelMember.channelId.name)}, ${sql.identifier(channelMember.profileId.name)})
      select ${channel.id}, ${membership.userId}
      from ${channel} join ${membership} on ${membership.orgId} = ${channel.orgId}
      where ${channel.orgId} = ${orgId} and ${channel.kind} = 'general'
      on conflict do nothing`);

    return tx.select().from(agent).where(eq(agent.orgId, orgId));
  });
  return { ok: true, data };
}

export async function listAgents(userId: string, orgId: string): Promise<AgentRow[] | null> {
  if (!(await findOwnerMembership(userId, orgId))) return null;
  return db.select().from(agent).where(eq(agent.orgId, orgId));
}

const agentInputSchema = z.object({
  instructions: z.string().max(4000),
  skills: z.array(z.string().trim().min(1).max(60)).max(20),
});

export async function updateAgent(
  userId: string,
  orgId: string,
  agentId: string,
  input: unknown,
): Promise<{ ok: true; data: AgentRow } | Failure> {
  if (!(await findOwnerMembership(userId, orgId))) return notFound;
  const parsed = agentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." } };
  }
  const [row] = await db
    .update(agent)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(agent.id, agentId), eq(agent.orgId, orgId)))
    .returning();
  return row ? { ok: true, data: row } : notFound;
}
