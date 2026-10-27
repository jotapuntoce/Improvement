import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { ledgerEntry, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { scopeFor } from "../server/permissions/sections.ts";
import { listOrgLedger } from "../server/cobros/ledger.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  if (orgIds.length) await db.delete(ledgerEntry).where(sql`${ledgerEntry.barcoOrgId} in (${sql.join(orgIds.map((i) => sql`${i}::uuid`), sql`, `)})`);
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

describe("sección cobros", () => {
  it("WHEN un empleado no tiene la sección en su tipo THE SYSTEM SHALL darle ninguno", () => {
    expect(scopeFor("employee", { objetivos: "area" }, "cobros")).toBe("ninguno");
    expect(scopeFor("owner", null, "cobros")).toBe("empresa");
  });

  it("WHEN el dueño lista THE SYSTEM SHALL ver los movimientos de su barco y el empleado sin permiso nada", async () => {
    const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
    const [boat] = await db.insert(organization).values({ name: "b", slug: `b-${crypto.randomUUID()}`, parentOrgId: dock!.id }).returning();
    orgIds.push(dock!.id, boat!.id);
    const mk = async (role: "owner" | "employee", permissionTypeId: string | null = null) => {
      const id = crypto.randomUUID();
      await db.insert(profile).values({ id, email: `${id}@example.com` });
      profileIds.push(id);
      await db.insert(membership).values({ userId: id, orgId: boat!.id, role, acceptedAt: new Date(), permissionTypeId });
      return id;
    };
    const [tipo] = await db.insert(permissionType).values({ orgId: boat!.id, name: "Ventas", grants: { clientes: "empresa" } }).returning();
    const owner = await mk("owner");
    const emp = await mk("employee", tipo!.id);
    await db.insert(ledgerEntry).values({ muelleOrgId: dock!.id, barcoOrgId: boat!.id, chargeKind: "venta_propia", grossCents: 100, summumFeeCents: 10, currency: "mxn", stripeObjectId: `pi_${crypto.randomUUID()}` });

    expect(await listOrgLedger(owner, boat!.id)).toHaveLength(1);
    expect(await listOrgLedger(emp, boat!.id)).toEqual([]);
  });
});
