// ERP v1 — órdenes de venta. Confirmar saca del inventario todo o nada. Mismo guard que inventory.ts.
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { client, deal, product, saleOrder, saleOrderLine, stockMove } from "@jotapuntoce/db/schema";
import { erpAccess, erpInvalid, erpNotFound, lockStock, SIN_EXISTENCIA } from "./inventory.ts";
import { firstIssue } from "../validation.ts";

const lineSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().int().min(1, "La cantidad es al menos 1."),
  unitPriceCents: z.coerce.number().int().min(0).optional(),
});

const createSchema = z.object({
  clientId: z.uuid().optional(),
  dealId: z.uuid().optional(),
  lines: z.array(lineSchema).min(1, "La orden lleva al menos una línea.").max(100),
});

export async function createSaleOrder(userId: string, orgId: string, input: unknown) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return erpInvalid(firstIssue(parsed.error));
  const { clientId, dealId, lines } = parsed.data;

  return db.transaction(async (tx) => {
    if (clientId && !(await tx.select({ id: client.id }).from(client).where(and(eq(client.id, clientId), eq(client.orgId, orgId)))).length) {
      return erpInvalid("Ese cliente no es de esta empresa.");
    }
    if (dealId && !(await tx.select({ id: deal.id }).from(deal).where(and(eq(deal.id, dealId), eq(deal.orgId, orgId)))).length) {
      return erpInvalid("Esa oportunidad no es de esta empresa.");
    }
    const productIds = [...new Set(lines.map((l) => l.productId))];
    const products = await tx
      .select({ id: product.id, priceCents: product.priceCents })
      .from(product)
      .where(and(eq(product.orgId, orgId), inArray(product.id, productIds)));
    if (products.length !== productIds.length) return erpInvalid("Un producto no es de esta empresa.");
    const price = new Map(products.map((p) => [p.id, p.priceCents]));
    const priced = lines.map((l) => ({ ...l, unitPriceCents: l.unitPriceCents ?? price.get(l.productId)! }));

    // El único (org, number) protege de dos órdenes simultáneas con el mismo folio.
    const [{ last } = { last: 0 }] = await tx.select({ last: max(saleOrder.number) }).from(saleOrder).where(eq(saleOrder.orgId, orgId));
    const [order] = await tx
      .insert(saleOrder)
      .values({
        orgId,
        number: (last ?? 0) + 1,
        clientId: clientId ?? null,
        dealId: dealId ?? null,
        totalCents: priced.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0),
        createdBy: userId,
      })
      .returning();
    await tx.insert(saleOrderLine).values(priced.map((l) => ({ orgId, saleOrderId: order!.id, ...l })));
    return { ok: true as const, data: order! };
  });
}

export async function confirmSaleOrder(userId: string, orgId: string, orderId: string) {
  if (!(await erpAccess(userId, orgId)) || !z.uuid().safeParse(orderId).success) return erpNotFound;
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: saleOrder.status })
      .from(saleOrder)
      .where(and(eq(saleOrder.id, orderId), eq(saleOrder.orgId, orgId)))
      .for("update");
    if (!order) return erpNotFound;
    if (order.status !== "borrador") return erpInvalid("Solo se confirma una orden en borrador.");
    const lines = await tx.select().from(saleOrderLine).where(eq(saleOrderLine.saleOrderId, orderId));
    const needed = new Map<string, number>();
    for (const l of lines) needed.set(l.productId, (needed.get(l.productId) ?? 0) + l.quantity);
    const stock = await lockStock(tx, orgId, [...needed.keys()]);
    for (const [productId, qty] of needed) if ((stock.get(productId) ?? 0) < qty) return erpInvalid(SIN_EXISTENCIA);

    await tx.insert(stockMove).values(
      lines.map((l) => ({ orgId, productId: l.productId, kind: "salida" as const, quantity: -l.quantity, saleOrderId: orderId, createdBy: userId })),
    );
    const [updated] = await tx
      .update(saleOrder)
      .set({ status: "confirmada", confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(saleOrder.id, orderId))
      .returning();
    return { ok: true as const, data: updated! };
  });
}

export async function cancelSaleOrder(userId: string, orgId: string, orderId: string) {
  if (!(await erpAccess(userId, orgId)) || !z.uuid().safeParse(orderId).success) return erpNotFound;
  const [updated] = await db
    .update(saleOrder)
    .set({ status: "cancelada", updatedAt: new Date() })
    .where(and(eq(saleOrder.id, orderId), eq(saleOrder.orgId, orgId), eq(saleOrder.status, "borrador")))
    .returning();
  if (updated) return { ok: true as const, data: updated };
  const [exists] = await db.select({ id: saleOrder.id }).from(saleOrder).where(and(eq(saleOrder.id, orderId), eq(saleOrder.orgId, orgId)));
  return exists ? erpInvalid("Solo se cancela una orden en borrador.") : erpNotFound;
}

export async function listSaleOrders(userId: string, orgId: string) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const data = await db
    .select({
      id: saleOrder.id,
      number: saleOrder.number,
      status: saleOrder.status,
      totalCents: saleOrder.totalCents,
      currency: saleOrder.currency,
      clientId: saleOrder.clientId,
      clientName: client.name,
      createdAt: saleOrder.createdAt,
    })
    .from(saleOrder)
    .leftJoin(client, eq(client.id, saleOrder.clientId))
    .where(eq(saleOrder.orgId, orgId))
    .orderBy(desc(saleOrder.number));
  return { ok: true as const, data };
}
