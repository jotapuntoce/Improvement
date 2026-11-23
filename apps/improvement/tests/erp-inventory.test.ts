// Motor de inventario (oficinas-digitales paso 26): existencia calculada, negativo, ajuste y permisos.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile, stockMove } from "@jotapuntoce/db/schema";
import { createProduct, createSupplier, listProducts, listSuppliers, recordMove } from "../server/erp/inventory.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-inv", slug: `t-inv-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const ids = { owner: crypto.randomUUID(), conErp: crypto.randomUUID(), sinErp: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  const [tipo] = await db.insert(permissionType).values({ orgId: o.id, name: "ERP", grants: { erp: "empresa" } }).returning();
  await db.insert(membership).values([
    { userId: ids.owner, orgId: o.id, role: "owner", acceptedAt: new Date() },
    { userId: ids.conErp, orgId: o.id, role: "employee", acceptedAt: new Date(), permissionTypeId: tipo!.id },
    { userId: ids.sinErp, orgId: o.id, role: "employee", acceptedAt: new Date() },
  ]);
  return { orgId: o.id, ...ids };
}

async function producto(userId: string, orgId: string) {
  const res = await createProduct(userId, orgId, { name: "Harina", sku: "HAR-1", priceCents: 2500 });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.id;
}

describe("inventario", () => {
  it("WHEN entra 10 y sale 4 THE SYSTEM SHALL listar existencia 6", async () => {
    const o = await org();
    const productId = await producto(o.conErp, o.orgId);
    expect((await recordMove(o.conErp, o.orgId, { productId, kind: "entrada", quantity: 10 })).ok).toBe(true);
    expect((await recordMove(o.conErp, o.orgId, { productId, kind: "salida", quantity: -4 })).ok).toBe(true);
    const list = await listProducts(o.conErp, o.orgId);
    expect(list).toMatchObject({ ok: true, data: [{ id: productId, stock: 6 }] });
  });

  it("WHEN una salida deja la existencia negativa THE SYSTEM SHALL rechazarla sin escribir", async () => {
    const o = await org();
    const productId = await producto(o.owner, o.orgId);
    await recordMove(o.owner, o.orgId, { productId, kind: "entrada", quantity: 2 });
    expect(await recordMove(o.owner, o.orgId, { productId, kind: "salida", quantity: -3 })).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Sin existencia suficiente." },
    });
    expect(await db.select().from(stockMove).where(eq(stockMove.productId, productId))).toHaveLength(1);
  });

  it("WHEN un empleado con erp registra un ajuste THE SYSTEM SHALL dar NOT_FOUND; el dueño sí puede", async () => {
    const o = await org();
    const productId = await producto(o.owner, o.orgId);
    expect(await recordMove(o.conErp, o.orgId, { productId, kind: "ajuste", quantity: 5 })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect((await recordMove(o.owner, o.orgId, { productId, kind: "ajuste", quantity: 5 })).ok).toBe(true);
  });

  it("WHEN un empleado sin erp lista o crea THE SYSTEM SHALL dar NOT_FOUND", async () => {
    const o = await org();
    expect(await listProducts(o.sinErp, o.orgId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await createSupplier(o.sinErp, o.orgId, { name: "Molinos" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await listProducts(crypto.randomUUID(), o.orgId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("WHEN se repite el SKU THE SYSTEM SHALL decirlo; proveedores se crean y listan", async () => {
    const o = await org();
    await producto(o.owner, o.orgId);
    expect(await createProduct(o.owner, o.orgId, { name: "Otra", sku: "HAR-1" })).toMatchObject({
      ok: false,
      error: { message: "Ya existe un producto con ese SKU." },
    });
    expect((await createSupplier(o.owner, o.orgId, { name: "Molinos", email: "ventas@molinos.mx" })).ok).toBe(true);
    expect(await listSuppliers(o.owner, o.orgId)).toMatchObject({ ok: true, data: [{ name: "Molinos" }] });
  });
});
