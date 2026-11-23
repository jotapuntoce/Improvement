// Canal del org (oficinas-digitales paso 18) contra la base de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { agent, channel, channelMember, membership, message, organization, profile } from "@jotapuntoce/db/schema";
import { deleteMessage, ensureAgentChannel, listMessages, postMessage } from "../server/channels/channels.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function orgConCanal() {
  const [org] = await db.insert(organization).values({ name: "t-channels", slug: `t-channels-${crypto.randomUUID()}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ids = { owner: crypto.randomUUID(), miembro: crypto.randomUUID(), otro: crypto.randomUUID(), fuera: crypto.randomUUID() };
  const entries = Object.entries(ids);
  await db.insert(profile).values(entries.map(([k, id]) => ({ id, email: `${id}@example.com`, fullName: k })));
  profileIds.push(...Object.values(ids));
  await db
    .insert(membership)
    .values(entries.map(([k, id]) => ({ userId: id, orgId: org.id, role: k === "owner" ? "owner" : "employee", acceptedAt: new Date() })));
  const [c] = await db.insert(channel).values({ orgId: org.id, kind: "general", name: "General" }).returning();
  await db.insert(channelMember).values([ids.owner, ids.miembro, ids.otro].map((profileId) => ({ channelId: c!.id, profileId })));
  return { orgId: org.id, channelId: c!.id, ...ids };
}

describe("canal", () => {
  it("WHEN un miembro publica y lista THE SYSTEM SHALL devolver su mensaje con su autor", async () => {
    const { orgId, channelId, miembro } = await orgConCanal();
    expect((await postMessage(miembro, orgId, channelId, "  Hola equipo  ")).ok).toBe(true);
    const res = await listMessages(miembro, orgId, channelId);
    expect(res).toMatchObject({ ok: true, data: [{ body: "Hola equipo", authorProfileId: miembro, authorName: "miembro", deleted: false }] });
  });

  it("WHEN un empleado no miembro lista o publica THE SYSTEM SHALL dar NOT_FOUND sin escribir", async () => {
    const { orgId, channelId, fuera } = await orgConCanal();
    expect(await listMessages(fuera, orgId, channelId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await postMessage(fuera, orgId, channelId, "hola")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.select().from(message).where(eq(message.channelId, channelId))).toHaveLength(0);
  });

  it("WHEN el autor borra THE SYSTEM SHALL conservar la fila vacía con deleted_at; otro empleado recibe NOT_FOUND", async () => {
    const { orgId, channelId, miembro, otro } = await orgConCanal();
    const posted = await postMessage(miembro, orgId, channelId, "me equivoqué");
    if (!posted.ok) throw new Error(posted.error.message);
    expect(await deleteMessage(otro, orgId, posted.data.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect((await deleteMessage(miembro, orgId, posted.data.id)).ok).toBe(true);
    const [row] = await db.select().from(message).where(eq(message.id, posted.data.id));
    expect(row?.body).toBe("");
    expect(row?.deletedAt).not.toBeNull();
    const list = await listMessages(otro, orgId, channelId);
    expect(list).toMatchObject({ ok: true, data: [{ deleted: true, body: "" }] });
  });

  it("WHEN ensureAgentChannel corre dos veces THE SYSTEM SHALL dejar un solo canal agente con ese perfil como único miembro", async () => {
    const { orgId, owner, miembro } = await orgConCanal();
    const [a] = await db.insert(agent).values({ orgId, kind: "manager", ownerProfileId: owner, name: "Improvement" }).returning();
    const uno = await ensureAgentChannel(a!.id, miembro);
    const dos = await ensureAgentChannel(a!.id, miembro);
    expect(uno?.id).toBe(dos?.id);
    const canales = await db.select().from(channel).where(and(eq(channel.orgId, orgId), eq(channel.kind, "agente")));
    expect(canales).toHaveLength(1);
    const miembros = await db.select({ profileId: channelMember.profileId }).from(channelMember).where(eq(channelMember.channelId, canales[0]!.id));
    expect(miembros).toEqual([{ profileId: miembro }]);
  });
});
