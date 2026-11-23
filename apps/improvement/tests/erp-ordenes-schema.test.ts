// sale_order(_line) y purchase_order(_line): checks, restrict de producto, folio único y RLS por la
// sección `erp` contra el Supabase de desarrollo (patrón asUser de tests/canal-schema.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  membership,
  organization,
  product,
  profile,
  purchaseOrder,
  saleOrder,
  saleOrderLine,
  supplier,
} from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-ordenes", slug: `t-ordenes-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const ids = { owner: crypto.randomUUID(), sinErp: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  await db.insert(membership).values([
    { userId: ids.owner, orgId: o.id, role: "owner", acceptedAt: new Date() },
    { userId: ids.sinErp, orgId: o.id, role: "employee", acceptedAt: new Date() },
  ]);
  const [p] = await db.insert(product).values({ orgId: o.id, name: "Harina" }).returning();
  return { orgId: o.id, productId: p!.id, ...ids };
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

describe("ERP órdenes — checks", () => {
  it("WHEN una línea de venta trae cantidad 0 THE SYSTEM SHALL rechazarla", async () => {
    const { orgId, productId } = await org();
    const [so] = await db.insert(saleOrder).values({ orgId, number: 1 }).returning();
    await expect(db.insert(saleOrderLine).values({ orgId, saleOrderId: so!.id, productId, quantity: 0, unitPriceCents: 100 })).rejects.toThrow();
  });

  it("WHEN se borra un producto con línea de venta THE SYSTEM SHALL rechazar el borrado", async () => {
    const { orgId, productId } = await org();
    const [so] = await db.insert(saleOrder).values({ orgId, number: 1 }).returning();
    await db.insert(saleOrderLine).values({ orgId, saleOrderId: so!.id, productId, quantity: 2, unitPriceCents: 100 });
    await expect(db.delete(product).where(eq(product.id, productId))).rejects.toThrow();
  });

  it("WHEN dos órdenes de venta del org repiten número THE SYSTEM SHALL rechazar la segunda", async () => {
    const { orgId } = await org();
    await db.insert(saleOrder).values({ orgId, number: 7 });
    await expect(db.insert(saleOrder).values({ orgId, number: 7 })).rejects.toThrow();
  });
});

describe("ERP órdenes — RLS", () => {
  it("WHEN consulta un empleado sin erp THE SYSTEM SHALL dar 0 filas; el dueño ve las de su org", async () => {
    const { orgId, owner, sinErp } = await org();
    const [s] = await db.insert(supplier).values({ orgId, name: "Molinos" }).returning();
    await db.insert(purchaseOrder).values({ orgId, number: 1, supplierId: s!.id });
    const q = `select id from purchase_order where org_id = '${orgId}'`;
    expect(await asUser(sinErp, q)).toHaveLength(0);
    expect(await asUser(owner, q)).toHaveLength(1);
  });
});
