// Personas de punta a punta contra el build de producción (playwright.config.ts): Accountability Chart,
// check-in semanal y People Analyzer. Siembra un org con dueño y un empleado SIN tipo de permiso, un asiento
// raíz, un check-in del empleado y la visión con dos valores; lo limpia al final.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { checkin, membership, organization, orgVision, profile, seat } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";
import { weekStart } from "../../server/direccion/scorecard/week.ts";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `personas-owner-${Date.now()}@example.com`;
const EMPLOYEE_EMAIL = `personas-employee-${Date.now()}@example.com`;
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
  const [org] = await db.insert(organization).values({ name: "Personas E2E", slug: `personas-e2e-${Date.now()}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values([
    { id: ownerId, email: OWNER_EMAIL, fullName: "Dueña Personas" },
    { id: employeeId, email: EMPLOYEE_EMAIL, fullName: "Empleado Personas" },
  ]);
  await db.insert(membership).values([
    { userId: ownerId, orgId, role: "owner", acceptedAt: new Date() },
    { userId: employeeId, orgId, role: "employee", acceptedAt: new Date() },
  ]);
  await db.insert(orgVision).values({ orgId, coreValues: ["Servir", "Cumplir"], updatedBy: ownerId });
  await db.insert(seat).values({ orgId, title: "Dirección general", roles: ["Visión", "Cultura"], holderProfileId: ownerId });
  await db.insert(checkin).values({ orgId, profileId: employeeId, weekStart: weekStart(new Date()), mood: 4, note: "Buena semana" });
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
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
}

test("WHEN el dueño abre el Accountability Chart THE SYSTEM SHALL responder 200 con Dirección general y 0 serious o critical", async ({ page, context, baseURL }) => {
  await as(context, ownerToken, baseURL);
  expect((await page.goto(`/${orgId}/equipo/organigrama`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Accountability Chart" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Dirección general" }).first()).toBeVisible();
  await expectNoSeriousA11y(page);
});

test("WHEN el dueño abre el check-in y el People Analyzer THE SYSTEM SHALL responder 200 con sus h1 y 0 serious o critical", async ({ page, context, baseURL }) => {
  await as(context, ownerToken, baseURL);
  expect((await page.goto(`/${orgId}/equipo/checkin`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Check-in semanal" })).toBeVisible();
  await expectNoSeriousA11y(page);
  expect((await page.goto(`/${orgId}/equipo/analizador`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "People Analyzer" })).toBeVisible();
  await expectNoSeriousA11y(page);
});

test("WHEN el empleado sin tipo de permiso abre el check-in THE SYSTEM SHALL ofrecer Muy bien; el organigrama le da 404", async ({ page, context, baseURL }) => {
  await as(context, employeeToken, baseURL);
  expect((await page.goto(`/${orgId}/equipo/checkin`))?.status()).toBe(200);
  await expect(page.getByLabel("Muy bien")).toBeVisible();
  expect((await page.goto(`/${orgId}/equipo/organigrama`))?.status()).toBe(404);
});
