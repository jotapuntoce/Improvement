// Puntaje del Sello (server/seal/score.ts) contra el Supabase de desarrollo. Todo sale de filas: requisitos,
// resultados manuales, el proyecto que alimenta el KPI y el mínimo de muelle_settings.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  muelleSettings,
  organization,
  profile,
  project,
  sealRequirement,
  sealRequirementResult,
} from "@jotapuntoce/db/schema";
import { computeSealScore } from "../server/seal/score.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org(kind: "muelle" | "barco", parentOrgId?: string) {
  const [row] = await db
    .insert(organization)
    .values({ name: `t-${kind}`, slug: `t-score-${crypto.randomUUID()}`, kind, parentOrgId })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

const EN_OBRA = { source: "proyectos", config: { estado: "en_obra" }, op: "gte", threshold: 1 };

async function requirement(muelle: string, code: string, points: number, source: "manual" | "kpi", config: unknown = {}, active = true) {
  const [row] = await db.insert(sealRequirement).values({ muelleOrgId: muelle, code, title: code, points, source, config, active }).returning();
  return row!.id;
}

/** Barco con 10 manual cumplido, 5 manual sin cumplir y 20 kpi cumplido (un proyecto autorizado activo). */
async function scoredBarco(minSealScore: number) {
  const muelle = await org("muelle");
  const barco = await org("barco", muelle);
  const met = await requirement(muelle, "a-contrato", 10, "manual");
  await requirement(muelle, "b-seguro", 5, "manual");
  await requirement(muelle, "c-obra", 20, "kpi", EN_OBRA);
  await db.insert(sealRequirementResult).values({ muelleOrgId: muelle, requirementId: met, subjectKind: "barco", barcoOrgId: barco, met: true });
  await db.insert(project).values({ orgId: barco, name: "Obra", status: "activo", authorizationStatus: "autorizado" });
  await db.insert(muelleSettings).values({ muelleOrgId: muelle, minSealScore });
  return { muelle, barco };
}

describe("computeSealScore", () => {
  it("WHEN el muelle no tiene requisitos ni settings THE SYSTEM SHALL devolver 0, null y false", async () => {
    const muelle = await org("muelle");
    const barco = await org("barco", muelle);
    expect(await computeSealScore({ kind: "barco", orgId: barco }, muelle)).toEqual({ score: 0, minScore: null, meets: false, detail: [] });
  });

  it("WHEN el barco suma 30 con mínimo 25 THE SYSTEM SHALL cumplir; con mínimo 40, no", async () => {
    const a = await scoredBarco(25);
    expect(await computeSealScore({ kind: "barco", orgId: a.barco }, a.muelle)).toMatchObject({ score: 30, minScore: 25, meets: true });
    const b = await scoredBarco(40);
    expect(await computeSealScore({ kind: "barco", orgId: b.barco }, b.muelle)).toMatchObject({ score: 30, meets: false });
  });

  it("WHEN un kpi trae source manual, fuente inexistente o config sin threshold THE SYSTEM SHALL contarlo no cumplido sin lanzar", async () => {
    const muelle = await org("muelle");
    const barco = await org("barco", muelle);
    await requirement(muelle, "a", 10, "kpi", { ...EN_OBRA, source: "manual" });
    await requirement(muelle, "b", 10, "kpi", { ...EN_OBRA, source: "no-existe" });
    await requirement(muelle, "c", 10, "kpi", { source: "proyectos", op: "gte" });
    const r = await computeSealScore({ kind: "barco", orgId: barco }, muelle);
    expect(r.score).toBe(0);
    expect(r.detail.map((d) => d.met)).toEqual([false, false, false]);
  });

  it("WHEN la afiliada no tiene barco THE SYSTEM SHALL no cumplir sus kpi y sumar sus manuales", async () => {
    const muelle = await org("muelle");
    const p = crypto.randomUUID();
    await db.insert(profile).values({ id: p, email: `${p}@example.com` });
    profileIds.push(p);
    const [a] = await db
      .insert(affiliate)
      .values({ profileId: p, muelleOrgId: muelle, displayName: "Ana", publicSlug: `ana-${crypto.randomUUID()}` })
      .returning();
    const manual = await requirement(muelle, "a", 15, "manual");
    await requirement(muelle, "b", 20, "kpi", EN_OBRA);
    await db.insert(sealRequirementResult).values({ muelleOrgId: muelle, requirementId: manual, subjectKind: "afiliada", affiliateId: a!.id, met: true });
    expect(await computeSealScore({ kind: "afiliada", affiliateId: a!.id }, muelle)).toMatchObject({ score: 15 });
  });

  it("WHEN un requisito está inactivo THE SYSTEM SHALL dejarlo fuera de detail y score", async () => {
    const muelle = await org("muelle");
    const barco = await org("barco", muelle);
    const off = await requirement(muelle, "a", 50, "manual", {}, false);
    await db.insert(sealRequirementResult).values({ muelleOrgId: muelle, requirementId: off, subjectKind: "barco", barcoOrgId: barco, met: true });
    expect(await computeSealScore({ kind: "barco", orgId: barco }, muelle)).toMatchObject({ score: 0, detail: [] });
  });
});
