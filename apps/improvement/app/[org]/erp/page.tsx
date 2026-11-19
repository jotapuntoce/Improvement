// ERP v1 — inventario: productos con existencia (suma de movimientos), entradas y salidas, proveedores.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireSection } from "@/server/auth/guard.ts";
import { createProduct, createSupplier, listProducts, listSuppliers, recordMove } from "@/server/erp/inventory.ts";

const field = (formData: FormData, name: string) => formData.get(name)?.toString().trim() ?? "";
const toCents = (pesos: string) => (pesos ? Math.round(Number(pesos) * 100) : 0);
const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);

function back(orgId: string, error?: string): never {
  revalidatePath(`/${orgId}/erp`);
  redirect(`/${orgId}/erp${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

async function sesion() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return userId;
}

async function nuevoProducto(formData: FormData) {
  "use server";
  const userId = await sesion();
  const orgId = field(formData, "orgId");
  const res = await createProduct(userId, orgId, {
    name: field(formData, "name"),
    sku: field(formData, "sku"),
    unit: field(formData, "unit") || "pieza",
    priceCents: toCents(field(formData, "price")),
    costCents: toCents(field(formData, "cost")),
  });
  back(orgId, res.ok ? undefined : res.error.message);
}

async function movimiento(formData: FormData) {
  "use server";
  const userId = await sesion();
  const orgId = field(formData, "orgId");
  const kind = field(formData, "kind");
  const n = Number(field(formData, "quantity"));
  // La persona escribe cuántas piezas; el signo lo pone el tipo (un ajuste lleva el suyo).
  const quantity = kind === "salida" ? -Math.abs(n) : kind === "entrada" ? Math.abs(n) : n;
  const res = await recordMove(userId, orgId, { productId: field(formData, "productId"), kind, quantity, note: field(formData, "note") });
  back(orgId, res.ok ? undefined : res.error.message);
}

async function nuevoProveedor(formData: FormData) {
  "use server";
  const userId = await sesion();
  const orgId = field(formData, "orgId");
  const res = await createSupplier(userId, orgId, { name: field(formData, "name"), email: field(formData, "email"), phone: field(formData, "phone") });
  back(orgId, res.ok ? undefined : res.error.message);
}

export default async function ErpPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const { membership } = await requireSection(orgId, "erp");
  const userId = membership.userId;
  const [productos, proveedores] = await Promise.all([listProducts(userId, orgId), listSuppliers(userId, orgId)]);
  const lista = productos.ok ? productos.data : [];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Inventario</h1>
      <nav aria-label="ERP" className="flex gap-3">
        <Link href={`/${orgId}/erp/ventas`} className="jpc-back-link">
          Ventas
        </Link>
        <Link href={`/${orgId}/erp/compras`} className="jpc-back-link">
          Compras
        </Link>
      </nav>
      {error && <p role="alert">{error}</p>}

      <section aria-labelledby="productos" className="space-y-3">
        <h2 id="productos" className="text-lg font-semibold">
          Productos
        </h2>
        {lista.length ? (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">SKU</th>
                <th scope="col">Unidad</th>
                <th scope="col">Precio</th>
                <th scope="col">Existencia</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.name}</th>
                  <td>{p.sku ?? "—"}</td>
                  <td>{p.unit}</td>
                  <td className="config-amount">{money(p.priceCents)}</td>
                  <td className="config-amount" data-stock>
                    {p.stock}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Todavía no hay productos.</p>
        )}

        <form action={nuevoProducto} className="grid gap-2 sm:grid-cols-5">
          <input type="hidden" name="orgId" value={orgId} />
          <label>
            Nombre del producto
            <input name="name" required maxLength={120} className="block w-full" />
          </label>
          <label>
            SKU (opcional)
            <input name="sku" maxLength={60} className="block w-full" />
          </label>
          <label>
            Unidad
            <input name="unit" defaultValue="pieza" maxLength={30} className="block w-full" />
          </label>
          <label>
            Precio (MXN)
            <input name="price" type="number" min="0" step="0.01" className="block w-full" />
          </label>
          <label>
            Costo (MXN)
            <input name="cost" type="number" min="0" step="0.01" className="block w-full" />
          </label>
          <button type="submit" className="jpc-back-link">
            Agregar producto
          </button>
        </form>
      </section>

      {lista.length > 0 && (
        <section aria-labelledby="movimiento" className="space-y-3">
          <h2 id="movimiento" className="text-lg font-semibold">
            Registrar movimiento
          </h2>
          <form action={movimiento} className="grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="orgId" value={orgId} />
            <label>
              Producto
              <select name="productId" required className="block w-full">
                {lista.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select name="kind" className="block w-full">
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
                {membership.role === "owner" && <option value="ajuste">Ajuste</option>}
              </select>
            </label>
            <label>
              Cantidad
              <input name="quantity" type="number" step="1" required className="block w-full" />
            </label>
            <label>
              Nota (opcional)
              <input name="note" maxLength={500} className="block w-full" />
            </label>
            <button type="submit" className="jpc-back-link">
              Registrar
            </button>
          </form>
        </section>
      )}

      <section aria-labelledby="proveedores" className="space-y-3">
        <h2 id="proveedores" className="text-lg font-semibold">
          Proveedores
        </h2>
        {proveedores.ok && proveedores.data.length ? (
          <ul>
            {proveedores.data.map((s) => (
              <li key={s.id}>
                {s.name}
                {s.email ? ` · ${s.email}` : ""}
                {s.phone ? ` · ${s.phone}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>Todavía no hay proveedores.</p>
        )}
        <form action={nuevoProveedor} className="grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="orgId" value={orgId} />
          <label>
            Nombre del proveedor
            <input name="name" required maxLength={120} className="block w-full" />
          </label>
          <label>
            Correo (opcional)
            <input name="email" type="email" className="block w-full" />
          </label>
          <label>
            Teléfono (opcional)
            <input name="phone" maxLength={40} className="block w-full" />
          </label>
          <button type="submit" className="jpc-back-link">
            Agregar proveedor
          </button>
        </form>
      </section>
    </main>
  );
}
