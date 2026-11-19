// product, supplier y stock_move: checks, SKU único por org y RLS por la sección `erp` contra el
// Supabase de desarrollo (patrón asUser de tests/canal-schema.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, product, profile, stockMove, supplier } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-erp", slug: `t-erp-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const ids = { conErp: crypto.randomUUID(), sinErp: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  const [tipo] = await db.insert(permissionType).values({ orgId: o.id, name: "ERP", grants: { erp: "empresa" } }).returning();
  await db.insert(membership).values([
    { userId: ids.conErp, orgId: o.id, role: "employee", acceptedAt: new Date(), permissionTypeId: tipo!.id },
    { userId: ids.sinErp, orgId: o.id, role: "employee", acceptedAt: new Date() },
  ]);
  return { orgId: o.id, ...ids };
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

describe("ERP inventario — checks", () => {
  it("WHEN una entrada trae cantidad negativa o una salida positiva THE SYSTEM SHALL rechazarla", async () => {
    const { orgId } = await org();
    const [p] = await db.insert(product).values({ orgId, name: "Harina" }).returning();
    await expect(db.insert(stockMove).values({ orgId, productId: p!.id, kind: "entrada", quantity: -3 })).rejects.toThrow();
    await expect(db.insert(stockMove).values({ orgId, productId: p!.id, kind: "salida", quantity: 2 })).rejects.toThrow();
    await db.insert(stockMove).values({ orgId, productId: p!.id, kind: "entrada", quantity: 5 });
  });

  it("WHEN dos productos del org repiten SKU THE SYSTEM SHALL rechazar el segundo; con SKU nulo, aceptar ambos", async () => {
    const { orgId } = await org();
    await db.insert(product).values({ orgId, name: "A", sku: "SKU-1" });
    await expect(db.insert(product).values({ orgId, name: "B", sku: "SKU-1" })).rejects.toThrow();
    await db.insert(product).values([
      { orgId, name: "C" },
      { orgId, name: "D" },
    ]);
  });
});

describe("ERP inventario — RLS", () => {
  it("WHEN consulta un empleado con erp = empresa THE SYSTEM SHALL ver su org; sin el permiso, 0 filas", async () => {
    const { orgId, conErp, sinErp } = await org();
    const [p] = await db.insert(product).values({ orgId, name: "Harina" }).returning();
    await db.insert(stockMove).values({ orgId, productId: p!.id, kind: "entrada", quantity: 5 });
    await db.insert(supplier).values({ orgId, name: "Molinos" });
    const q = (t: string) => `select id from ${t} where org_id = '${orgId}'`;
    for (const t of ["product", "stock_move", "supplier"]) {
      expect(await asUser(conErp, q(t))).toHaveLength(1);
      expect(await asUser(sinErp, q(t))).toHaveLength(0);
    }
  });
});
