// ERP v1 de punta a punta contra el build de producción: producto, entrada, venta confirmada, compra
// recibida, 404 sin permiso y axe en las tres pantallas.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const USERS = {
  owner: { email: `erp-owner-${stamp}@example.com`, password: crypto.randomUUID(), name: "Dueña ERP" },
  sinPermiso: { email: `erp-sin-${stamp}@example.com`, password: crypto.randomUUID(), name: "Beto ERP" },
};
type Quien = keyof typeof USERS;

let orgId: string;
const ids: Record<Quien, string> = { owner: "", sinPermiso: "" };
const tokens: Record<Quien, string> = { owner: "", sinPermiso: "" };

test.beforeAll(async () => {
  for (const k of Object.keys(USERS) as Quien[]) ids[k] = await createTestAuthUser(USERS[k].email, USERS[k].password);
  const [org] = await db.insert(organization).values({ name: "ERP E2E", slug: `erp-e2e-${stamp}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values((Object.keys(USERS) as Quien[]).map((k) => ({ id: ids[k], email: USERS[k].email, fullName: USERS[k].name })));
  await db.insert(membership).values([
    { userId: ids.owner, orgId, role: "owner", acceptedAt: new Date() },
    { userId: ids.sinPermiso, orgId, role: "employee", acceptedAt: new Date() },
  ]);
  for (const k of Object.keys(USERS) as Quien[]) tokens[k] = await signInTestUser(USERS[k].email, USERS[k].password);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId)); // cascade
  for (const id of Object.values(ids)) {
    if (!id) continue;
    await db.delete(profile).where(eq(profile.id, id));
    await deleteTestAuthUser(id);
  }
});

async function as(context: BrowserContext, quien: Quien, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: tokens[quien], url: baseURL ?? "http://localhost:3200" }]);
}

// Cada acción del ERP escribe en una transacción contra la base remota: con la suite en paralelo pasa de 5 s.
const LENTO = { timeout: 20_000 };
const stockDe = (page: Page, producto: string) => page.getByRole("row", { name: new RegExp(producto) }).locator("[data-stock]");

test("WHEN el dueño da de alta, mete 10 y confirma una venta de 3 THE SYSTEM SHALL mostrar existencia 7", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  expect((await page.goto(`/${orgId}/erp`))?.status()).toBe(200);
  await page.getByLabel("Nombre del producto").fill("Harina");
  await page.getByLabel("Precio (MXN)").fill("25");
  await page.getByRole("button", { name: "Agregar producto" }).click();
  await expect(stockDe(page, "Harina")).toHaveText("0", LENTO);

  await page.getByLabel("Tipo").selectOption("entrada");
  await page.getByLabel("Cantidad").fill("10");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(stockDe(page, "Harina")).toHaveText("10", LENTO);

  await page.getByLabel("ERP", { exact: true }).getByRole("link", { name: "Ventas" }).click();
  await page.getByLabel("Producto de la línea 1").selectOption({ label: "Harina ($25.00)" });
  await page.getByLabel("Cantidad de la línea 1").fill("3");
  await page.getByRole("button", { name: "Crear orden de venta" }).click();
  await expect(page.getByRole("row", { name: /\$75\.00/ })).toBeVisible(LENTO);
  await page.getByRole("button", { name: "Confirmar orden 1" }).click();
  await expect(page.getByRole("cell", { name: "Confirmada" })).toBeVisible(LENTO);

  await page.goto(`/${orgId}/erp`);
  await expect(stockDe(page, "Harina")).toHaveText("7");
});

test("WHEN el dueño recibe una compra de 5 THE SYSTEM SHALL subir la existencia en 5", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  await page.goto(`/${orgId}/erp`);
  await page.getByLabel("Nombre del proveedor").fill("Molinos");
  await page.getByRole("button", { name: "Agregar proveedor" }).click();
  await expect(page.getByText("Molinos")).toBeVisible(LENTO);

  await page.getByRole("link", { name: "Compras" }).click();
  await page.getByLabel("Producto de la línea 1").selectOption({ label: "Harina" });
  await page.getByLabel("Cantidad de la línea 1").fill("5");
  await page.getByRole("button", { name: "Crear orden de compra" }).click();
  await page.getByRole("button", { name: "Confirmar orden 1" }).click();
  await page.getByRole("button", { name: "Recibir orden 1" }).click();
  await expect(page.getByRole("cell", { name: "Recibida" })).toBeVisible(LENTO);

  await page.goto(`/${orgId}/erp`);
  await expect(stockDe(page, "Harina")).toHaveText("12");
});

test("WHEN un empleado sin erp abre el ERP THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
  await as(context, "sinPermiso", baseURL);
  expect((await page.goto(`/${orgId}/erp`))?.status()).toBe(404);
});

for (const ruta of ["erp", "erp/ventas", "erp/compras"]) {
  test(`WHEN AxeBuilder analiza /${ruta} THE SYSTEM SHALL reportar 0 violaciones`, async ({ page, context, baseURL }) => {
    await as(context, "owner", baseURL);
    await page.goto(`/${orgId}/${ruta}`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
