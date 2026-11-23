// Salud del cliente contra el Supabase de desarrollo: actividad → healthy/neutral/at_risk, ticket
// viejo, lo manual gana 30 días y el cron exige su bearer.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, organization, recordActivity, ticket } from "@jotapuntoce/db/schema";
import { recomputeClientHealth } from "../server/insights/health.ts";
import { GET } from "../app/api/cron/salud/route.ts";

const orgIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-salud", slug: `t-salud-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return o!.id;
}
async function clientWith(orgId: string, lastActivityDaysAgo: number) {
  const at = ago(lastActivityDaysAgo);
  const [c] = await db.insert(client).values({ orgId, name: `c-${lastActivityDaysAgo}`, createdAt: at, updatedAt: at }).returning();
  return c!.id;
}
const healthOf = async (id: string) => (await db.select({ h: client.healthStatus }).from(client).where(eq(client.id, id)))[0]!.h;

describe("salud del cliente", () => {
  it("WHEN corre el cron THE SYSTEM SHALL marcar 10 días healthy, 60 neutral y 120 at_risk", async () => {
    const orgId = await org();
    const [a, b, c] = [await clientWith(orgId, 10), await clientWith(orgId, 60), await clientWith(orgId, 120)];
    const r = await recomputeClientHealth(new Date(), [orgId]);
    expect(r.clients).toBe(3);
    expect([await healthOf(a), await healthOf(b), await healthOf(c)]).toEqual(["healthy", "neutral", "at_risk"]);
  });

  it("WHEN tiene un ticket abierto de hace 8 días THE SYSTEM SHALL dejarlo at_risk aunque haya actividad", async () => {
    const orgId = await org();
    const id = await clientWith(orgId, 2);
    await db.insert(ticket).values({ orgId, clientId: id, title: "No llegó", status: "abierto", openedAt: ago(8), updatedAt: ago(1) });
    await recomputeClientHealth(new Date(), [orgId]);
    expect(await healthOf(id)).toBe("at_risk");
  });

  it("WHEN alguien cambió la salud a mano hace 5 días THE SYSTEM SHALL no tocarla", async () => {
    const orgId = await org();
    const id = await clientWith(orgId, 120);
    await db.update(client).set({ healthStatus: "healthy" }).where(eq(client.id, id));
    await db.insert(recordActivity).values({ orgId, appKey: "clientes", section: "clientes", recordId: id, kind: "cambio", body: "Etapa: at_risk → healthy", createdAt: ago(5) });
    await recomputeClientHealth(new Date(), [orgId]);
    expect(await healthOf(id)).toBe("healthy");
  });

  it("WHEN el cron llega sin CRON_SECRET THE SYSTEM SHALL responder 401", async () => {
    expect((await GET(new Request("http://localhost/api/cron/salud"))).status).toBe(401);
  });
});
