// ERP v1 — órdenes de compra. Recibir mete al inventario una entrada por línea. Sin CFDI: ningún folio
// fiscal ni timbrado. Mismo guard que inventory.ts.
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { product, purchaseOrder, purchaseOrderLine, stockMove, supplier } from "@jotapuntoce/db/schema";
import { erpAccess, erpInvalid, erpNotFound } from "./inventory.ts";

const createSchema = z.object({
  supplierId: z.uuid("Elige un proveedor."),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.coerce.number().int().min(1, "La cantidad es al menos 1."),
        unitCostCents: z.coerce.number().int().min(0).optional(),
      }),
    )
    .min(1, "La orden lleva al menos una línea.")
    .max(100),
});

export async function createPurchaseOrder(userId: string, orgId: string, input: unknown) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return erpInvalid(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const { supplierId, lines } = parsed.data;

  return db.transaction(async (tx) => {
    if (!(await tx.select({ id: supplier.id }).from(supplier).where(and(eq(supplier.id, supplierId), eq(supplier.orgId, orgId)))).length) {
      return erpInvalid("Ese proveedor no es de esta empresa.");
    }
    const productIds = [...new Set(lines.map((l) => l.productId))];
    const products = await tx
      .select({ id: product.id, costCents: product.costCents })
      .from(product)
      .where(and(eq(product.orgId, orgId), inArray(product.id, productIds)));
    if (products.length !== productIds.length) return erpInvalid("Un producto no es de esta empresa.");
    const cost = new Map(products.map((p) => [p.id, p.costCents]));
    const priced = lines.map((l) => ({ ...l, unitCostCents: l.unitCostCents ?? cost.get(l.productId)! }));

    const [{ last } = { last: 0 }] = await tx
      .select({ last: max(purchaseOrder.number) })
      .from(purchaseOrder)
      .where(eq(purchaseOrder.orgId, orgId));
    const [order] = await tx
      .insert(purchaseOrder)
      .values({
        orgId,
        number: (last ?? 0) + 1,
        supplierId,
        totalCents: priced.reduce((s, l) => s + l.quantity * l.unitCostCents, 0),
        createdBy: userId,
      })
      .returning();
    await tx.insert(purchaseOrderLine).values(priced.map((l) => ({ orgId, purchaseOrderId: order!.id, ...l })));
    return { ok: true as const, data: order! };
  });
}

async function move(userId: string, orgId: string, orderId: string, from: "borrador" | "confirmada") {
  if (!(await erpAccess(userId, orgId)) || !z.uuid().safeParse(orderId).success) return erpNotFound;
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: purchaseOrder.status })
      .from(purchaseOrder)
      .where(and(eq(purchaseOrder.id, orderId), eq(purchaseOrder.orgId, orgId)))
      .for("update");
    if (!order) return erpNotFound;
    if (order.status !== from) {
      return erpInvalid(from === "borrador" ? "Solo se confirma una orden en borrador." : "Solo se recibe una orden confirmada.");
    }
    const now = new Date();
    if (from === "confirmada") {
      const lines = await tx.select().from(purchaseOrderLine).where(eq(purchaseOrderLine.purchaseOrderId, orderId));
      await tx.insert(stockMove).values(
        lines.map((l) => ({ orgId, productId: l.productId, kind: "entrada" as const, quantity: l.quantity, purchaseOrderId: orderId, createdBy: userId })),
      );
    }
    const [updated] = await tx
      .update(purchaseOrder)
      .set(from === "borrador" ? { status: "confirmada", confirmedAt: now, updatedAt: now } : { status: "recibida", receivedAt: now, updatedAt: now })
      .where(eq(purchaseOrder.id, orderId))
      .returning();
    return { ok: true as const, data: updated! };
  });
}

export const confirmPurchaseOrder = (userId: string, orgId: string, orderId: string) => move(userId, orgId, orderId, "borrador");
export const receivePurchaseOrder = (userId: string, orgId: string, orderId: string) => move(userId, orgId, orderId, "confirmada");

export async function listPurchaseOrders(userId: string, orgId: string) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const data = await db
    .select({
      id: purchaseOrder.id,
      number: purchaseOrder.number,
      status: purchaseOrder.status,
      totalCents: purchaseOrder.totalCents,
      currency: purchaseOrder.currency,
      supplierName: supplier.name,
      createdAt: purchaseOrder.createdAt,
    })
    .from(purchaseOrder)
    .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .where(eq(purchaseOrder.orgId, orgId))
    .orderBy(desc(purchaseOrder.number));
  return { ok: true as const, data };
}
