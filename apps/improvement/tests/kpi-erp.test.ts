// Fuentes de KPI `proyectos` y `pendientes` (server/kpis/sources.ts) contra el Supabase de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, objective, orgNeed, organization, profile, project } from "@jotapuntoce/db/schema";
import { computeKpiValues, type KpiRow } from "../server/kpis/sources.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-kpi-erp", slug: `t-kpi-erp-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

function kpi(orgId: string, source: string, config: unknown): KpiRow {
  return { id: crypto.randomUUID(), orgId, label: "k", hint: null, source, config, manualValue: null, format: "numero" };
}

async function values(rows: KpiRow[]) {
  const map = await computeKpiValues(rows);
  return rows.map((r) => map.get(r.id));
}

describe("fuente proyectos", () => {
  it("WHEN hay un pendiente y dos autorizados (25 y 60) THE SYSTEM SHALL devolver 1, 2 y 43", async () => {
    const o = await org();
    await db.insert(project).values([
      { orgId: o, name: "a", authorizationStatus: "pendiente" },
      { orgId: o, name: "b", authorizationStatus: "autorizado", progress: 25 },
      { orgId: o, name: "c", authorizationStatus: "autorizado", progress: 60 },
    ]);
    expect(
      await values([
        kpi(o, "proyectos", { estado: "por_autorizar" }),
        kpi(o, "proyectos", { estado: "en_obra" }),
        kpi(o, "proyectos", { estado: "avance_promedio" }),
        kpi(o, "proyectos", { estado: "otro" }),
      ]),
    ).toEqual([1, 2, 43, 2]);
  });

  it("WHEN el org no tiene proyectos THE SYSTEM SHALL devolver 0 de avance promedio", async () => {
    const o = await org();
    expect(await values([kpi(o, "proyectos", { estado: "avance_promedio" })])).toEqual([0]);
  });
});

describe("fuente pendientes", () => {
  it("WHEN hay tres pendientes abiertos (dos con responsable) y uno cerrado THE SYSTEM SHALL devolver 3, 2 y 1", async () => {
    const o = await org();
    const emp = crypto.randomUUID();
    await db.insert(profile).values({ id: emp, email: `${emp}@example.com` });
    profileIds.push(emp);
    await db.insert(membership).values({ userId: emp, orgId: o, role: "employee", acceptedAt: new Date() });
    const [need] = await db.insert(orgNeed).values({ orgId: o, title: "Issue" }).returning();
    if (!need) throw new Error("sin issue");
    const base = { orgId: o, needId: need.id, impactWeight: 10, dueDate: new Date() };
    await db.insert(objective).values([
      { ...base, title: "1", assignedEmployeeId: emp },
      { ...base, title: "2", assignedEmployeeId: emp, status: "in_progress" },
      { ...base, title: "3" },
      { ...base, title: "4", assignedEmployeeId: emp, status: "completed" },
      { orgId: o, title: "sin issue", impactWeight: 10, dueDate: new Date() },
    ]);
    expect(
      await values([
        kpi(o, "pendientes", {}),
        kpi(o, "pendientes", { responsable: "con" }),
        kpi(o, "pendientes", { responsable: "sin" }),
      ]),
    ).toEqual([3, 2, 1]);
  });
});
