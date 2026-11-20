// ERP v1 — órdenes de venta: nueva orden con líneas, confirmar (saca del inventario) y cancelar.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection, resolveSection } from "@/server/auth/guard.ts";
import { listClients } from "@/server/clients/mutations.ts";
import { listProducts } from "@/server/erp/inventory.ts";
import { cancelSaleOrder, confirmSaleOrder, createSaleOrder, listSaleOrders } from "@/server/erp/sales.ts";
import { field, money } from "@/lib/format.ts";

const LINEAS = 3;
const ESTADO: Record<string, string> = { borrador: "Borrador", confirmada: "Confirmada", entregada: "Entregada", cancelada: "Cancelada" };

function back(orgId: string, error?: string): never {
  revalidatePath(`/${orgId}/erp`, "layout");
  redirect(`/${orgId}/erp/ventas${error ? `?error=${encodeURIComponent(error)}` : ""}`);
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
  const clientId = field(formData, "clientId");
  const res = await createSaleOrder(userId, orgId, { clientId: clientId || undefined, lines });
  back(orgId, res.ok ? undefined : res.error.message);
}

async function confirmar(formData: FormData) {
  "use server";
  const userId = await sesion();
  const orgId = field(formData, "orgId");
  const res = await confirmSaleOrder(userId, orgId, field(formData, "orderId"));
  back(orgId, res.ok ? undefined : res.error.message);
}

async function cancelar(formData: FormData) {
  "use server";
  const userId = await sesion();
  const orgId = field(formData, "orgId");
  const res = await cancelSaleOrder(userId, orgId, field(formData, "orderId"));
  back(orgId, res.ok ? undefined : res.error.message);
}

export default async function VentasPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const { membership } = await requireSection(orgId, "erp");
  const userId = membership.userId;
  const [ordenes, productos, clientes] = await Promise.all([
    listSaleOrders(userId, orgId),
    listProducts(userId, orgId),
    // Los nombres de clientes solo para quien también ve la sección de clientes.
    resolveSection(userId, orgId, "clientes").then((r) => (r.scope === "ninguno" ? null : listClients(userId, orgId, { limit: 100 }))),
  ]);
  const listaProductos = productos.ok ? productos.data.filter((p) => p.active) : [];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Ventas</h1>
      <nav aria-label="ERP" className="flex gap-3">
        <Link href={`/${orgId}/erp`} className="jpc-back-link">
          Inventario
        </Link>
        <Link href={`/${orgId}/erp/compras`} className="jpc-back-link">
          Compras
        </Link>
      </nav>
      {error && <p role="alert">{error}</p>}

      <section aria-labelledby="ordenes" className="space-y-3">
        <h2 id="ordenes" className="text-lg font-semibold">
          Órdenes de venta
        </h2>
        {ordenes.ok && ordenes.data.length ? (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col">Número</th>
                <th scope="col">Cliente</th>
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
                  <td>{o.clientName ?? "—"}</td>
                  <td className="config-amount">{money(o.totalCents)}</td>
                  <td>{ESTADO[o.status] ?? o.status}</td>
                  <td>
                    {o.status === "borrador" && (
                      <div className="flex gap-2">
                        <form action={confirmar}>
                          <input type="hidden" name="orgId" value={orgId} />
                          <input type="hidden" name="orderId" value={o.id} />
                          <button type="submit" className="jpc-back-link">
                            Confirmar orden {o.number}
                          </button>
                        </form>
                        <form action={cancelar}>
                          <input type="hidden" name="orgId" value={orgId} />
                          <input type="hidden" name="orderId" value={o.id} />
                          <button type="submit" className="jpc-back-link">
                            Cancelar orden {o.number}
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Todavía no hay órdenes de venta.</p>
        )}
      </section>

      <section aria-labelledby="nueva" className="space-y-3">
        <h2 id="nueva" className="text-lg font-semibold">
          Nueva orden de venta
        </h2>
        {listaProductos.length ? (
          <form action={nuevaOrden} className="space-y-3">
            <input type="hidden" name="orgId" value={orgId} />
            {clientes?.ok && (
              <label className="block">
                Cliente (opcional)
                <select name="clientId" defaultValue="" className="block">
                  <option value="">Sin cliente</option>
                  {clientes.data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {Array.from({ length: LINEAS }, (_, i) => (
              <fieldset key={i} className="flex flex-wrap gap-3">
                <legend>Línea {i + 1}</legend>
                <label>
                  Producto de la línea {i + 1}
                  <select name={`line-${i}-product`} defaultValue="" className="block">
                    <option value="">—</option>
                    {listaProductos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({money(p.priceCents)})
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
              Crear orden de venta
            </button>
          </form>
        ) : (
          <p>Da de alta un producto en Inventario para poder vender.</p>
        )}
      </section>
    </main>
  );
}
