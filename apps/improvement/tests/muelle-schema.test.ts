// apps/improvement/tests/muelle-schema.test.ts
// Restricciones del muelle en la base, contra el Supabase de desarrollo (mismo patrón que
// tests/permissions.test.ts: asUser simula el rol authenticated para probar RLS de verdad).
import { afterEach, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { feeRate, feeRateChange, ledgerEntry, membership, organization, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  if (orgIds.length) await db.delete(ledgerEntry).where(inArray(ledgerEntry.barcoOrgId, orgIds));
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org(kind: "muelle" | "barco", parentOrgId: string | null = null) {
  const [row] = await db
    .insert(organization)
    .values({ name: `t-${kind}`, slug: `t-${kind}-${crypto.randomUUID()}`, kind, parentOrgId })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row;
}

async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
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

describe("organization.kind / parent_org_id", () => {
  it("WHEN una empresa se crea sin kind THE SYSTEM SHALL guardarla como barco", async () => {
    const [row] = await db.insert(organization).values({ name: "x", slug: `x-${crypto.randomUUID()}` }).returning();
    if (!row) throw new Error("sin fila");
    orgIds.push(row.id);
    expect(row.kind).toBe("barco");
  });

  it("WHEN un muelle tiene padre THE SYSTEM SHALL rechazar el insert", async () => {
    const dock = await org("muelle");
    await expect(org("muelle", dock.id)).rejects.toThrow();
  });
});

describe("fee_rate / fee_rate_change", () => {
  it("WHEN se repite la tasa de fábrica del mismo tipo THE SYSTEM SHALL rechazarla (nulls not distinct)", async () => {
    const dock = await org("muelle");
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 500 });
    await expect(
      db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 700 }),
    ).rejects.toThrow();
  });

  it("WHEN quien decide es quien propuso THE SYSTEM SHALL rechazarlo en la base", async () => {
    const dock = await org("muelle");
    const a = await person(dock.id, "owner");
    await expect(
      db.insert(feeRateChange).values({
        muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 500, proposedBy: a,
        decidedBy: a, decidedAt: new Date(), decision: "aprobado",
      }),
    ).rejects.toThrow();
  });
});

describe("RLS — ledger_entry", () => {
  it("WHEN un dueño de barco consulta por PostgREST THE SYSTEM SHALL devolver solo sus filas", async () => {
    const dock = await org("muelle");
    const b1 = await org("barco", dock.id);
    const b2 = await org("barco", dock.id);
    const owner1 = await person(b1.id, "owner");
    await db.insert(ledgerEntry).values([
      { muelleOrgId: dock.id, barcoOrgId: b1.id, chargeKind: "venta_propia", grossCents: 1000, summumFeeCents: 100, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` },
      { muelleOrgId: dock.id, barcoOrgId: b2.id, chargeKind: "venta_propia", grossCents: 2000, summumFeeCents: 200, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` },
    ]);
    const rows = await asUser<{ barco_org_id: string }>(owner1, "select barco_org_id from ledger_entry");
    expect(rows.map((r) => r.barco_org_id)).toEqual([b1.id]);
  });

  it("WHEN un empleado del barco consulta THE SYSTEM SHALL devolver vacío", async () => {
    const dock = await org("muelle");
    const b1 = await org("barco", dock.id);
    const emp = await person(b1.id, "employee");
    await db.insert(ledgerEntry).values({ muelleOrgId: dock.id, barcoOrgId: b1.id, chargeKind: "venta_propia", grossCents: 1000, summumFeeCents: 100, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` });
    expect(await asUser(emp, "select id from ledger_entry")).toEqual([]);
  });

  it("WHEN un dueño del muelle consulta THE SYSTEM SHALL ver las filas de todos sus barcos", async () => {
    const dock = await org("muelle");
    const b1 = await org("barco", dock.id);
    const dockOwner = await person(dock.id, "owner");
    await db.insert(ledgerEntry).values({ muelleOrgId: dock.id, barcoOrgId: b1.id, chargeKind: "membresia", grossCents: 50000, summumFeeCents: 50000, currency: "mxn", stripeObjectId: `in_${crypto.randomUUID()}` });
    expect(await asUser(dockOwner, "select id from ledger_entry")).toHaveLength(1);
  });

  it("WHEN cualquier authenticated consulta fee_rate de un muelle ajeno THE SYSTEM SHALL devolver vacío", async () => {
    const dock = await org("muelle");
    const stranger = await person((await org("barco", dock.id)).id, "owner");
    await db.insert(feeRate).values({ muelleOrgId: dock.id, chargeKind: "venta_propia", percentBps: 500 });
    expect(await asUser(stranger, "select id from fee_rate")).toEqual([]);
  });
});
