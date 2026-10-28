// apps/improvement/tests/e2e/importar.spec.ts
// Importar contra el build de producción: el dueño sube un CSV a Clientes, ve el mapeo y la vista
// previa con el renglón sin nombre, importa, y luego deshace y la lista queda como estaba.
import path from "node:path";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appField, appModel, membership, organization, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const EMAIL = `importar-owner-${Date.now()}@example.com`;
const PASSWORD = crypto.randomUUID();
const CSV = path.resolve("tests/e2e/fixtures/clientes.csv"); // Playwright corre desde apps/improvement
let orgId: string;
let ownerId: string;
let token: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(EMAIL, PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Importar E2E", slug: `importar-e2e-${Date.now()}` }).returning();
  orgId = org!.id;
  await db.insert(profile).values({ id: ownerId, email: EMAIL, fullName: "Dueña Importar" });
  await db.insert(membership).values({ userId: ownerId, orgId, role: "owner", acceptedAt: new Date() });
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

test("WHEN el dueño sube un CSV a Clientes THE SYSTEM SHALL mostrar el mapeo y la vista previa con el renglón sin nombre", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  // La primera visita siembra las apps base del org; luego Clientes recibe el campo Teléfono.
  await page.goto(`/${orgId}/a/clientes`);
  const [clientes] = await db.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, "clientes")));
  await db.insert(appField).values({ orgId, appId: clientes!.id, key: "telefono", label: "Teléfono", type: "texto" });

  await page.getByRole("link", { name: "Importar" }).click();
  await expect(page).toHaveURL(/\/a\/clientes\/importar$/);
  await noSerious(page);
  await page.getByLabel("Archivo", { exact: true }).setInputFiles(CSV);
  await page.getByRole("button", { name: "Leer archivo" }).click();
  await expect(page.getByRole("heading", { name: "Así leímos clientes.csv" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Teléfono", { exact: true })).toHaveValue("telefono");

  await page.getByRole("button", { name: "Actualizar vista previa" }).click();
  await expect(page.getByRole("heading", { name: "2 listos para importar" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Renglón 4: Falta el nombre.")).toBeVisible();
  await noSerious(page);

  await page.getByRole("button", { name: "Importar 2 registros" }).click();
  await expect(page).toHaveURL(/\/a\/clientes\?aviso=/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Ana Importada" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Luis Importado" })).toBeVisible();
});

test("WHEN deshace la importación THE SYSTEM SHALL quitar a los dos clientes", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}/a/clientes/importar`);
  await page.getByRole("button", { name: "Deshacer la importación de clientes.csv" }).click();
  await expect(page.getByText("Se quitaron 2.")).toBeVisible({ timeout: 20_000 });
  await page.goto(`/${orgId}/a/clientes`);
  await expect(page.getByRole("link", { name: "Ana Importada" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Luis Importado" })).toHaveCount(0);
});
