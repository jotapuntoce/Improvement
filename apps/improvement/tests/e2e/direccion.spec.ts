// Dirección de punta a punta contra el build de producción (playwright.config.ts). Siembra un org con
// dueño y un empleado SIN tipo de permiso, y lo limpia al final. El epic 02 extiende este spec con el
// Scorecard, Issues y la Junta — por eso los helpers `as` y `expectNoSeriousA11y` viven arriba.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  organization,
  profile,
  membership,
  orgVision,
  orgMeasurable,
  measurableValue,
  orgNeed,
  objective,
} from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";
import { weekStart } from "../../server/direccion/scorecard/week.ts";

const THIS_WEEK = weekStart(new Date());

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `direccion-owner-${Date.now()}@example.com`;
const EMPLOYEE_EMAIL = `direccion-employee-${Date.now()}@example.com`;
const OWNER_PASSWORD = crypto.randomUUID();
const EMPLOYEE_PASSWORD = crypto.randomUUID();

let orgId: string;
let ownerId: string;
let employeeId: string;
let issueId: string;
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

  const measurables = await db
    .insert(orgMeasurable)
    .values([
      { orgId, title: "Ventas cerradas", ownerProfileId: ownerId, goal: 10, goalDirection: "gte", position: 0 },
      { orgId, title: "Quejas", ownerProfileId: ownerId, goal: 2, goalDirection: "lte", position: 1 },
    ])
    .returning({ id: orgMeasurable.id, title: orgMeasurable.title });
  await db.insert(measurableValue).values(
    measurables.map((m) => ({
      measurableId: m.id,
      weekStart: THIS_WEEK,
      value: m.title === "Quejas" ? 5 : 12,
      enteredBy: ownerId,
    })),
  );

  const [need] = await db
    .insert(orgNeed)
    .values({ orgId, title: "Se pierden clientes", status: "abierta", source: "dueno", ownerProfileId: ownerId })
    .returning({ id: orgNeed.id });
  if (!need) throw new Error("insert de org_need no devolvió fila");
  issueId = need.id;

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

test.describe("Scorecard", () => {
  const cell = (page: Page, title: string) =>
    page.locator(`tr:has(th[scope="row"]:text-is("${title}")) td[data-week="${THIS_WEEK}"]`);

  test("WHEN el dueño abre /[org]/direccion/scorecard THE SYSTEM SHALL responder 200 con 13 semanas, la actual primero", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    const response = await page.goto(`/${orgId}/direccion/scorecard`);
    expect(response?.status()).toBe(200);
    const weeks = page.locator("th[data-week]");
    await expect(weeks).toHaveCount(13);
    await expect(weeks.first()).toHaveAttribute("data-week", THIS_WEEK);
  });

  test("WHEN un medible está en meta o fuera THE SYSTEM SHALL decirlo con texto en su celda", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/direccion/scorecard`);
    await expect(cell(page, "Ventas cerradas")).toContainText("En meta");
    await expect(cell(page, "Quejas")).toContainText("Fuera de meta");
  });

  test("WHEN axe audita /[org]/direccion/scorecard con el dueño THE SYSTEM SHALL reportar 0 serious o critical", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/direccion/scorecard`);
    await page.waitForLoadState("networkidle");
    await expectNoSeriousA11y(page);
  });

  test("WHEN el dueño captura 7 en Ventas cerradas THE SYSTEM SHALL mostrar 7 en la celda de la semana", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/direccion/scorecard`);
    const form = page.getByRole("form", { name: "Capturar valor de Ventas cerradas" });
    await form.getByLabel("Semana").selectOption(THIS_WEEK);
    await form.getByLabel("Valor").fill("7");
    await form.getByRole("button", { name: "Capturar" }).click();
    await page.waitForURL(`**/${orgId}/direccion/scorecard`);
    await expect(cell(page, "Ventas cerradas")).toContainText("7");
    await expect(cell(page, "Ventas cerradas")).toContainText("Fuera de meta");
  });

  test("WHEN un empleado sin la sección abre /[org]/direccion/scorecard THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
    await as(context, employeeToken, baseURL);
    const response = await page.goto(`/${orgId}/direccion/scorecard`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("Issues", () => {
  const ISSUE = "Se pierden clientes";
  const column = (page: Page, name: string) => page.getByRole("region", { name });

  test("WHEN el dueño abre /[org]/direccion/issues THE SYSTEM SHALL mostrar las tres columnas y el issue bajo Identificar", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    const response = await page.goto(`/${orgId}/direccion/issues`);
    expect(response?.status()).toBe(200);
    for (const name of ["Identificar", "Discutir", "Resolver"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect(column(page, "Identificar").getByText(ISSUE, { exact: true })).toBeVisible();
  });

  test("WHEN axe audita /[org]/direccion/issues con el dueño THE SYSTEM SHALL reportar 0 serious o critical", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/direccion/issues`);
    await page.waitForLoadState("networkidle");
    await expectNoSeriousA11y(page);
  });

  test("WHEN el dueño pulsa Pasar a discutir THE SYSTEM SHALL mostrar el issue bajo Discutir", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/direccion/issues`);
    await column(page, "Identificar").getByRole("button", { name: "Pasar a discutir" }).click();
    await page.waitForURL(`**/${orgId}/direccion/issues`);
    await expect(column(page, "Discutir").getByText(ISSUE, { exact: true })).toBeVisible();
  });

  test("WHEN el dueño crea un pendiente desde el issue THE SYSTEM SHALL dejar un objective con ese need_id", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    await page.goto(`/${orgId}/direccion/issues`);
    const form = page.getByRole("form", { name: `Pendiente nuevo para ${ISSUE}` });
    await form.getByLabel("Título del pendiente").fill("Llamar a los clientes perdidos");
    await form.getByLabel("Fecha").fill("2026-12-15");
    await form.getByRole("button", { name: "Pendiente nuevo" }).click();
    await page.waitForURL(`**/${orgId}/direccion/issues`);
    await expect
      .poll(async () => (await db.select().from(objective).where(eq(objective.needId, issueId))).length)
      .toBe(1);
  });

  test("WHEN el dueño abre /[org]/necesidades THE SYSTEM SHALL responder 200", async ({ page, context, baseURL }) => {
    await as(context, ownerToken, baseURL);
    const response = await page.goto(`/${orgId}/necesidades`);
    expect(response?.status()).toBe(200);
  });

  test("WHEN un empleado sin la sección abre /[org]/direccion/issues THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
    await as(context, employeeToken, baseURL);
    const response = await page.goto(`/${orgId}/direccion/issues`);
    expect(response?.status()).toBe(404);
  });
});
