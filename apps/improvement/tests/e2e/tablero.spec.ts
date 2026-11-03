// apps/improvement/tests/e2e/tablero.spec.ts
// Tablero e inteligencia contra el build de producción: el dueño ve su tablero sembrado, agrega,
// sube y quita una tarjeta; pasa una alerta a Summum; agrega lo que falta en su proceso y mueve los
// números de "¿Qué pasa si?" sin que el navegador le pida nada al servidor. "Explícame" no entra
// (costaría dinero): lo cubre alerts.test.ts con un proveedor simulado.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, membership, organization, orgNeed, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `tablero-owner-${crypto.randomUUID()}@example.com`;
const PASSWORD = crypto.randomUUID();
const DAY = 86_400_000;
let orgId: string;
let ownerId: string;
let ownerToken: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(OWNER_EMAIL, PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Tablero E2E", slug: `tablero-e2e-${crypto.randomUUID()}`, industry: "restaurante" }).returning();
  orgId = org!.id;
  await db.insert(profile).values({ id: ownerId, email: OWNER_EMAIL, fullName: "Dueña Tablero" });
  await db.insert(membership).values({ userId: ownerId, orgId, role: "owner", acceptedAt: new Date() });
  const [c] = await db.insert(client).values({ orgId, name: "Boda García" }).returning();
  const closedAt = new Date(Date.now() - 10 * DAY);
  await db.insert(deal).values([
    { orgId, clientId: c!.id, title: "Banquete", amountCents: 80_000_00, stage: "propuesta", updatedAt: new Date(Date.now() - 20 * DAY) },
    { orgId, clientId: c!.id, title: "Cena", amountCents: 10_000_00, stage: "ganado", closedAt },
    { orgId, clientId: c!.id, title: "Brindis", amountCents: 10_000_00, stage: "perdido", closedAt },
  ]);
  ownerToken = await signInTestUser(OWNER_EMAIL, PASSWORD);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId));
  if (ownerId) {
    await db.delete(profile).where(eq(profile.id, ownerId));
    await deleteTestAuthUser(ownerId);
  }
});

async function as(context: BrowserContext, baseURL: string | undefined, token: string) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: token, url: baseURL ?? "http://localhost:3200" }]);
}
async function noSerious(page: Page) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
}
const cardTitles = (page: Page) => page.locator(".dash-card h2");

test("WHEN el dueño abre su inicio y agrega, sube y quita una tarjeta THE SYSTEM SHALL reacomodar su tablero", async ({ page, context, baseURL }) => {
  await as(context, baseURL, ownerToken);
  await page.goto(`/${orgId}`);
  await expect(cardTitles(page)).toHaveCount(5, { timeout: 30_000 });
  await noSerious(page);

  await page.getByRole("link", { name: "Agregar tarjeta" }).click();
  await page.getByLabel("Tipo").selectOption("numero");
  await page.getByLabel("App (si la tarjeta es de una app)").selectOption("ventas");
  await page.getByRole("button", { name: "Elegir" }).click();
  await page.getByLabel("Título (opcional)").fill("Total en ventas");
  await page.getByLabel("Qué hacer").selectOption("sumar");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(cardTitles(page)).toHaveCount(6, { timeout: 20_000 });
  await expect(cardTitles(page).nth(5)).toHaveText("Total en ventas");

  await page.getByRole("button", { name: "Subir Total en ventas" }).click();
  await expect(cardTitles(page).nth(4)).toHaveText("Total en ventas", { timeout: 20_000 });
  await page.getByRole("button", { name: "Quitar Total en ventas" }).click();
  await expect(cardTitles(page)).toHaveCount(5, { timeout: 20_000 });
});

test("WHEN el dueño pasa un trato quieto a Summum THE SYSTEM SHALL dejar la necesidad derivada", async ({ page, context, baseURL }) => {
  await as(context, baseURL, ownerToken);
  await page.goto(`/${orgId}/alertas`);
  const alerta = page.getByRole("listitem").filter({ hasText: "«Banquete» lleva" });
  await expect(alerta).toBeVisible({ timeout: 20_000 });
  await noSerious(page);
  await alerta.getByRole("textbox").fill("Necesito quien cierre ventas");
  await alerta.getByRole("button", { name: "Pedir ayuda a Summum" }).click();
  await expect(page.getByText("Se la pasamos a Summum.")).toBeVisible({ timeout: 20_000 });
  const needs = await db.select({ status: orgNeed.status }).from(orgNeed).where(and(eq(orgNeed.orgId, orgId), eq(orgNeed.status, "derivada")));
  expect(needs).toHaveLength(1);
});

test("WHEN el dueño agrega lo que falta en su proceso THE SYSTEM SHALL crearlo y quitarlo de la lista", async ({ page, context, baseURL }) => {
  await as(context, baseURL, ownerToken);
  await page.goto(`/${orgId}/proceso`);
  const agregar = page.getByRole("button", { name: /Agregar: La app «Reservaciones»/ });
  await expect(agregar).toBeVisible({ timeout: 20_000 });
  await noSerious(page);
  await agregar.click();
  await expect(page.getByText("Listo, ya está en tu Improvement.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Agregar: La app «Reservaciones»/ })).toHaveCount(0);
});

test("WHEN el dueño mueve los números de ¿Qué pasa si? THE SYSTEM SHALL recalcular sin pedir nada al servidor", async ({ page, context, baseURL }) => {
  await as(context, baseURL, ownerToken);
  await page.goto(`/${orgId}/que-pasa-si`);
  await expect(page.getByText("Tasa de cierre: 50")).toBeVisible({ timeout: 20_000 });
  await noSerious(page);
  let posts = 0;
  page.on("request", (r) => { if (r.method() !== "GET") posts++; });
  await page.getByLabel("Ticket promedio (pesos)").fill("1000");
  await page.getByLabel("Tasa de cierre (%)").fill("50");
  await page.getByLabel("Tratos nuevos por mes").fill("10");
  await expect(page.getByText("$5,000 al mes")).toBeVisible();
  await page.getByLabel("Tasa de cierre (%)").fill("30");
  await expect(page.getByText("$3,000 al mes")).toBeVisible();
  expect(posts).toBe(0);
});
