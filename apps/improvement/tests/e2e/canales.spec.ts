// apps/improvement/tests/e2e/canales.spec.ts
// La burbuja contra el build de producción: un empleado apunta algo desde cualquier pantalla, lo ve
// en su bandeja y en su calendario. "Preguntar" no entra (costaría dinero): lo cubre
// conversation.test.ts con un proveedor simulado.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile, task } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `canales-owner-${crypto.randomUUID()}@example.com`;
const EMP_EMAIL = `canales-emp-${crypto.randomUUID()}@example.com`;
const PASSWORD = crypto.randomUUID();
let orgId: string;
let ownerId: string;
let empId: string;
let empToken: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(OWNER_EMAIL, PASSWORD);
  empId = await createTestAuthUser(EMP_EMAIL, PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Canales E2E", slug: `canales-e2e-${crypto.randomUUID()}` }).returning();
  orgId = org!.id;
  await db.insert(profile).values([
    { id: ownerId, email: OWNER_EMAIL, fullName: "Dueño Canales" },
    { id: empId, email: EMP_EMAIL, fullName: "Ana Recepción" },
  ]);
  const [tipo] = await db.insert(permissionType).values({ orgId, name: "Recepción", grants: { clientes: "empresa" } }).returning();
  await db.insert(membership).values([
    { userId: ownerId, orgId, role: "owner", acceptedAt: new Date() },
    { userId: empId, orgId, role: "employee", acceptedAt: new Date(), permissionTypeId: tipo!.id },
  ]);
  // Una tarea con fecha para el calendario.
  await db.insert(task).values({ orgId, assigneeId: empId, title: "Confirmar citas de mañana", source: "dueno", createdBy: ownerId, dueAt: new Date(Date.now() + 2 * 86_400_000) });
  empToken = await signInTestUser(EMP_EMAIL, PASSWORD);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId));
  for (const id of [ownerId, empId]) {
    if (!id) continue;
    await db.delete(profile).where(eq(profile.id, id));
    await deleteTestAuthUser(id);
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

test("WHEN el empleado apunta algo desde la burbuja THE SYSTEM SHALL dejarlo en su bandeja sin salir de la pantalla", async ({ page, context, baseURL }) => {
  await as(context, baseURL, empToken);
  await page.goto(`/${orgId}/a/clientes`);
  await page.getByRole("button", { name: "Tu agente" }).click();
  const panel = page.getByRole("dialog", { name: "Conversación con Tu agente" });
  await expect(panel).toBeVisible();
  await noSerious(page);
  await panel.getByLabel("Qué necesitas").fill("Llamar a Rosa por su anticipo");
  await panel.getByRole("button", { name: "Apuntar" }).click();
  await expect(panel.getByText("Listo: quedó en tu bandeja.")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/${orgId}/a/clientes`));

  await page.goto(`/${orgId}/tareas`);
  await expect(page.getByRole("link", { name: "Llamar a Rosa por su anticipo" })).toBeVisible({ timeout: 20_000 });
});

test("WHEN el empleado abre su calendario y su conversación THE SYSTEM SHALL mostrar lo que tiene fecha y su espacio propio", async ({ page, context, baseURL }) => {
  await as(context, baseURL, empToken);
  await page.goto(`/${orgId}/calendario`);
  await expect(page.getByRole("link", { name: "Confirmar citas de mañana" })).toBeVisible({ timeout: 20_000 });
  await noSerious(page);
  await page.goto(`/${orgId}/conversacion`);
  await expect(page.getByRole("heading", { name: "Conversar con Tu agente" })).toBeVisible();
  await noSerious(page);
});
