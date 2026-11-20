// Agenda contra el build de producción: tarea vencida reprogramada, página de reservas, 404 sin permiso y axe.
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const USERS = {
  owner: { email: `agenda-owner-${stamp}@example.com`, password: crypto.randomUUID(), name: "Dueña Agenda" },
  sinPermiso: { email: `agenda-sin-${stamp}@example.com`, password: crypto.randomUUID(), name: "Beto Agenda" },
};
type Quien = keyof typeof USERS;

let orgId: string;
const ids: Record<Quien, string> = { owner: "", sinPermiso: "" };
const tokens: Record<Quien, string> = { owner: "", sinPermiso: "" };
const SLUG = `agenda-e2e-${stamp}`;

test.beforeAll(async () => {
  for (const k of Object.keys(USERS) as Quien[]) ids[k] = await createTestAuthUser(USERS[k].email, USERS[k].password);
  const [org] = await db.insert(organization).values({ name: "Agenda E2E", slug: `agenda-e2e-${stamp}` }).returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values((Object.keys(USERS) as Quien[]).map((k) => ({ id: ids[k], email: USERS[k].email, fullName: USERS[k].name })));
  await db.insert(membership).values([
    { userId: ids.owner, orgId, role: "owner", acceptedAt: new Date() },
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

const ayerLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(Date.now() - 86_400_000));

test("WHEN el usuario crea una tarea vencida y pulsa Reprogramar pendientes THE SYSTEM SHALL mostrarla después de ahora", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  expect((await page.goto(`/${orgId}/agenda`))?.status()).toBe(200);
  const form = page.getByRole("form", { name: "Nuevo en la agenda" });
  await form.getByLabel("Título", { exact: true }).fill("Llamar a proveedor");
  await form.getByLabel("Fecha").fill(ayerLocal());
  await form.getByLabel("Hora").fill("10:00");
  await page.getByRole("button", { name: "Agregar a la agenda" }).click();
  await page.waitForURL(`**/${orgId}/agenda`);

  const antes = Date.now();
  await page.getByRole("button", { name: "Reprogramar pendientes" }).click();
  const tarea = page.locator('[data-event="Llamar a proveedor"] time');
  await expect(tarea).toBeVisible();
  const inicio = Date.parse((await tarea.getAttribute("datetime")) ?? "");
  expect(inicio).toBeGreaterThan(antes);
});

test("WHEN el usuario guarda una página de reservas THE SYSTEM SHALL mostrar su enlace público", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  await page.goto(`/${orgId}/agenda`);
  const form = page.getByRole("form", { name: "Página de reservas" });
  await form.getByLabel("Enlace (minúsculas, números y guiones)").fill(SLUG);
  await form.getByLabel("Título de la página").fill("Citas con la dueña");
  await form.getByLabel("Lunes desde").fill("09:00");
  await form.getByLabel("Lunes hasta").fill("13:00");
  await page.getByRole("button", { name: "Guardar página de reservas" }).click();
  await expect(page.getByRole("link", { name: `/agenda/${SLUG}` })).toHaveAttribute("href", `/agenda/${SLUG}`);
});

test("WHEN un empleado sin agenda abre la agenda THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
  await as(context, "sinPermiso", baseURL);
  expect((await page.goto(`/${orgId}/agenda`))?.status()).toBe(404);
});

test("WHEN AxeBuilder analiza /agenda THE SYSTEM SHALL reportar 0 violaciones", async ({ page, context, baseURL }) => {
  await as(context, "owner", baseURL);
  await page.goto(`/${orgId}/agenda`);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
