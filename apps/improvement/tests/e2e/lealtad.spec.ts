// Lealtad de punta a punta contra el build de producción (playwright.config.ts): la página del dueño y el
// monedero público. Siembra un org con dueño y un empleado SIN tipo de permiso, el programa con `vip`, un
// nivel, un cliente con token y la experiencia "Cena de aniversario" de 50000 centavos; lo limpia al final.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, experienceGrant, loyaltyProgram, loyaltyTier, membership, organization, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `lealtad-owner-${Date.now()}@example.com`;
const EMPLOYEE_EMAIL = `lealtad-employee-${Date.now()}@example.com`;
const OWNER_PASSWORD = crypto.randomUUID();
const EMPLOYEE_PASSWORD = crypto.randomUUID();
const WALLET_TOKEN = randomBytes(24).toString("base64url");

let orgId: string;
let ownerId: string;
let employeeId: string;
let clientId: string;
let ownerToken: string;
let employeeToken: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(OWNER_EMAIL, OWNER_PASSWORD);
  employeeId = await createTestAuthUser(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Lealtad E2E", slug: `lealtad-e2e-${Date.now()}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values([
    { id: ownerId, email: OWNER_EMAIL, fullName: "Dueña Lealtad" },
    { id: employeeId, email: EMPLOYEE_EMAIL, fullName: "Empleado Lealtad" },
  ]);
  await db.insert(membership).values([
    { userId: ownerId, orgId, role: "owner", acceptedAt: new Date() },
    { userId: employeeId, orgId, role: "employee", acceptedAt: new Date() },
  ]);
  await db.insert(loyaltyProgram).values({ orgId, features: { vip: true } });
  await db.insert(loyaltyTier).values({ orgId, name: "Socio", minPurchases: 0, perks: "Postre de la casa" });
  const [c] = await db.insert(client).values({ orgId, name: "Clienta Lealtad", walletToken: WALLET_TOKEN }).returning();
  clientId = c!.id;
  await db.insert(experienceGrant).values({ orgId, clientId, title: "Cena de aniversario", valueCents: 50000, grantedOn: "2026-10-01" });
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

test("WHEN un visitante sin sesión abre su monedero THE SYSTEM SHALL mostrar Cena de aniversario sin id ni 50000; un token inexistente da 404", async ({ page, context }) => {
  await context.clearCookies();
  const res = await page.goto(`/w/${WALLET_TOKEN}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByText("Cena de aniversario")).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(clientId);
  expect(html).not.toContain("50000");
  expect((await page.goto("/w/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))?.status()).toBe(404);
});

test("WHEN el dueño abre Lealtad THE SYSTEM SHALL responder 200 con h1 Lealtad y 0 serious o critical", async ({ page, context, baseURL }) => {
  await as(context, ownerToken, baseURL);
  expect((await page.goto(`/${orgId}/clientes/lealtad`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Lealtad" })).toBeVisible();
  await expectNoSeriousA11y(page);
});

test("WHEN el empleado sin la sección clientes abre Lealtad THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
  await as(context, employeeToken, baseURL);
  expect((await page.goto(`/${orgId}/clientes/lealtad`))?.status()).toBe(404);
});
