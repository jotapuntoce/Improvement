// apps/improvement/tests/e2e/frente.spec.ts
// El frente nuevo contra el build de producción: shell con marca, apps en la barra, lista, kanban y
// ficha, y que el edificio ya no existe. Siembra un org con dueño, un cliente y un trato.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, membership, organization, orgBrand, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const EMAIL = `frente-owner-${Date.now()}@example.com`;
const PASSWORD = crypto.randomUUID();
let orgId: string;
let ownerId: string;
let dealId: string;
let token: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(EMAIL, PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Frente E2E", slug: `frente-e2e-${Date.now()}` }).returning();
  orgId = org!.id;
  await db.insert(profile).values({ id: ownerId, email: EMAIL, fullName: "Dueña Frente" });
  await db.insert(membership).values({ userId: ownerId, orgId, role: "owner", acceptedAt: new Date() });
  await db.insert(orgBrand).values({ orgId, primaryColor: "#cc3366" });
  const [c] = await db.insert(client).values({ orgId, name: "Familia García" }).returning();
  const [d] = await db.insert(deal).values({ orgId, clientId: c!.id, title: "Boda García", amountCents: 8000000 }).returning();
  dealId = d!.id;
  token = await signInTestUser(EMAIL, PASSWORD);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId));
  if (ownerId) { await db.delete(profile).where(eq(profile.id, ownerId)); await deleteTestAuthUser(ownerId); }
});

async function as(context: BrowserContext, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: token, url: baseURL ?? "http://localhost:3200" }]);
}
async function noSerious(page: Page) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
}

test("WHEN el dueño entra a su negocio THE SYSTEM SHALL mostrar la barra con Ventas y su color de marca, y 0 serious o critical", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  expect((await page.goto(`/${orgId}`))?.status()).toBe(200);
  await expect(page.getByRole("navigation", { name: "Aplicaciones" }).getByRole("link", { name: "Ventas" })).toBeVisible();
  expect(await page.locator(".shell").evaluate((el) => getComputedStyle(el).getPropertyValue("--accent-1").trim())).toBe("#cc3366");
  await noSerious(page);
});

test("WHEN abre Ventas en lista y en kanban THE SYSTEM SHALL mostrar Boda García con su total", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}/a/ventas`);
  await expect(page.getByRole("link", { name: "Boda García" })).toBeVisible();
  await expect(page.getByText("$80,000.00").first()).toBeVisible();
  await page.goto(`/${orgId}/a/ventas?vista=kanban`);
  await expect(page.getByRole("heading", { name: "Prospecto" })).toBeVisible();
  await noSerious(page);
});

test("WHEN mueve el trato con el select de etapa THE SYSTEM SHALL guardarlo y la bitácora lo registra", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}/a/ventas?vista=kanban`);
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByLabel("Etapa de Boda García").selectOption("propuesta")]);
  await page.goto(`/${orgId}/a/ventas/${dealId}`);
  await expect(page.getByText("Etapa: prospecto → propuesta")).toBeVisible();
  await noSerious(page);
});

test("WHEN abre la ruta vieja del edificio THE SYSTEM SHALL llevarlo a su inicio", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/empresas/${orgId}`);
  await expect(page).toHaveURL(new RegExp(`/${orgId}$`));
});

test("WHEN el dueño agrega una aplicación THE SYSTEM SHALL mostrarla en la barra y dejar crear registros", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}/aplicaciones/nueva`);
  await page.getByLabel("Nombre").fill("Mascotas");
  await page.getByLabel("Grupo").fill("Operación");
  await page.getByLabel("Etapas (una por renglón)").fill("Nuevo\nAlta");
  await page.getByRole("button", { name: "Crear aplicación" }).click();
  await expect(page).toHaveURL(new RegExp(`/${orgId}/a/mascotas$`));
  await expect(page.getByRole("navigation", { name: "Aplicaciones" }).getByRole("link", { name: "Mascotas" })).toBeVisible();
  await page.getByLabel("Nombre del registro nuevo").fill("Firulais");
  await page.getByRole("button", { name: "Nuevo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Firulais" })).toBeVisible();
  await noSerious(page);
});
