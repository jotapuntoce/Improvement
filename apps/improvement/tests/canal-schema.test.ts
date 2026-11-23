// channel, channel_member y message: checks, RLS y publicación Realtime contra el Supabase de desarrollo
// (patrón asUser de tests/oficina-schema.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { channel, channelMember, membership, message, organization, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function orgConCanal() {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-canal", slug: `t-canal-${crypto.randomUUID()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ids = { miembro: crypto.randomUUID(), fuera: crypto.randomUUID() };
  for (const id of Object.values(ids)) {
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId: org.id, role: "employee", acceptedAt: new Date() });
  }
  const [canal] = await db.insert(channel).values({ orgId: org.id, kind: "general", name: "General" }).returning();
  await db.insert(channelMember).values({ channelId: canal!.id, profileId: ids.miembro });
  return { orgId: org.id, channelId: canal!.id, ...ids };
}

async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

describe("message — checks", () => {
  it("WHEN un mensaje trae dos autores o ninguno THE SYSTEM SHALL rechazarlo", async () => {
    const { orgId, channelId } = await orgConCanal();
    await expect(db.insert(message).values({ orgId, channelId, body: "sin autor" })).rejects.toThrow();
    await expect(
      db.execute(
        sql`insert into message (org_id, channel_id, author_profile_id, author_agent_id, body)
            values (${orgId}, ${channelId}, ${profileIds[0]}, gen_random_uuid(), 'dos')`,
      ),
    ).rejects.toThrow();
  });

  it("WHEN se marca deleted_at sin vaciar body THE SYSTEM SHALL rechazarlo; vaciándolo, aceptarlo", async () => {
    const { orgId, channelId, miembro } = await orgConCanal();
    const [m] = await db.insert(message).values({ orgId, channelId, authorProfileId: miembro, body: "hola" }).returning();
    await expect(db.update(message).set({ deletedAt: new Date() }).where(eq(message.id, m!.id))).rejects.toThrow();
    await db.update(message).set({ deletedAt: new Date(), body: "" }).where(eq(message.id, m!.id));
    const [row] = await db.select().from(message).where(eq(message.id, m!.id));
    expect(row?.body).toBe("");
  });
});

describe("message — RLS y Realtime", () => {
  it("WHEN un miembro consulta THE SYSTEM SHALL ver los mensajes; un empleado no miembro ve 0", async () => {
    const { orgId, channelId, miembro, fuera } = await orgConCanal();
    await db.insert(message).values({ orgId, channelId, authorProfileId: miembro, body: "hola equipo" });
    const q = `select body from message where channel_id = '${channelId}'`;
    expect(await asUser<{ body: string }>(miembro, q)).toEqual([{ body: "hola equipo" }]);
    expect(await asUser(fuera, q)).toHaveLength(0);
    expect(await asUser(fuera, `select id from channel where id = '${channelId}'`)).toHaveLength(0);
  });

  it("WHEN se consulta pg_publication_tables THE SYSTEM SHALL listar message en supabase_realtime", async () => {
    const rows = await db.execute(
      sql`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message'`,
    );
    expect(rows).toHaveLength(1);
  });
});
