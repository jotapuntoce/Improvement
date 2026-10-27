// Requisitos, ajustes y la firma de dos socios del Sello (server/seal/*) contra el Supabase de desarrollo.
// Patrón dockWithOwners de tests/fee-changes.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, muelleSettings, organization, profile, sealEvaluation, sealRequirementResult } from "@jotapuntoce/db/schema";
import { approveEvaluation, rejectEvaluation } from "../server/seal/approvals.ts";
import { createRequirement, markManualResult, upsertSettings } from "../server/seal/requirements.ts";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const INVALIDO = { ok: false, error: "Revisa los datos del formulario." };

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function newProfile() {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  return id;
}

async function dockWithOwners(n: number) {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  if (!dock) throw new Error("sin fila");
  orgIds.push(dock.id);
  const owners: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = await newProfile();
    await db.insert(membership).values({ userId: id, orgId: dock.id, role: "owner", acceptedAt: new Date() });
    owners.push(id);
  }
  return { dock, owners };
}

async function barco(muelleId: string) {
  const [row] = await db
    .insert(organization)
    .values({ name: "b", slug: `b-${crypto.randomUUID()}`, kind: "barco", parentOrgId: muelleId })
    .returning();
  orgIds.push(row!.id);
  return row!.id;
}

async function pending(muelleId: string) {
  const [ev] = await db
    .insert(sealEvaluation)
    .values({ muelleOrgId: muelleId, subjectKind: "barco", barcoOrgId: await barco(muelleId), score: 30 })
    .returning();
  return ev!.id;
}

const evalOf = async (id: string) => (await db.select().from(sealEvaluation).where(eq(sealEvaluation.id, id)))[0];

describe("approveEvaluation", () => {
  it("WHEN firman el mismo socio dos veces y luego el otro THE SYSTEM SHALL pedir la otra firma y luego aprobar vigente", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const id = await pending(dock.id);
    expect(await approveEvaluation(owners[0]!, id)).toEqual({ ok: true, data: { status: "pendiente" } });
    expect(await evalOf(id)).toMatchObject({ firstApproverId: owners[0], approvalStatus: "pendiente" });
    expect(await approveEvaluation(owners[0]!, id)).toEqual({ ok: false, error: "Necesita la firma del otro dueño." });
    expect(await approveEvaluation(owners[1]!, id)).toEqual({ ok: true, data: { status: "aprobada" } });
    const after = await evalOf(id);
    expect(after).toMatchObject({ approvalStatus: "aprobada", vigencia: "vigente" });
    expect(after?.approvedAt).not.toBeNull();
  });

  it("WHEN la evaluación ya está decidida THE SYSTEM SHALL devolver ya decidido al aprobar o rechazar", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const id = await pending(dock.id);
    expect(await rejectEvaluation(owners[0]!, id)).toEqual({ ok: true, data: true });
    const ya = { ok: false, error: "Este cambio ya se decidió." };
    expect(await approveEvaluation(owners[1]!, id)).toEqual(ya);
    expect(await rejectEvaluation(owners[1]!, id)).toEqual(ya);
  });

  it("WHEN alguien que no es dueño del muelle aprueba, crea un requisito o guarda ajustes THE SYSTEM SHALL lanzar 404", async () => {
    const { dock } = await dockWithOwners(1);
    const id = await pending(dock.id);
    const stranger = await newProfile();
    await expect(approveEvaluation(stranger, id)).rejects.toMatchObject(NOT_FOUND);
    await expect(createRequirement(stranger, dock.id, {})).rejects.toMatchObject(NOT_FOUND);
    await expect(upsertSettings(stranger, dock.id, {})).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("requisitos y ajustes", () => {
  it("WHEN se crea un requisito válido THE SYSTEM SHALL guardarlo; con code inválido o kpi sin threshold, inválido", async () => {
    const { dock, owners } = await dockWithOwners(1);
    const o = owners[0]!;
    const base = { title: "Contrato firmado", points: 10 };
    expect((await createRequirement(o, dock.id, { ...base, code: "contrato", source: "manual", config: {} })).ok).toBe(true);
    expect(await createRequirement(o, dock.id, { ...base, code: "Contrato Firmado", source: "manual", config: {} })).toEqual(INVALIDO);
    expect(
      await createRequirement(o, dock.id, { ...base, code: "obra", source: "kpi", config: { source: "proyectos", config: {}, op: "gte" } }),
    ).toEqual(INVALIDO);
  });

  it("WHEN se marca un barco de otro muelle o un requisito kpi THE SYSTEM SHALL devolver ok false sin escribir", async () => {
    const { dock, owners } = await dockWithOwners(1);
    const o = owners[0]!;
    const manual = await createRequirement(o, dock.id, { code: "contrato", title: "Contrato", points: 10, source: "manual", config: {} });
    const kpi = await createRequirement(o, dock.id, {
      code: "obra", title: "Obra", points: 10, source: "kpi", config: { source: "proyectos", config: {}, op: "gte", threshold: 1 },
    });
    if (!manual.ok || !kpi.ok) throw new Error("setup");
    const other = await dockWithOwners(1);
    const ajeno = await barco(other.dock.id);
    const propio = await barco(dock.id);

    expect((await markManualResult(o, manual.data.id, { kind: "barco", orgId: ajeno }, true, null)).ok).toBe(false);
    expect((await markManualResult(o, kpi.data.id, { kind: "barco", orgId: propio }, true, null)).ok).toBe(false);
    expect(await db.select().from(sealRequirementResult).where(eq(sealRequirementResult.muelleOrgId, dock.id))).toEqual([]);
    expect(await markManualResult(o, manual.data.id, { kind: "barco", orgId: propio }, true, "Firmado")).toEqual({ ok: true, data: true });
  });

  it("WHEN se guardan ajustes con mínimo null THE SYSTEM SHALL guardarlo; con graceDays 0, ok false", async () => {
    const { dock, owners } = await dockWithOwners(1);
    const o = owners[0]!;
    expect((await upsertSettings(o, dock.id, { minSealScore: null, graceDays: 30, proposalMinSeverity: 3 })).ok).toBe(true);
    const [row] = await db.select().from(muelleSettings).where(eq(muelleSettings.muelleOrgId, dock.id));
    expect(row?.minSealScore).toBeNull();
    expect((await upsertSettings(o, dock.id, { minSealScore: 10, graceDays: 0, proposalMinSeverity: 3 })).ok).toBe(false);
  });
});
