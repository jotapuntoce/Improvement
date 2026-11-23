// CRM con diseño Flozzy contra el build de producción: tablero con una columna por etapa y tasa de
// cierre, ficha 360 con la orden en la pestaña Órdenes, y axe en ambas.
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, membership, organization, profile, saleOrder } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const OWNER = { email: `flozzy-owner-${stamp}@example.com`, password: crypto.randomUUID() };
let orgId: string;
let clientId: string;
let ownerId = "";
let token = "";

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(OWNER.email, OWNER.password);
  const [org] = await db.insert(organization).values({ name: "Flozzy E2E", slug: `flozzy-e2e-${stamp}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values({ id: ownerId, email: OWNER.email, fullName: "Dueña Flozzy" });
  await db.insert(membership).values({ userId: ownerId, orgId, role: "owner", acceptedAt: new Date() });
  const [c] = await db.insert(client).values({ orgId, name: "Cliente Flozzy" }).returning();
  clientId = c!.id;
  await db.insert(deal).values([
    { orgId, clientId, title: "Boda grande", amountCents: 500000, stage: "ganado", closedAt: new Date() },
    { orgId, clientId, title: "XV años", amountCents: 200000, stage: "perdido", closedAt: new Date() },
  ]);
  await db.insert(saleOrder).values({ orgId, number: 1, clientId, totalCents: 6500 });
  token = await signInTestUser(OWNER.email, OWNER.password);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId)); // cascade
  if (ownerId) {
    await db.delete(profile).where(eq(profile.id, ownerId));
    await deleteTestAuthUser(ownerId);
  }
});

async function as(context: BrowserContext, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: token, url: baseURL ?? "http://localhost:3200" }]);
}

test("WHEN el dueño abre el pipeline con un ganado y un perdido THE SYSTEM SHALL mostrar 5 columnas y tasa de cierre 50%", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  expect((await page.goto(`/${orgId}/clientes/pipeline`))?.status()).toBe(200);
  for (const etapa of ["Prospecto", "Propuesta", "Negociación", "Ganado", "Perdido"]) {
    await expect(page.getByRole("region", { name: etapa, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Resumen del pipeline" })).toContainText("50%");
  await expect(page.getByRole("region", { name: "Ganado", exact: true })).toContainText("Boda grande");
});

test("WHEN el dueño abre la ficha con una orden THE SYSTEM SHALL mostrarla en la pestaña Órdenes", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}/clientes/${clientId}`);
  await expect(page.getByRole("tablist", { name: "Ficha del cliente" })).toBeVisible();
  await page.getByRole("tab", { name: "Órdenes" }).click();
  await expect(page.getByRole("tab", { name: "Órdenes" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Órdenes" })).toContainText("Orden 1");
});

for (const ruta of ["clientes/pipeline", "clientes/:id"]) {
  test(`WHEN AxeBuilder analiza ${ruta} THE SYSTEM SHALL reportar 0 violaciones`, async ({ page, context, baseURL }) => {
    await as(context, baseURL);
    await page.goto(`/${orgId}/${ruta.replace(":id", clientId)}`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
