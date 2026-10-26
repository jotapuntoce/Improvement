// apps/improvement/tests/proyectos-schema.test.ts
// Esquema de Proyectos/obra contra el Supabase de desarrollo (mismo patrón que
// tests/muelle-schema.test.ts: asUser simula el rol authenticated para probar RLS de verdad).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, orgKpi, profile, project, projectStage } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-proyectos", slug: `t-proyectos-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row;
}

async function person(orgId: string | null) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  if (orgId) await db.insert(membership).values({ userId: id, orgId, role: "employee", acceptedAt: new Date() });
  return id;
}

async function newProject(orgId: string) {
  const [row] = await db.insert(project).values({ orgId, name: "Obra" }).returning();
  if (!row) throw new Error("insert de project no devolvió fila");
  return row;
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

describe("project / project_stage", () => {
  it("WHEN se inserta un project nuevo THE SYSTEM SHALL dejarlo pendiente y aceptar una etapa ligada", async () => {
    const o = await org();
    const p = await newProject(o.id);
    expect(p.authorizationStatus).toBe("pendiente");
    await db.insert(projectStage).values({ orgId: o.id, projectId: p.id, name: "Cimentación", weight: 30 });
    const stages = await db.select().from(projectStage).where(eq(projectStage.projectId, p.id));
    expect(stages).toHaveLength(1);
    expect(stages[0]?.status).toBe("pendiente");
  });

  it("WHEN authorization_status es 'aprobado' THE SYSTEM SHALL rechazar el insert", async () => {
    const o = await org();
    await expect(
      db.insert(project).values({ orgId: o.id, name: "x", authorizationStatus: "aprobado" as never }),
    ).rejects.toThrow();
  });

  it("WHEN una etapa trae progress 101 o weight 0 THE SYSTEM SHALL rechazar cada insert", async () => {
    const o = await org();
    const p = await newProject(o.id);
    await expect(db.insert(projectStage).values({ orgId: o.id, projectId: p.id, name: "a", progress: 101 })).rejects.toThrow();
    await expect(db.insert(projectStage).values({ orgId: o.id, projectId: p.id, name: "b", weight: 0 })).rejects.toThrow();
  });
});

describe("org_kpi.source", () => {
  it("WHEN el source es proyectos o pendientes THE SYSTEM SHALL aceptarlo, y rechazar 'inventado'", async () => {
    const o = await org();
    await db.insert(orgKpi).values([
      { orgId: o.id, label: "Proyectos", source: "proyectos" },
      { orgId: o.id, label: "Pendientes", source: "pendientes" },
    ]);
    await expect(db.insert(orgKpi).values({ orgId: o.id, label: "x", source: "inventado" })).rejects.toThrow();
  });
});

describe("RLS — project_stage", () => {
  it("WHEN un miembro consulta THE SYSTEM SHALL ver las etapas de su org, y un ajeno 0 filas", async () => {
    const o = await org();
    const p = await newProject(o.id);
    await db.insert(projectStage).values({ orgId: o.id, projectId: p.id, name: "Acabados" });
    const member = await person(o.id);
    const outsider = await person((await org()).id);
    expect(await asUser(member, "select id from project_stage")).toHaveLength(1);
    expect(await asUser(outsider, "select id from project_stage")).toEqual([]);
  });
});
