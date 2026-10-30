// apps/improvement/tests/e2e/tareas.spec.ts
// Tareas y automatizaciones contra el build de producción: el dueño arma una regla y la activa, mueve
// un registro, la tarea cae en la bandeja del empleado, él la trabaja y la cierra, y todo queda en la
// bitácora. El copiloto con IA no entra aquí (costaría dinero y no es determinista): lo cubren las
// pruebas de tasks-copilot con un proveedor simulado.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, appRecord, appStage, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const OWNER_EMAIL = `tareas-owner-${crypto.randomUUID()}@example.com`;
const EMP_EMAIL = `tareas-emp-${crypto.randomUUID()}@example.com`;
const PASSWORD = crypto.randomUUID();
let orgId: string;
let ownerId: string;
let empId: string;
let ownerToken: string;
let empToken: string;
let recordId: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(OWNER_EMAIL, PASSWORD);
  empId = await createTestAuthUser(EMP_EMAIL, PASSWORD);
  const [org] = await db.insert(organization).values({ name: "Tareas E2E", slug: `tareas-e2e-${crypto.randomUUID()}` }).returning();
  orgId = org!.id;
  await db.insert(profile).values([
    { id: ownerId, email: OWNER_EMAIL, fullName: "Dueña Tareas" },
    { id: empId, email: EMP_EMAIL, fullName: "Beto Empleado" },
  ]);
  // El empleado ve las apps propias de toda la empresa: la tarea solo se le asigna si ve el registro.
  const [tipo] = await db.insert(permissionType).values({ orgId, name: "Recepción", grants: { aplicaciones: "empresa" } }).returning();
  await db.insert(membership).values([
    { userId: ownerId, orgId, role: "owner", acceptedAt: new Date() },
    { userId: empId, orgId, role: "employee", acceptedAt: new Date(), permissionTypeId: tipo!.id },
  ]);
  const [group] = await db.insert(appGroup).values({ orgId, name: "Operación", position: 99 }).returning();
  const [app] = await db
    .insert(appModel)
    .values({ orgId, key: "pacientes", name: "Pacientes", kind: "custom", section: "aplicaciones", icon: "grid", groupId: group!.id, position: 50 })
    .returning();
  await db.insert(appStage).values([
    { orgId, appId: app!.id, key: "nuevo", name: "Nuevo", position: 0 },
    { orgId, appId: app!.id, key: "en-consulta", name: "En consulta", position: 1 },
  ]);
  const [rec] = await db.insert(appRecord).values({ orgId, appId: app!.id, title: "Firulais", stage: "nuevo", createdBy: ownerId }).returning();
  recordId = rec!.id;
  ownerToken = await signInTestUser(OWNER_EMAIL, PASSWORD);
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

test("WHEN el dueño arma la regla y la activa THE SYSTEM SHALL guardarla en prueba y luego activa", async ({ page, context, baseURL }) => {
  await as(context, baseURL, ownerToken);
  await page.goto(`/${orgId}/automatizaciones/nueva`);
  await page.getByLabel("1. ¿En qué app?").selectOption("pacientes");
  await page.getByRole("button", { name: "Elegir" }).click();
  await expect(page).toHaveURL(/app=pacientes/);
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Al pasar a En consulta");
  await page.getByLabel("Pasa esto").selectOption("etapa");
  await page.getByLabel("Etapa (si pasa a una etapa)").selectOption("en-consulta");
  await page.getByLabel("Acción 1", { exact: true }).selectOption("crear_tarea");
  await page.getByLabel("Acción 1: título o texto").fill("Preparar expediente");
  await page.getByLabel("Acción 1: persona").selectOption({ label: "Beto Empleado" });
  await page.getByRole("button", { name: "Guardar en prueba" }).click();
  await expect(page.getByRole("heading", { name: "Al pasar a En consulta" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "En prueba" })).toBeVisible();
  await page.getByRole("button", { name: "Activar" }).click();
  await expect(page.getByRole("heading", { name: "Activa" })).toBeVisible({ timeout: 20_000 });
  await noSerious(page);
});

test("WHEN el dueño mueve a Firulais a En consulta THE SYSTEM SHALL poner la tarea en la bandeja del empleado", async ({ page, context, baseURL }) => {
  await as(context, baseURL, ownerToken);
  await page.goto(`/${orgId}/a/pacientes?vista=kanban`);
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByLabel("Etapa de Firulais").selectOption("en-consulta")]);

  await as(context, baseURL, empToken);
  await page.goto(`/${orgId}/tareas`);
  const item = page.getByRole("listitem").filter({ hasText: "Preparar expediente" });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item).toContainText("La creó una automatización");
  await noSerious(page);
});

test("WHEN el empleado trabaja la tarea y la cierra THE SYSTEM SHALL dejar la automatización y el paso en la bitácora", async ({ page, context, baseURL }) => {
  await as(context, baseURL, empToken);
  await page.goto(`/${orgId}/tareas`);
  await page.getByRole("link", { name: "Preparar expediente" }).click();
  await expect(page.getByRole("heading", { name: "Preparar expediente" })).toBeVisible();
  await noSerious(page);
  await page.getByLabel("Paso nuevo").fill("Llamar al dueño");
  await page.getByRole("button", { name: "Agregar paso" }).click();
  await page.getByLabel("Qué quedó: Llamar al dueño").fill("Confirmado");
  await page.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText("Listo — Confirmado")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Cerrar tarea" }).click();
  await expect(page).toHaveURL(new RegExp(`/${orgId}/tareas$`), { timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Preparar expediente" })).toHaveCount(0);

  await as(context, baseURL, ownerToken);
  await page.goto(`/${orgId}/a/pacientes/${recordId}`);
  await expect(page.getByText("Automatización «Al pasar a En consulta»: crear tarea «Preparar expediente»")).toBeVisible();
  await expect(page.getByText("Paso: Llamar al dueño — Confirmado")).toBeVisible();
  await expect(page.getByText("Tarea cerrada: Preparar expediente")).toBeVisible();
});
