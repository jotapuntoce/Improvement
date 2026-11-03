// apps/improvement/tests/e2e/perfil.spec.ts
// El perfil de la empresa arriba de la barra abre la configuración; ahí se guarda el nombre y se
// cierra sesión.
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const EMAIL = `perfil-owner-${crypto.randomUUID()}@example.com`;
const PASSWORD = crypto.randomUUID();
let orgId: string;
let ownerId: string;
let token: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(EMAIL, PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Perfil E2E", slug: `perfil-e2e-${crypto.randomUUID()}` }).returning();
  orgId = org!.id;
  await db.insert(profile).values({ id: ownerId, email: EMAIL, fullName: "Dueña Perfil" });
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

test("WHEN el dueño da clic en el perfil de su empresa THE SYSTEM SHALL abrir la configuración y guardar su nombre", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}`);
  await page.getByRole("link", { name: "Configuración de Perfil E2E" }).click();
  await expect(page).toHaveURL(new RegExp(`/${orgId}/configuracion$`));
  await expect(page.getByRole("heading", { name: "Tu empresa: Perfil E2E" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await page.getByLabel("Nombre").fill("Dueña Perfil Nueva");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nombre guardado." })).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveValue("Dueña Perfil Nueva");
});

test("WHEN el dueño da clic en Cerrar sesión THE SYSTEM SHALL llevarlo al login y no dejarlo volver", async ({ page, context, baseURL }) => {
  await as(context, baseURL);
  await page.goto(`/${orgId}/configuracion`);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  // Sin sesión el guard manda al login (igual con cualquier negocio, no revela nada).
  await page.goto(`/${orgId}/configuracion`);
  await expect(page).toHaveURL(/\/login$/);
});
