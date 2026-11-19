// ERP v1 — inventario y proveedores. La existencia nunca se guarda: es la suma de los movimientos.
// Todo exige la sección `erp` = empresa (el dueño siempre); si no, NOT_FOUND.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { product, STOCK_MOVE_KINDS, stockMove, supplier } from "@jotapuntoce/db/schema";
import { findMembership, resolveSection } from "../auth/guard.ts";

export type ErpFailure = { ok: false; error: { code: "NOT_FOUND" | "VALIDATION_ERROR"; message: string } };
export const erpNotFound: ErpFailure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };
export const erpInvalid = (message: string): ErpFailure => ({ ok: false, error: { code: "VALIDATION_ERROR", message } });
export const SIN_EXISTENCIA = "Sin existencia suficiente.";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** La membresía si la persona tiene `erp` = empresa; si no, null. Nunca lanza (resolveSection sí, sin membresía). */
export async function erpAccess(userId: string, orgId: string) {
  if (!z.uuid().safeParse(orgId).success || !(await findMembership(userId, orgId))) return null;
  const { membership, scope } = await resolveSection(userId, orgId, "erp");
  return scope === "empresa" ? membership : null;
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos.";
const isUniqueViolation = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string })?.code === "23505";

const productSchema = z.object({
  name: z.string().trim().min(1, "El producto lleva nombre.").max(120),
  sku: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((s) => s || null),
  unit: z.string().trim().min(1).max(30).default("pieza"),
  priceCents: z.coerce.number().int().min(0, "El precio no puede ser negativo.").default(0),
  costCents: z.coerce.number().int().min(0, "El costo no puede ser negativo.").default(0),
});

export async function createProduct(userId: string, orgId: string, input: unknown) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return erpInvalid(firstIssue(parsed.error));
  try {
    const [row] = await db.insert(product).values({ orgId, ...parsed.data }).returning();
    return { ok: true as const, data: row! };
  } catch (e) {
    if (isUniqueViolation(e)) return erpInvalid("Ya existe un producto con ese SKU.");
    throw e;
  }
}

const productUpdateSchema = productSchema.partial().extend({ active: z.boolean().optional() });

export async function updateProduct(userId: string, orgId: string, productId: string, input: unknown) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const parsed = productUpdateSchema.safeParse(input);
  if (!parsed.success) return erpInvalid(firstIssue(parsed.error));
  try {
    const [row] = await db
      .update(product)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(product.id, productId), eq(product.orgId, orgId)))
      .returning();
    return row ? { ok: true as const, data: row } : erpNotFound;
  } catch (e) {
    if (isUniqueViolation(e)) return erpInvalid("Ya existe un producto con ese SKU.");
    throw e;
  }
}

export async function listProducts(userId: string, orgId: string) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const data = await db
    .select({
      id: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      priceCents: product.priceCents,
      costCents: product.costCents,
      active: product.active,
      stock: sql<number>`coalesce(sum(${stockMove.quantity}), 0)::int`,
    })
    .from(product)
    .leftJoin(stockMove, eq(stockMove.productId, product.id))
    .where(eq(product.orgId, orgId))
    .groupBy(product.id)
    .orderBy(asc(product.name));
  return { ok: true as const, data };
}

/**
 * Existencia de cada producto, con los productos bloqueados `for update` hasta el fin de la
 * transacción: dos salidas simultáneas no pueden pasar las dos con la misma existencia. Interna.
 */
export async function lockStock(tx: Tx, orgId: string, productIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(productIds)];
  if (!ids.length) return new Map();
  const locked = await tx
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.orgId, orgId), inArray(product.id, ids)))
    .for("update");
  const stock = new Map(locked.map((p) => [p.id, 0]));
  if (!stock.size) return stock;
  const sums = await tx
    .select({ productId: stockMove.productId, total: sql<number>`sum(${stockMove.quantity})::int` })
    .from(stockMove)
    .where(inArray(stockMove.productId, [...stock.keys()]))
    .groupBy(stockMove.productId);
  for (const s of sums) stock.set(s.productId, s.total);
  return stock;
}

const moveSchema = z
  .object({
    productId: z.uuid(),
    kind: z.enum(STOCK_MOVE_KINDS),
    quantity: z.coerce.number().int().refine((n) => n !== 0, "La cantidad no puede ser cero."),
    note: z.string().trim().max(500).optional(),
  })
  .refine((m) => m.kind === "ajuste" || (m.kind === "entrada" ? m.quantity > 0 : m.quantity < 0), {
    message: "Una entrada suma y una salida resta.",
  });

export async function recordMove(userId: string, orgId: string, input: unknown) {
  const m = await erpAccess(userId, orgId);
  if (!m) return erpNotFound;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return erpInvalid(firstIssue(parsed.error));
  const move = parsed.data;
  if (move.kind === "ajuste" && m.role !== "owner") return erpNotFound;

  return db.transaction(async (tx) => {
    const stock = await lockStock(tx, orgId, [move.productId]);
    const current = stock.get(move.productId);
    if (current === undefined) return erpNotFound;
    if (current + move.quantity < 0) return erpInvalid(SIN_EXISTENCIA);
    const [row] = await tx
      .insert(stockMove)
      .values({ orgId, productId: move.productId, kind: move.kind, quantity: move.quantity, note: move.note || null, createdBy: userId })
      .returning();
    return { ok: true as const, data: row! };
  });
}

const supplierSchema = z.object({
  name: z.string().trim().min(1, "El proveedor lleva nombre.").max(120),
  email: z
    .union([z.literal(""), z.email("Correo inválido.")])
    .optional()
    .transform((s) => s || null),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((s) => s || null),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((s) => s || null),
});

export async function createSupplier(userId: string, orgId: string, input: unknown) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return erpInvalid(firstIssue(parsed.error));
  const [row] = await db.insert(supplier).values({ orgId, ...parsed.data }).returning();
  return { ok: true as const, data: row! };
}

export async function listSuppliers(userId: string, orgId: string) {
  if (!(await erpAccess(userId, orgId))) return erpNotFound;
  const data = await db.select().from(supplier).where(eq(supplier.orgId, orgId)).orderBy(asc(supplier.name));
  return { ok: true as const, data };
}
