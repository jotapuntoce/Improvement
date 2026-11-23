// Órdenes de venta y compra (oficinas-digitales paso 27): totales, confirmación atómica y recepción.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, membership, organization, product, profile, saleOrder, stockMove, supplier } from "@jotapuntoce/db/schema";
import { listProducts, recordMove } from "../server/erp/inventory.ts";
import { confirmPurchaseOrder, createPurchaseOrder, receivePurchaseOrder } from "../server/erp/purchases.ts";
import { confirmSaleOrder, createSaleOrder } from "../server/erp/sales.ts";

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
  const owner = crypto.randomUUID();
  await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
  profileIds.push(owner);
  await db.insert(membership).values({ userId: owner, orgId: o.id, role: "owner", acceptedAt: new Date() });
  const [a, b] = await db
    .insert(product)
    .values([
      { orgId: o.id, name: "Pan", priceCents: 1500, costCents: 600 },
      { orgId: o.id, name: "Pastel", priceCents: 2000, costCents: 900 },
    ])
    .returning();
  return { orgId: o.id, owner, a: a!.id, b: b!.id };
}

const stockOf = async (owner: string, orgId: string, productId: string) => {
  const list = await listProducts(owner, orgId);
  return list.ok ? list.data.find((p) => p.id === productId)?.stock : undefined;
};

describe("ventas", () => {
  it("WHEN se crea con 3×1500 y 1×2000 THE SYSTEM SHALL guardar 6500 en borrador con folio 1", async () => {
    const o = await org();
    const res = await createSaleOrder(o.owner, o.orgId, { lines: [{ productId: o.a, quantity: 3 }, { productId: o.b, quantity: 1 }] });
    expect(res).toMatchObject({ ok: true, data: { totalCents: 6500, status: "borrador", number: 1 } });
  });

  it("WHEN se confirma con existencia THE SYSTEM SHALL pasar a confirmada y bajar la existencia", async () => {
    const o = await org();
    await recordMove(o.owner, o.orgId, { productId: o.a, kind: "entrada", quantity: 10 });
    await recordMove(o.owner, o.orgId, { productId: o.b, kind: "entrada", quantity: 2 });
    const so = await createSaleOrder(o.owner, o.orgId, { lines: [{ productId: o.a, quantity: 3 }, { productId: o.b, quantity: 1 }] });
    if (!so.ok) throw new Error(so.error.message);
    expect(await confirmSaleOrder(o.owner, o.orgId, so.data.id)).toMatchObject({ ok: true, data: { status: "confirmada" } });
    expect(await stockOf(o.owner, o.orgId, o.a)).toBe(7);
    expect(await stockOf(o.owner, o.orgId, o.b)).toBe(1);
  });

  it("WHEN una línea no alcanza THE SYSTEM SHALL decirlo sin escribir ningún movimiento de la orden", async () => {
    const o = await org();
    await recordMove(o.owner, o.orgId, { productId: o.a, kind: "entrada", quantity: 10 });
    const so = await createSaleOrder(o.owner, o.orgId, { lines: [{ productId: o.a, quantity: 3 }, { productId: o.b, quantity: 1 }] });
    if (!so.ok) throw new Error(so.error.message);
    expect(await confirmSaleOrder(o.owner, o.orgId, so.data.id)).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Sin existencia suficiente." },
    });
    expect(await db.select().from(stockMove).where(eq(stockMove.saleOrderId, so.data.id))).toHaveLength(0);
    const [row] = await db.select().from(saleOrder).where(eq(saleOrder.id, so.data.id));
    expect(row?.status).toBe("borrador");
  });

  it("WHEN el cliente es de otro org THE SYSTEM SHALL dar VALIDATION_ERROR sin escribir", async () => {
    const o = await org();
    const otro = await org();
    const [c] = await db.insert(client).values({ orgId: otro.orgId, name: "Ajeno" }).returning();
    expect(await createSaleOrder(o.owner, o.orgId, { clientId: c!.id, lines: [{ productId: o.a, quantity: 1 }] })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await db.select().from(saleOrder).where(eq(saleOrder.orgId, o.orgId))).toHaveLength(0);
  });
});

describe("compras", () => {
  it("WHEN se recibe una orden de 5 piezas THE SYSTEM SHALL subir la existencia en 5 y dejarla recibida", async () => {
    const o = await org();
    const [s] = await db.insert(supplier).values({ orgId: o.orgId, name: "Molinos" }).returning();
    const po = await createPurchaseOrder(o.owner, o.orgId, { supplierId: s!.id, lines: [{ productId: o.a, quantity: 5 }] });
    if (!po.ok) throw new Error(po.error.message);
    expect(po.data.totalCents).toBe(3000);
    expect(await receivePurchaseOrder(o.owner, o.orgId, po.data.id)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect((await confirmPurchaseOrder(o.owner, o.orgId, po.data.id)).ok).toBe(true);
    expect(await receivePurchaseOrder(o.owner, o.orgId, po.data.id)).toMatchObject({ ok: true, data: { status: "recibida" } });
    expect(await stockOf(o.owner, o.orgId, o.a)).toBe(5);
  });
});
