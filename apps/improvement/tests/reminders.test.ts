// Integración real contra el proyecto Supabase de desarrollo (blueprint §13), mismo patrón que
// tests/objectives.test.ts. Cada test limpia su organization en afterEach — reminder.org_id es
// cascade, así que sus filas de recordatorios desaparecen con el org, sin necesidad de borrarlas
// aparte.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, reminder } from "@jotapuntoce/db/schema";
import { deliverDueReminders } from "../server/reminders/deliver.ts";
import { GET } from "../app/api/cron/reminders/route.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-rem-${nameSuffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const createdOrgIds: string[] = [];

afterEach(async () => {
  if (createdOrgIds.length) {
    for (const orgId of createdOrgIds.splice(0)) {
      await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
    }
  }
});

describe("GET /api/cron/reminders", () => {
  it(
    "WHEN llega sin el header Authorization correcto THE SYSTEM SHALL devolver 401 y no marcar " +
      "ningún delivered_at",
    async () => {
      const org = await makeOrg("401");
      createdOrgIds.push(org.id);
      const [rem] = await db
        .insert(reminder)
        .values({ orgId: org.id, title: "No debe entregarse", scheduledAt: daysAgo(1), channel: "in_app" })
        .returning();
      if (!rem) throw new Error("insert de reminder no devolvió fila");

      const res = await GET(new Request("http://localhost/api/cron/reminders"));

      expect(res.status).toBe(401);
      const [row] = await db.select().from(reminder).where(eq(reminder.id, rem.id));
      expect(row?.deliveredAt).toBeNull();
    },
  );

  it("WHEN llega con el header Authorization correcto THE SYSTEM SHALL entregar y responder 200", async () => {
    const org = await makeOrg("200");
    createdOrgIds.push(org.id);
    const [rem] = await db
      .insert(reminder)
      .values({ orgId: org.id, title: "Debe entregarse", scheduledAt: daysAgo(1), channel: "in_app" })
      .returning();
    if (!rem) throw new Error("insert de reminder no devolvió fila");

    const res = await GET(
      new Request("http://localhost/api/cron/reminders", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );

    expect(res.status).toBe(200);
    const [row] = await db.select().from(reminder).where(eq(reminder.id, rem.id));
    expect(row?.deliveredAt).not.toBeNull();
  });
});

describe("deliverDueReminders", () => {
  it(
    "WHEN corre sobre un recordatorio vencido THE SYSTEM SHALL marcar delivered_at una vez, y una " +
      "segunda vez inmediatamente después THE SYSTEM SHALL no reenviarlo",
    async () => {
      const org = await makeOrg("idempotent");
      createdOrgIds.push(org.id);
      const [rem] = await db
        .insert(reminder)
        .values({ orgId: org.id, title: "Recordatorio vencido", scheduledAt: daysAgo(1), channel: "in_app" })
        .returning();
      if (!rem) throw new Error("insert de reminder no devolvió fila");

      await deliverDueReminders();

      const [afterFirst] = await db.select().from(reminder).where(eq(reminder.id, rem.id));
      expect(afterFirst?.deliveredAt).not.toBeNull();
      const deliveredAtFirst = afterFirst?.deliveredAt?.getTime();

      await deliverDueReminders();

      const [afterSecond] = await db.select().from(reminder).where(eq(reminder.id, rem.id));
      expect(afterSecond?.deliveredAt?.getTime()).toBe(deliveredAtFirst);
    },
  );
});
