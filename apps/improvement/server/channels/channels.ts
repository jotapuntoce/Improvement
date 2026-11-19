// El canal del org: listar, publicar y borrar suave. Se lee y escribe solo si hay fila propia en
// channel_member — la misma regla que la política RLS de canal_rls. Un mensaje nunca se borra:
// se vacía y se marca `deleted_at`, porque Realtime no filtra los DELETE por RLS.
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { agent, channel, channelMember, message, profile } from "@jotapuntoce/db/schema";
import { findMembership } from "../auth/guard.ts";

type Failure = { ok: false; error: { code: "NOT_FOUND" | "VALIDATION_ERROR"; message: string } };
const notFound: Failure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };

export interface ChannelMessage {
  id: string;
  body: string;
  deleted: boolean;
  createdAt: Date;
  authorProfileId: string | null;
  authorAgentId: string | null;
  authorName: string;
}

async function isChannelMember(userId: string, orgId: string, channelId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: channelMember.id })
    .from(channelMember)
    .innerJoin(channel, eq(channel.id, channelMember.channelId))
    .where(and(eq(channelMember.channelId, channelId), eq(channelMember.profileId, userId), eq(channel.orgId, orgId)));
  return Boolean(row);
}

export async function listChannels(userId: string, orgId: string) {
  if (!(await findMembership(userId, orgId))) return notFound;
  const data = await db
    .select({ id: channel.id, kind: channel.kind, name: channel.name, areaId: channel.areaId, agentId: channel.agentId })
    .from(channel)
    .innerJoin(channelMember, and(eq(channelMember.channelId, channel.id), eq(channelMember.profileId, userId)))
    .where(eq(channel.orgId, orgId))
    .orderBy(channel.createdAt);
  return { ok: true as const, data };
}

export async function listMessages(
  userId: string,
  orgId: string,
  channelId: string,
  { before, limit = 50 }: { before?: Date; limit?: number } = {},
): Promise<{ ok: true; data: ChannelMessage[] } | Failure> {
  if (!(await findMembership(userId, orgId))) return notFound;
  if (!(await isChannelMember(userId, orgId, channelId))) return notFound;
  const rows = await db
    .select({
      id: message.id,
      body: message.body,
      deletedAt: message.deletedAt,
      createdAt: message.createdAt,
      authorProfileId: message.authorProfileId,
      authorAgentId: message.authorAgentId,
      fullName: profile.fullName,
      email: profile.email,
      agentName: agent.name,
    })
    .from(message)
    .leftJoin(profile, eq(profile.id, message.authorProfileId))
    .leftJoin(agent, eq(agent.id, message.authorAgentId))
    .where(and(eq(message.channelId, channelId), before ? lt(message.createdAt, before) : undefined))
    .orderBy(desc(message.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  const data = rows.reverse().map((r) => ({
    id: r.id,
    body: r.deletedAt ? "" : r.body,
    deleted: r.deletedAt !== null,
    createdAt: r.createdAt,
    authorProfileId: r.authorProfileId,
    authorAgentId: r.authorAgentId,
    authorName: r.agentName ?? r.fullName ?? r.email ?? "",
  }));
  return { ok: true, data };
}

const bodySchema = z.string().trim().min(1, "Escribe un mensaje.").max(4000, "Máximo 4000 caracteres.");

export async function postMessage(
  userId: string,
  orgId: string,
  channelId: string,
  body: unknown,
): Promise<{ ok: true; data: { id: string } } | Failure> {
  if (!(await findMembership(userId, orgId))) return notFound;
  if (!(await isChannelMember(userId, orgId, channelId))) return notFound;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]!.message } };
  const [row] = await db
    .insert(message)
    .values({ orgId, channelId, authorProfileId: userId, body: parsed.data })
    .returning({ id: message.id });
  return { ok: true, data: { id: row!.id } };
}

/** WHEN el autor o el dueño borran THE SYSTEM SHALL vaciar el mensaje y marcar deleted_at — nunca DELETE. */
export async function deleteMessage(
  userId: string,
  orgId: string,
  messageId: string,
): Promise<{ ok: true; data: { id: string } } | Failure> {
  const m = await findMembership(userId, orgId);
  if (!m) return notFound;
  const [row] = await db
    .select({ authorProfileId: message.authorProfileId })
    .from(message)
    .where(and(eq(message.id, messageId), eq(message.orgId, orgId)));
  if (!row || (row.authorProfileId !== userId && m.role !== "owner")) return notFound;
  await db.update(message).set({ body: "", deletedAt: new Date() }).where(eq(message.id, messageId));
  return { ok: true, data: { id: messageId } };
}

// ─── Internas, sin usuario ──────────────────────────────────────────────────────────────────────
// Solo las llama server/agents/** (el runtime de agentes), que ya decidió en nombre de quién actúa.
// No las importa ninguna ruta ni Server Action.

/** Publica como el agente en un canal de su mismo org. */
export async function postAgentMessage(agentId: string, channelId: string, body: string): Promise<{ id: string } | null> {
  const [target] = await db
    .select({ orgId: channel.orgId })
    .from(channel)
    .innerJoin(agent, and(eq(agent.id, agentId), eq(agent.orgId, channel.orgId)))
    .where(eq(channel.id, channelId));
  if (!target) return null;
  const [row] = await db
    .insert(message)
    .values({ orgId: target.orgId, channelId, authorAgentId: agentId, body: body.trim().slice(0, 4000) || "…" })
    .returning({ id: message.id });
  return row ?? null;
}

/** El canal privado agente ↔ persona, con esa persona como único miembro. Idempotente. */
export async function ensureAgentChannel(agentId: string, profileId: string): Promise<{ id: string } | null> {
  const [a] = await db.select({ orgId: agent.orgId, name: agent.name }).from(agent).where(eq(agent.id, agentId));
  if (!a) return null;
  await db
    .insert(channel)
    .values({ orgId: a.orgId, kind: "agente", agentId, profileId, name: a.name })
    .onConflictDoNothing();
  const [c] = await db
    .select({ id: channel.id })
    .from(channel)
    .where(and(eq(channel.kind, "agente"), eq(channel.agentId, agentId), eq(channel.profileId, profileId)));
  if (!c) return null;
  await db.insert(channelMember).values({ channelId: c.id, profileId }).onConflictDoNothing();
  return c;
}
