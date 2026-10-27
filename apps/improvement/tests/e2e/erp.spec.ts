// La operación (Proyectos/obra; luego CRM y Postventa) de punta a punta contra el build de producción.
// Siembra un org con dueño y un empleado SIN tipo de permiso, y lo limpia al final. Mismo mecanismo de
// sesión que direccion.spec.ts.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, organization, profile, membership, project, ticket } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `erp-owner-${Date.now()}@example.com`;
const EMPLOYEE_EMAIL = `erp-employee-${Date.now()}@example.com`;
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
    .values({ name: "ERP E2E", slug: `erp-e2e-${Date.now()}` })
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
  await db.insert(project).values({ orgId, name: "Obra norte", status: "activo", authorizationStatus: "pendiente" });
  const [cliente] = await db.insert(client).values({ orgId, name: "Cliente Uno" }).returning();
  if (!cliente) throw new Error("insert de client no devolvió fila");
  await db.insert(deal).values({ orgId, clientId: cliente.id, title: "Remodelación baño", amountCents: 1250000 });
  await db.insert(ticket).values({ orgId, clientId: cliente.id, title: "Fuga en regadera" });

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

test.describe("Proyectos", () => {
  test("WHEN el dueño abre /[org]/proyectos THE SYSTEM SHALL responder 200 con Obra norte por autorizar y sin violaciones serias de axe", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    const response = await page.goto(`/${orgId}/proyectos`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: "Obra norte" });
    await expect(card).toContainText("Por autorizar");
    await expectNoSeriousA11y(page);
  });

  test("WHEN el dueño pulsa Autorizar THE SYSTEM SHALL mostrar Autorizado", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/proyectos`);
    await page.getByRole("button", { name: "Autorizar" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Obra norte" })).toContainText("Autorizado");
  });

  test("WHEN el dueño agrega la etapa Cimentación THE SYSTEM SHALL mostrarla en la tabla de etapas", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/proyectos`);
    const form = page.getByRole("form", { name: "Nueva etapa de Obra norte" });
    await form.getByLabel("Nueva etapa").fill("Cimentación");
    await form.getByLabel("Peso (1-100)").fill("1");
    await form.getByRole("button", { name: "Agregar etapa" }).click();
    await expect(page.getByRole("table", { name: "Etapas de Obra norte" }).getByRole("rowheader", { name: "Cimentación" })).toBeVisible();
  });

  test("WHEN un empleado sin la sección abre /[org]/proyectos THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
    await as(context, employeeToken, baseURL);
    const response = await page.goto(`/${orgId}/proyectos`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("CRM", () => {
  test("WHEN el dueño abre /[org]/clientes/pipeline THE SYSTEM SHALL responder 200 con el trato bajo Prospecto y sin violaciones serias de axe", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    const response = await page.goto(`/${orgId}/clientes/pipeline`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Pipeline de ventas" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Prospecto" })).toContainText("Remodelación baño");
    await expectNoSeriousA11y(page);
  });

  test("WHEN el dueño abre /[org]/clientes THE SYSTEM SHALL mostrar Pipeline de ventas y la Ficha lleva a Cliente Uno con las seis preguntas", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/clientes`);
    await expect(page.getByRole("link", { name: "Pipeline de ventas" })).toBeVisible();
    await page.getByRole("link", { name: "Ficha" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Cliente Uno" })).toBeVisible();
    await expect(page.getByRole("form", { name: "Hiperpersonalización" }).getByRole("textbox")).toHaveCount(6);
  });

  test("WHEN un empleado sin tipo de permiso abre /[org]/clientes/pipeline THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
    await as(context, employeeToken, baseURL);
    const response = await page.goto(`/${orgId}/clientes/pipeline`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("Postventa", () => {
  test("WHEN el dueño abre /[org]/postventa THE SYSTEM SHALL responder 200 con el ticket bajo Abiertos y sin violaciones serias de axe", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    const response = await page.goto(`/${orgId}/postventa`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Postventa" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Abiertos" })).toContainText("Fuga en regadera");
    await expectNoSeriousA11y(page);
  });

  test("WHEN el dueño resuelve el ticket THE SYSTEM SHALL mostrarlo bajo Resueltos", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/postventa`);
    await page.getByRole("button", { name: "Resolver: Fuga en regadera" }).click();
    await expect(page.getByRole("region", { name: "Resueltos" })).toContainText("Fuga en regadera");
  });

  test("WHEN un empleado sin la sección abre /[org]/postventa THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
    await as(context, employeeToken, baseURL);
    const response = await page.goto(`/${orgId}/postventa`);
    expect(response?.status()).toBe(404);
  });
});
