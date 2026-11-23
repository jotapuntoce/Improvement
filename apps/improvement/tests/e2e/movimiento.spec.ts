// El siguiente mejor movimiento en el inicio del dueño, contra el build de producción. Siembra un dueño nuevo
// con un org y un objetivo abierto, y un empleado del mismo org; borra todo al final. Mismo mecanismo de
// sesión que direccion.spec.ts. Nunca pulsa "Pedir siguiente movimiento" (llamaría a la API real).
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, membership, objective, organization, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `movimiento-owner-${Date.now()}@example.com`;
const EMPLOYEE_EMAIL = `movimiento-employee-${Date.now()}@example.com`;
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
    .values({ name: "Movimiento E2E", slug: `movimiento-e2e-${Date.now()}` })
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
  await db.insert(objective).values({
    orgId,
    title: "Llamar al proveedor",
    impactWeight: 10,
    dueDate: new Date(Date.now() + 86_400_000),
  });

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

test("WHEN el dueño sin sugerencias abre /empresas THE SYSTEM SHALL mostrar la tarea de Pareto como siguiente movimiento y sin violaciones serias de axe", async ({ page, context, baseURL }) => {
  await as(context, ownerToken, baseURL);
  await page.goto("/empresas");
  const card = page.getByRole("region", { name: "Siguiente mejor movimiento" });
  await expect(card).toContainText("Llamar al proveedor");
  await expect(card).toContainText("Lo más urgente (80/20)");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

test("WHEN hay una sugerencia reciente de la IA THE SYSTEM SHALL mostrarla con Sugerido por Improvement", async ({ page, context, baseURL }) => {
  await db.insert(aiSuggestion).values({
    orgId,
    category: "siguiente_movimiento",
    suggestionText: "Cerrar la venta grande",
    basedOn: {},
  });
  await as(context, ownerToken, baseURL);
  await page.goto("/empresas");
  const card = page.getByRole("region", { name: "Siguiente mejor movimiento" });
  await expect(card).toContainText("Cerrar la venta grande");
  await expect(card).toContainText("Sugerido por Improvement");
});

test("WHEN el dueño abre /[org] THE SYSTEM SHALL mostrar Pedir siguiente movimiento; al empleado no", async ({ page, context, baseURL }) => {
  await as(context, ownerToken, baseURL);
  await page.goto(`/${orgId}`);
  await expect(page.getByRole("button", { name: "Pedir siguiente movimiento" })).toBeVisible();

  await as(context, employeeToken, baseURL);
  await page.goto(`/${orgId}`);
  await expect(page.getByRole("button", { name: "Pedir siguiente movimiento" })).toHaveCount(0);
});
