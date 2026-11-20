// Butacas contra el build de producción: mapa 2×3, función publicada, venta en taquilla, mapa en vivo para
// otro taquillero por Realtime, 404 sin permiso y axe.
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile, venueSession } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const USERS = {
  owner: { email: `butacas-owner-${stamp}@example.com`, password: crypto.randomUUID(), name: "Dueña Butacas" },
  taquilla: { email: `butacas-taq-${stamp}@example.com`, password: crypto.randomUUID(), name: "Tere Taquilla" },
  sinPermiso: { email: `butacas-sin-${stamp}@example.com`, password: crypto.randomUUID(), name: "Beto Butacas" },
};
type Quien = keyof typeof USERS;

let orgId: string;
let sessionId: string;
const ids: Record<Quien, string> = { owner: "", taquilla: "", sinPermiso: "" };
const tokens: Record<Quien, string> = { owner: "", taquilla: "", sinPermiso: "" };

test.beforeAll(async () => {
  for (const k of Object.keys(USERS) as Quien[]) ids[k] = await createTestAuthUser(USERS[k].email, USERS[k].password);
  const [org] = await db.insert(organization).values({ name: "Butacas E2E", slug: `butacas-e2e-${stamp}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values((Object.keys(USERS) as Quien[]).map((k) => ({ id: ids[k], email: USERS[k].email, fullName: USERS[k].name })));
  const [tipo] = await db.insert(permissionType).values({ orgId, name: "Taquilla", grants: { butacas: "empresa" } }).returning();
  await db.insert(membership).values([
    { userId: ids.owner, orgId, role: "owner", acceptedAt: new Date() },
    { userId: ids.taquilla, orgId, role: "employee", acceptedAt: new Date(), permissionTypeId: tipo!.id },
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

const seat = (page: import("@playwright/test").Page, label: string) => page.locator(`[data-seat="${label}"]`);

test("WHEN el dueño crea un teatro 2×3, publica una función y vende A1 THE SYSTEM SHALL mostrar A1 como Vendido", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  expect((await page.goto(`/${orgId}/butacas`))?.status()).toBe(200);
  const mapa = page.getByRole("form", { name: "Nuevo mapa" });
  await mapa.getByLabel("Nombre del mapa").fill("Sala chica");
  await mapa.getByLabel("Filas, mesas o manzanas").fill("2");
  await mapa.getByLabel("Butacas por fila, personas por mesa o lotes por manzana").fill("3");
  await page.getByRole("button", { name: "Crear mapa" }).click();
  await page.waitForURL(`**/${orgId}/butacas`);

  const funcion = page.getByRole("form", { name: "Nueva función" });
  await funcion.getByLabel("Título de la función").fill("Estreno");
  await funcion.getByLabel("Fecha").fill("2030-03-01");
  await funcion.getByLabel("Precio por lugar (MXN)").fill("250");
  await page.getByRole("button", { name: "Crear función" }).click();
  await page.getByRole("button", { name: "Publicar: Estreno" }).click();

  const [s] = await db.select({ id: venueSession.id }).from(venueSession).where(eq(venueSession.orgId, orgId));
  sessionId = s!.id;
  await expect(page.getByRole("form", { name: "Taquilla" })).toBeVisible();
  await seat(page, "A1").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Vender en taquilla" }).click();
  await expect(seat(page, "A1")).toContainText("Vendido");
  await expect(seat(page, "A2")).toContainText("Disponible");
});

test("WHEN el dueño vende un lugar THE SYSTEM SHALL mostrarlo Vendido al taquillero sin recargar", async ({ browser, page, context, baseURL }) => {
  await as(context, "taquilla", baseURL);
  await page.goto(`/${orgId}/butacas?s=${sessionId}`);
  await expect(page.locator('[data-realtime="SUBSCRIBED"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(seat(page, "B2")).toContainText("Disponible");

  const ownerContext = await browser.newContext({ baseURL });
  await as(ownerContext, "owner", baseURL);
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto(`/${orgId}/butacas?s=${sessionId}`);
  await expect(ownerPage.locator('[data-realtime="SUBSCRIBED"]')).toHaveCount(1, { timeout: 15_000 }); // hidratada
  await seat(ownerPage, "B2").getByRole("checkbox").check();
  await ownerPage.getByRole("button", { name: "Vender en taquilla" }).click();
  await expect(seat(ownerPage, "B2")).toContainText("Vendido");

  await expect(seat(page, "B2")).toContainText("Vendido", { timeout: 10_000 });
  await ownerContext.close();
});

test("WHEN un empleado sin butacas abre la página THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
  await as(context, "sinPermiso", baseURL);
  expect((await page.goto(`/${orgId}/butacas`))?.status()).toBe(404);
});

test("WHEN AxeBuilder analiza /butacas THE SYSTEM SHALL reportar 0 violaciones", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  await page.goto(`/${orgId}/butacas?s=${sessionId}`);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
