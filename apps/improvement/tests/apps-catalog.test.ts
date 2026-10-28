import { afterEach, describe, expect, it } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, appStage, organization } from "@jotapuntoce/db/schema";
import { BASE_APPS, ensureOrgApps } from "../server/apps/catalog.ts";

const orgIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

describe("ensureOrgApps", () => {
  it("WHEN corre dos veces THE SYSTEM SHALL sembrar una vez las 4 apps base, sus grupos y las etapas de ventas en orden", async () => {
    const [o] = await db.insert(organization).values({ name: "t-cat", slug: `t-cat-${crypto.randomUUID()}` }).returning();
    orgIds.push(o!.id);
    await ensureOrgApps(o!.id);
    await ensureOrgApps(o!.id);
    const apps = await db.select().from(appModel).where(eq(appModel.orgId, o!.id));
    expect(apps.map((a) => a.key).sort()).toEqual(["clientes", "postventa", "proyectos", "ventas"]);
    expect(await db.select().from(appGroup).where(eq(appGroup.orgId, o!.id))).toHaveLength(2);
    const ventas = apps.find((a) => a.key === "ventas")!;
    const stages = await db.select().from(appStage).where(eq(appStage.appId, ventas.id)).orderBy(asc(appStage.position));
    expect(stages.map((s) => s.key)).toEqual(["prospecto", "propuesta", "negociacion", "ganado", "perdido"]);
  });

  it("WHEN corre dos veces a la vez THE SYSTEM SHALL dejar exactamente 2 grupos y 4 apps", async () => {
    const [o] = await db.insert(organization).values({ name: "t-cat", slug: `t-cat-${crypto.randomUUID()}` }).returning();
    orgIds.push(o!.id);
    await Promise.all([ensureOrgApps(o!.id), ensureOrgApps(o!.id)]);
    expect(await db.select().from(appModel).where(eq(appModel.orgId, o!.id))).toHaveLength(4);
    expect(await db.select().from(appGroup).where(eq(appGroup.orgId, o!.id))).toHaveLength(2);
  });

  it("WHEN se lee BASE_APPS THE SYSTEM SHALL tener una sección válida por app", () => {
    for (const app of BASE_APPS) expect(["clientes", "proyectos", "postventa"]).toContain(app.section);
  });
});
