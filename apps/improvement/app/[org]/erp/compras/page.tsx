// ERP v1 — órdenes de compra: nueva, confirmar y recibir (mete al inventario). Sin CFDI.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { listProducts, listSuppliers } from "@/server/erp/inventory.ts";
import { confirmPurchaseOrder, createPurchaseOrder, listPurchaseOrders, receivePurchaseOrder } from "@/server/erp/purchases.ts";

const LINEAS = 3;
const ESTADO: Record<string, string> = { borrador: "Borrador", confirmada: "Confirmada", recibida: "Recibida", cancelada: "Cancelada" };
const field = (formData: FormData, name: string) => formData.get(name)?.toString().trim() ?? "";
const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);

function back(orgId: string, error?: string): never {
  revalidatePath(`/${orgId}/erp`, "layout");
  redirect(`/${orgId}/erp/compras${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

async function sesion() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return userId;
}

async function nuevaOrden(formData: FormData) {
  "use server";
  const userId = await sesion();
  const orgId = field(formData, "orgId");
  const lines = Array.from({ length: LINEAS }, (_, i) => ({
    productId: field(formData, `line-${i}-product`),
    quantity: Number(field(formData, `line-${i}-quantity`)),
  })).filter((l) => l.productId && l.quantity > 0);
  const res = await createPurchaseOrder(userId, orgId, { supplierId: field(formData, "supplierId"), lines });
  back(orgId, res.ok ? undefined : res.error.message);
}

async function confirmar(formData: FormData) {
  "use server";
  const userId = await sesion();
  const orgId = field(formData, "orgId");
  const res = await confirmPurchaseOrder(userId, orgId, field(formData, "orderId"));
  back(orgId, res.ok ? undefined : res.error.message);
}

async function recibir(formData: FormData) {
  "use server";
  const userId = await sesion();
  const orgId = field(formData, "orgId");
  const res = await receivePurchaseOrder(userId, orgId, field(formData, "orderId"));
  back(orgId, res.ok ? undefined : res.error.message);
}

export default async function ComprasPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const { membership } = await requireSection(orgId, "erp");
  const userId = membership.userId;
  const [ordenes, productos, proveedores] = await Promise.all([
    listPurchaseOrders(userId, orgId),
    listProducts(userId, orgId),
    listSuppliers(userId, orgId),
  ]);
  const listaProductos = productos.ok ? productos.data.filter((p) => p.active) : [];
  const listaProveedores = proveedores.ok ? proveedores.data : [];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Compras</h1>
      <nav aria-label="ERP" className="flex gap-3">
        <Link href={`/${orgId}/erp`} className="jpc-back-link">
          Inventario
        </Link>
        <Link href={`/${orgId}/erp/ventas`} className="jpc-back-link">
          Ventas
        </Link>
      </nav>
      {error && <p role="alert">{error}</p>}

      <section aria-labelledby="ordenes" className="space-y-3">
        <h2 id="ordenes" className="text-lg font-semibold">
          Órdenes de compra
        </h2>
        {ordenes.ok && ordenes.data.length ? (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col">Número</th>
                <th scope="col">Proveedor</th>
                <th scope="col">Total</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.data.map((o) => (
                <tr key={o.id}>
                  <th scope="row" className="config-amount">
                    {o.number}
                  </th>
                  <td>{o.supplierName}</td>
                  <td className="config-amount">{money(o.totalCents)}</td>
                  <td>{ESTADO[o.status] ?? o.status}</td>
                  <td>
                    {(o.status === "borrador" || o.status === "confirmada") && (
                      <form action={o.status === "borrador" ? confirmar : recibir}>
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="orderId" value={o.id} />
                        <button type="submit" className="jpc-back-link">
                          {o.status === "borrador" ? "Confirmar" : "Recibir"} orden {o.number}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Todavía no hay órdenes de compra.</p>
        )}
      </section>

      <section aria-labelledby="nueva" className="space-y-3">
        <h2 id="nueva" className="text-lg font-semibold">
          Nueva orden de compra
        </h2>
        {listaProductos.length && listaProveedores.length ? (
          <form action={nuevaOrden} className="space-y-3">
            <input type="hidden" name="orgId" value={orgId} />
            <label className="block">
              Proveedor
              <select name="supplierId" required className="block">
                {listaProveedores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {Array.from({ length: LINEAS }, (_, i) => (
              <fieldset key={i} className="flex flex-wrap gap-3">
                <legend>Línea {i + 1}</legend>
                <label>
                  Producto de la línea {i + 1}
                  <select name={`line-${i}-product`} defaultValue="" className="block">
                    <option value="">—</option>
                    {listaProductos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cantidad de la línea {i + 1}
                  <input name={`line-${i}-quantity`} type="number" min="1" step="1" className="block" />
                </label>
              </fieldset>
            ))}
            <button type="submit" className="jpc-back-link">
              Crear orden de compra
            </button>
          </form>
        ) : (
          <p>Necesitas al menos un producto y un proveedor en Inventario para comprar.</p>
        )}
      </section>
    </main>
  );
}
