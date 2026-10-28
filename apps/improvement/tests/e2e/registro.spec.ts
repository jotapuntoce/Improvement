// apps/improvement/tests/e2e/registro.spec.ts
// Registro y arranque contra el build de producción: alguien con cuenta y sin empresa cuenta su
// negocio, salta la marca, acepta la propuesta y llega a su inicio con las apps de su giro. La cuenta
// se crea ya confirmada con el fixture (signUp real dependería de la confirmación por correo).
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const EMAIL = `registro-${Date.now()}@example.com`;
const PASSWORD = crypto.randomUUID();
let userId: string;
let token: string;
let orgId: string | undefined;

test.beforeAll(async () => {
  userId = await createTestAuthUser(EMAIL, PASSWORD);
  token = await signInTestUser(EMAIL, PASSWORD);
});

test.afterAll(async () => {
  const mine = await db.select({ orgId: membership.orgId }).from(membership).where(eq(membership.userId, userId));
  if (mine.length) await db.delete(organization).where(inArray(organization.id, mine.map((m) => m.orgId)));
  await db.delete(profile).where(eq(profile.id, userId));
  await deleteTestAuthUser(userId);
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

test("WHEN alguien abre /registro THE SYSTEM SHALL mostrar el formulario de cuenta con 0 serious o critical", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/registro");
  await expect(page.getByRole("button", { name: "Crear cuenta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
  await noSerious(page);
});

test("WHEN alguien sin empresa entra THE SYSTEM SHALL llevarlo al arranque", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto("/");
  await expect(page).toHaveURL(/\/arranque$/);
  await noSerious(page);
});

test("WHEN cuenta su negocio, salta la marca y acepta la propuesta THE SYSTEM SHALL dejarlo en su inicio con las apps de su giro", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto("/arranque");
  await page.getByLabel("Tu nombre").fill("Ana Prueba");
  await page.getByLabel("Nombre del negocio").fill("Clínica E2E");
  await page.getByLabel("Giro").selectOption("salud");
  await page.getByLabel("¿Cuántos son?").selectOption("2-5");
  await page.getByLabel("Ciudad").fill("Monterrey");
  await page.getByRole("button", { name: "Seguir" }).click();
  // Crea la empresa y siembra sus apps contra el Supabase remoto: tarda más que una navegación normal.
  await expect(page).toHaveURL(/\/arranque\/[0-9a-f-]{36}\/marca$/, { timeout: 20_000 });
  orgId = page.url().split("/")[4];
  await noSerious(page);

  await page.getByRole("link", { name: "Saltar este paso" }).click();
  await expect(page).toHaveURL(/\/propuesta$/);
  await expect(page.locator('input[name="name-0"]')).toHaveValue("Pacientes");
  await noSerious(page);
  await page.getByRole("button", { name: "Armar mi Improvement" }).click();

  await expect(page).toHaveURL(new RegExp(`/${orgId}$`), { timeout: 20_000 });
  const nav = page.getByRole("navigation", { name: "Aplicaciones" });
  await expect(nav.getByRole("link", { name: "Pacientes" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Citas" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Agregar aplicación" })).toBeVisible();
});
