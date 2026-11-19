// Marca del dueño de punta a punta contra el build de producción (playwright.config.ts): tema válido
// aplicado en el layout del org, tema sin contraste rechazado con alerta, 404 al empleado y axe.
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `marca-owner-${Date.now()}@example.com`;
const EMPLOYEE_EMAIL = `marca-employee-${Date.now()}@example.com`;
const OWNER_PASSWORD = crypto.randomUUID();
const EMPLOYEE_PASSWORD = crypto.randomUUID();
const VERDE = { bg: "#05060b", textPrimary: "#f4f6fb", accent1: "#1fbe79", accent2: "#98e33b" };

let orgId: string;
let ownerId: string;
let employeeId: string;
let ownerToken: string;
let employeeToken: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(OWNER_EMAIL, OWNER_PASSWORD);
  employeeId = await createTestAuthUser(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Marca E2E", slug: `marca-e2e-${Date.now()}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values([
    { id: ownerId, email: OWNER_EMAIL, fullName: "Dueña Marca" },
    { id: employeeId, email: EMPLOYEE_EMAIL, fullName: "Empleado Marca" },
  ]);
  await db.insert(membership).values([
    { userId: ownerId, orgId, role: "owner", acceptedAt: new Date() },
    { userId: employeeId, orgId, role: "employee", acceptedAt: new Date() },
  ]);
  ownerToken = await signInTestUser(OWNER_EMAIL, OWNER_PASSWORD);
  employeeToken = await signInTestUser(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId)); // cascade
  for (const id of [ownerId, employeeId]) {
    if (!id) continue;
    await db.delete(profile).where(eq(profile.id, id));
    await deleteTestAuthUser(id);
  }
});

async function as(context: BrowserContext, token: string, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: token, url: baseURL ?? "http://localhost:3200" }]);
}

test("WHEN el dueño guarda un tema válido THE SYSTEM SHALL aplicar --accent-1 en el contenedor del layout", async ({ page, context, baseURL }) => {
  await as(context, ownerToken, baseURL);
  expect((await page.goto(`/${orgId}/marca`))?.status()).toBe(200);
  await page.getByLabel("Fondo").fill(VERDE.bg);
  await page.getByLabel("Texto principal").fill(VERDE.textPrimary);
  await page.getByLabel("Acento 1").fill(VERDE.accent1);
  await page.getByLabel("Acento 2").fill(VERDE.accent2);
  await page.getByRole("button", { name: "Guardar tema" }).click();
  await page.waitForURL(`**/${orgId}/marca`);
  const accent = await page
    .locator('div[style*="--accent-1"]')
    .first()
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--accent-1"));
  expect(accent).toBe(VERDE.accent1);
});

test("WHEN el dueño guarda textPrimary #6b7386 sobre #05060b THE SYSTEM SHALL mostrar la alerta con 4.26 sin cambiar el tema", async ({ page, context, baseURL }) => {
  await as(context, ownerToken, baseURL);
  await page.goto(`/${orgId}/marca`);
  await page.getByLabel("Fondo").fill("#05060b");
  await page.getByLabel("Texto principal").fill("#6b7386");
  await page.getByRole("button", { name: "Guardar tema" }).click();
  // Dentro de <main>: Next agrega su propio role="alert" (el anunciador de rutas).
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Contraste 4.26:1 — mínimo 4.5:1");
  const [row] = await db.select({ theme: organization.theme }).from(organization).where(eq(organization.id, orgId));
  expect(row?.theme).toEqual(VERDE);
});

test("WHEN un empleado abre /[org]/marca THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
  await as(context, employeeToken, baseURL);
  expect((await page.goto(`/${orgId}/marca`))?.status()).toBe(404);
});

test("WHEN AxeBuilder analiza /[org]/marca THE SYSTEM SHALL reportar 0 violaciones", async ({ page, context, baseURL }) => {
  await as(context, ownerToken, baseURL);
  await page.goto(`/${orgId}/marca`);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
