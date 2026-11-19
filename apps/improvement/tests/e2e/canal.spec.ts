// Canal de punta a punta contra el build de producción: el dueño activa agentes, publica y el empleado
// lo ve llegar por Realtime (bajo RLS) sin recargar; borrado suave; encargo a la recepción; 404 y axe.
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const USERS = {
  owner: { email: `canal-owner-${stamp}@example.com`, password: crypto.randomUUID(), name: "Dueña Canal" },
  conPermiso: { email: `canal-emp-${stamp}@example.com`, password: crypto.randomUUID(), name: "Ana Canal" },
  sinPermiso: { email: `canal-sin-${stamp}@example.com`, password: crypto.randomUUID(), name: "Beto Canal" },
};
type Quien = keyof typeof USERS;

let orgId: string;
const ids: Record<Quien, string> = { owner: "", conPermiso: "", sinPermiso: "" };
const tokens: Record<Quien, string> = { owner: "", conPermiso: "", sinPermiso: "" };

test.beforeAll(async () => {
  for (const k of Object.keys(USERS) as Quien[]) ids[k] = await createTestAuthUser(USERS[k].email, USERS[k].password);
  const [org] = await db.insert(organization).values({ name: "Canal E2E", slug: `canal-e2e-${stamp}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values((Object.keys(USERS) as Quien[]).map((k) => ({ id: ids[k], email: USERS[k].email, fullName: USERS[k].name })));
  const [tipo] = await db.insert(permissionType).values({ orgId, name: "Usa el canal", grants: { canal: "empresa" } }).returning();
  await db.insert(membership).values([
    { userId: ids.owner, orgId, role: "owner", acceptedAt: new Date() },
    { userId: ids.conPermiso, orgId, role: "employee", acceptedAt: new Date(), permissionTypeId: tipo!.id },
    { userId: ids.sinPermiso, orgId, role: "employee", acceptedAt: new Date() },
  ]);
  for (const k of Object.keys(USERS) as Quien[]) tokens[k] = await signInTestUser(USERS[k].email, USERS[k].password);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId)); // cascade
  for (const id of Object.values(ids)) {
    if (!id) continue;
    await db.delete(profile).where(eq(profile.id, id));
    await deleteTestAuthUser(id);
  }
});

async function as(context: BrowserContext, quien: Quien, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: tokens[quien], url: baseURL ?? "http://localhost:3200" }]);
}

const mensaje = `Hola equipo ${stamp}`;

test("WHEN el dueño activa agentes THE SYSTEM SHALL mostrar el canal General", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  expect((await page.goto(`/${orgId}/canal`))?.status()).toBe(200);
  await page.getByRole("button", { name: "Activar agentes" }).click();
  await expect(page.getByRole("navigation", { name: "Canales" }).getByRole("link", { name: "General" })).toBeVisible();
});

test("WHEN el dueño publica en General THE SYSTEM SHALL mostrarlo al empleado sin recargar", async ({ browser, page, context, baseURL }) => {
  await as(context, "conPermiso", baseURL);
  await page.goto(`/${orgId}/canal`);
  await expect(page.locator('[data-realtime="SUBSCRIBED"]')).toHaveCount(1, { timeout: 15_000 });

  const ownerContext = await browser.newContext({ baseURL });
  await as(ownerContext, "owner", baseURL);
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto(`/${orgId}/canal`);
  await ownerPage.getByLabel("Mensaje").fill(mensaje);
  await ownerPage.getByRole("button", { name: "Enviar" }).click();
  await expect(ownerPage.getByText(mensaje)).toBeVisible();

  await expect(page.getByText(mensaje)).toBeVisible({ timeout: 10_000 });
  await ownerContext.close();
});

test("WHEN el autor borra su mensaje THE SYSTEM SHALL mostrar Mensaje borrado", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  await page.goto(`/${orgId}/canal`);
  await page.getByRole("button", { name: `Borrar mensaje: ${mensaje}` }).click();
  await expect(page.getByText("Mensaje borrado")).toBeVisible();
  await expect(page.getByText(mensaje)).toHaveCount(0);
});

test("WHEN el empleado encarga sin área THE SYSTEM SHALL mostrar la respuesta de la recepción en su canal agente", async ({ page, context, baseURL }) => {
  await as(context, "conPermiso", baseURL);
  await page.goto(`/${orgId}/canal`);
  await page.getByLabel("Encargo").fill("Necesito el resumen de ventas");
  await page.getByRole("button", { name: "Encargar" }).click();
  await page.getByRole("navigation", { name: "Canales" }).getByRole("link", { name: "Improvement" }).click();
  await expect(page.getByText("Recibido. Lo atiende Improvement.")).toBeVisible();
});

test("WHEN un empleado sin permiso entra THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
  await as(context, "sinPermiso", baseURL);
  expect((await page.goto(`/${orgId}/canal`))?.status()).toBe(404);
});

test("WHEN AxeBuilder analiza el canal del dueño THE SYSTEM SHALL reportar 0 violaciones", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  await page.goto(`/${orgId}/canal`);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
