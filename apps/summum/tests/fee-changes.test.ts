import { afterEach, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { feeRate, membership, organization, profile } from "@jotapuntoce/db/schema";
import { decideFeeChange, listRates, proposeFeeChange } from "../server/fees/changes.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function dockWithOwners(n: number) {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  if (!dock) throw new Error("sin fila");
  orgIds.push(dock.id);
  const owners: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID();
    await db.insert(profile).values({ id, email: `${id}@example.com` });
    profileIds.push(id);
    await db.insert(membership).values({ userId: id, orgId: dock.id, role: "owner", acceptedAt: new Date() });
    owners.push(id);
  }
  return { dock, owners };
}

describe("proposeFeeChange", () => {
  it("WHEN el input no es válido THE SYSTEM SHALL rechazarlo sin insertar", async () => {
    const { dock, owners } = await dockWithOwners(1);
    const r = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 20_000 });
    expect(r.ok).toBe(false);
  });
  it("WHEN se propone THE SYSTEM SHALL NO cambiar fee_rate todavía", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const r = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    expect(r.ok).toBe(true);
    expect(await listRates(dock.id)).toEqual([]);
  });
});

describe("decideFeeChange", () => {
  it("WHEN quien decide es quien propuso THE SYSTEM SHALL rechazarlo", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    const r = await decideFeeChange(owners[0]!, p.data.id, "aprobado");
    expect(r).toEqual({ ok: false, error: "Necesita la firma del otro dueño." });
  });
  it("WHEN el otro dueño aprueba THE SYSTEM SHALL escribir la tasa", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 100, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    expect((await decideFeeChange(owners[1]!, p.data.id, "aprobado")).ok).toBe(true);
    expect(await listRates(dock.id)).toEqual([{ barcoOrgId: null, chargeKind: "venta_propia", percentBps: 500, fixedCents: 100 }]);
  });
  it("WHEN se aprueba un cambio sobre una tasa existente THE SYSTEM SHALL actualizarla, no duplicarla", async () => {
    const { dock, owners } = await dockWithOwners(2);
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 300 });
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 700, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    await decideFeeChange(owners[1]!, p.data.id, "aprobado");
    const rows = await db.select().from(feeRate).where(and(eq(feeRate.muelleOrgId, dock.id), isNull(feeRate.barcoOrgId)));
    expect(rows.map((r) => r.percentBps)).toEqual([700]);
  });
  it("WHEN se rechaza THE SYSTEM SHALL no tocar fee_rate", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    expect((await decideFeeChange(owners[1]!, p.data.id, "rechazado")).ok).toBe(true);
    expect(await listRates(dock.id)).toEqual([]);
  });
  it("WHEN ya estaba decidido THE SYSTEM SHALL rechazar decidir otra vez", async () => {
    const { dock, owners } = await dockWithOwners(3);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    await decideFeeChange(owners[1]!, p.data.id, "aprobado");
    expect((await decideFeeChange(owners[2]!, p.data.id, "rechazado")).ok).toBe(false);
  });
  it("WHEN se decide dos veces el mismo cambio THE SYSTEM SHALL dar el error y dejar fee_rate como estaba", async () => {
    const { dock, owners } = await dockWithOwners(3);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    await decideFeeChange(owners[1]!, p.data.id, "aprobado");
    const before = await listRates(dock.id);
    expect(await decideFeeChange(owners[2]!, p.data.id, "aprobado")).toEqual({ ok: false, error: "Este cambio ya se decidió." });
    expect(await listRates(dock.id)).toEqual(before);
  });
  it("WHEN decide alguien que no es dueño del muelle THE SYSTEM SHALL responder 404", async () => {
    const { dock, owners } = await dockWithOwners(1);
    const p = await proposeFeeChange(owners[0]!, dock.id, { chargeKind: "venta_propia", percentBps: 500, fixedCents: 0, barcoOrgId: null });
    if (!p.ok) throw new Error("setup");
    const stranger = crypto.randomUUID();
    await db.insert(profile).values({ id: stranger, email: `${stranger}@example.com` });
    profileIds.push(stranger);
    await expect(decideFeeChange(stranger, p.data.id, "aprobado")).rejects.toThrow();
  });
});
