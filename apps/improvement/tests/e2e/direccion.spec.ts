// Dirección de punta a punta contra el build de producción (playwright.config.ts). Siembra un org con
// dueño y un empleado SIN tipo de permiso, y lo limpia al final. El epic 02 extiende este spec con el
// Scorecard, Issues y la Junta — por eso los helpers `as` y `expectNoSeriousA11y` viven arriba.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, orgVision } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `direccion-owner-${Date.now()}@example.com`;
const EMPLOYEE_EMAIL = `direccion-employee-${Date.now()}@example.com`;
const OWNER_PASSWORD = crypto.randomUUID();
const EMPLOYEE_PASSWORD = crypto.randomUUID();

let orgId: string;
let ownerId: string;
let employeeId: string;
let ownerToken: string;
let employeeToken: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(OWNER_EMAIL, OWNER_PASSWORD);
  employeeId = await createTestAuthUser(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

  const [org] = await db
    .insert(organization)
    .values({ name: "Dirección E2E", slug: `direccion-e2e-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;

  await db.insert(profile).values([
    { id: ownerId, email: OWNER_EMAIL },
    { id: employeeId, email: EMPLOYEE_EMAIL },
  ]);
  await db.insert(membership).values([
    { userId: ownerId, orgId, role: "owner", acceptedAt: new Date() },
    { userId: employeeId, orgId, role: "employee", acceptedAt: new Date() },
  ]);
  await db.insert(orgVision).values({ orgId, coreValues: ["Servir", "Cumplir"], updatedBy: ownerId });

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

async function expectNoSeriousA11y(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
}

test.describe("Visión", () => {
  test("WHEN el dueño abre /[org]/direccion/vision THE SYSTEM SHALL responder 200 con h1 Visión y los valores sembrados", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    const response = await page.goto(`/${orgId}/direccion/vision`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Visión" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Servir" })).toBeVisible();
  });

  test("WHEN axe audita /[org]/direccion/vision con el dueño THE SYSTEM SHALL reportar 0 serious o critical", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/direccion/vision`);
    await page.waitForLoadState("networkidle");
    await expectNoSeriousA11y(page);
  });

  test("WHEN el dueño envía dos valores THE SYSTEM SHALL mostrarlos después de la redirección", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/direccion/vision`);
    await page.getByLabel("Un valor por línea (máximo 7)").fill("Honestidad\nServicio");
    await page.getByRole("button", { name: "Guardar valores centrales" }).click();
    await page.waitForURL(`**/${orgId}/direccion/vision`);
    await expect(page.getByRole("listitem").filter({ hasText: "Honestidad" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Servicio" })).toBeVisible();
  });

  test("WHEN un empleado sin la sección abre /[org]/direccion/vision THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
    await as(context, employeeToken, baseURL);
    const response = await page.goto(`/${orgId}/direccion/vision`);
    expect(response?.status()).toBe(404);
  });
});
