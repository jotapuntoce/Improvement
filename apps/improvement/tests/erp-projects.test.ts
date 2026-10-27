// El motor de Proyectos/obra (server/erp/projects.ts) contra el Supabase de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile, project, projectStage } from "@jotapuntoce/db/schema";
import {
  addStage,
  authorizeProject,
  loadProjectBoard,
  removeStage,
  setProjectOwner,
  stageWeightedProgress,
  updateStage,
} from "../server/erp/projects.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-erp", slug: `t-erp-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}

async function newProject(orgId: string) {
  const [row] = await db.insert(project).values({ orgId, name: "Obra", progress: 7 }).returning();
  if (!row) throw new Error("insert de project no devolvió fila");
  return row.id;
}

const projectOf = async (id: string) => (await db.select().from(project).where(eq(project.id, id)))[0];

async function stage(owner: string, orgId: string, projectId: string, weight: number) {
  const res = await addStage(owner, orgId, projectId, { name: `Etapa ${weight}`, weight });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

describe("stageWeightedProgress", () => {
  it("WHEN recibe etapas ponderadas THE SYSTEM SHALL devolver el promedio redondeado, y null sin etapas", () => {
    expect(stageWeightedProgress([{ weight: 1, progress: 100 }, { weight: 3, progress: 0 }])).toBe(25);
    expect(stageWeightedProgress([{ weight: 2, progress: 50 }, { weight: 1, progress: 80 }])).toBe(60);
    expect(stageWeightedProgress([])).toBeNull();
  });
});

describe("etapas y avance", () => {
  it("WHEN el dueño agrega dos etapas y mueve su avance THE SYSTEM SHALL dejar el avance ponderado en el proyecto", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const p = await newProject(o);
    const s1 = await stage(owner, o, p, 2);
    const s2 = await stage(owner, o, p, 1);
    expect(await updateStage(owner, o, s1, { progress: 50, status: "en_curso" })).toEqual({ ok: true, data: true });
    expect(await updateStage(owner, o, s2, { progress: 80, status: "en_curso" })).toEqual({ ok: true, data: true });
    expect((await projectOf(p))?.progress).toBe(60);

    const board = await loadProjectBoard(owner, o);
    expect(board.canManage).toBe(true);
    expect(board.projects[0]?.stages.map((s) => s.position)).toEqual([0, 1]);
  });

  it("WHEN se quita la última etapa THE SYSTEM SHALL dejar el avance como estaba", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const p = await newProject(o);
    const s1 = await stage(owner, o, p, 1);
    await updateStage(owner, o, s1, { progress: 40, status: "en_curso" });
    expect(await removeStage(owner, o, s1)).toEqual({ ok: true, data: true });
    expect((await projectOf(p))?.progress).toBe(40);
  });
});

describe("authorizeProject", () => {
  it("WHEN el dueño autoriza un pendiente THE SYSTEM SHALL guardarlo, y la segunda vez INVALID_TRANSITION", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const p = await newProject(o);
    expect(await authorizeProject(owner, o, p, "autorizado")).toEqual({ ok: true, data: true });
    const row = await projectOf(p);
    expect(row?.authorizationStatus).toBe("autorizado");
    expect(row?.authorizedBy).toBe(owner);
    expect(row?.authorizedAt).not.toBeNull();
    const again = await authorizeProject(owner, o, p, "autorizado");
    expect(again.ok ? null : again.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("alcances", () => {
  it("WHEN un empleado autoriza o agrega etapa THE SYSTEM SHALL devolver FORBIDDEN sin escribir; el responsable sí mueve avance", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee");
    const p = await newProject(o);
    const s1 = await stage(owner, o, p, 1);

    const auth = await authorizeProject(emp, o, p, "autorizado");
    expect(auth.ok ? null : auth.error.code).toBe("FORBIDDEN");
    const add = await addStage(emp, o, p, { name: "Otra", weight: 1 });
    expect(add.ok ? null : add.error.code).toBe("FORBIDDEN");
    expect((await projectOf(p))?.authorizationStatus).toBe("pendiente");
    expect(await db.select().from(projectStage).where(eq(projectStage.projectId, p))).toHaveLength(1);

    const before = await updateStage(emp, o, s1, { progress: 30, status: "en_curso" });
    expect(before.ok ? null : before.error.code).toBe("FORBIDDEN");
    expect(await setProjectOwner(owner, o, p, emp)).toEqual({ ok: true, data: true });
    expect(await updateStage(emp, o, s1, { progress: 30, status: "en_curso" })).toEqual({ ok: true, data: true });
    expect((await projectOf(p))?.progress).toBe(30);
  });

  it("WHEN el responsable no es miembro o el proyecto es de otro org THE SYSTEM SHALL devolver NOT_FOUND", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const p = await newProject(o);
    const other = await org();
    const outsider = await person(other, "owner");
    const foreign = await newProject(other);

    const codeOf = (r: { ok: boolean; error?: { code: string } }) => r.error?.code;
    expect(codeOf(await setProjectOwner(owner, o, p, outsider))).toBe("NOT_FOUND");
    expect(codeOf(await setProjectOwner(owner, o, foreign, null))).toBe("NOT_FOUND");
    expect(codeOf(await authorizeProject(owner, o, foreign, "autorizado"))).toBe("NOT_FOUND");
    expect(codeOf(await addStage(owner, o, foreign, { name: "Ajena", weight: 1 }))).toBe("NOT_FOUND");
    const foreignStage = await stage(outsider, other, foreign, 1);
    expect(codeOf(await updateStage(owner, o, foreignStage, { progress: 10, status: "en_curso" }))).toBe("NOT_FOUND");
    expect(codeOf(await removeStage(owner, o, foreignStage))).toBe("NOT_FOUND");
  });

  it("WHEN alguien sin membresía carga el tablero THE SYSTEM SHALL lanzar el 404 de assertMembership", async () => {
    const o = await org();
    const outsider = await person(await org(), "owner");
    await expect(loadProjectBoard(outsider, o)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
