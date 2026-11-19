// Oficina 2D de punta a punta contra el build de producción: el dueño confirma un borrador sembrado
// directo en la base (el e2e no llama a la IA), un empleado con `oficina` ve el plano sin el
// formulario de fotos, otro sin permiso recibe 404, y axe.
import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, officePlan, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const USERS = {
  owner: { email: `oficina-owner-${stamp}@example.com`, password: crypto.randomUUID(), name: "Dueña Oficina" },
  conPermiso: { email: `oficina-emp-${stamp}@example.com`, password: crypto.randomUUID(), name: "Ana Oficina" },
  sinPermiso: { email: `oficina-sin-${stamp}@example.com`, password: crypto.randomUUID(), name: "Beto Oficina" },
};
const PROPUESTA = {
  areas: [
    { name: "Cocina", color: "#22aa66", seats: [{ title: "Chef" }, { title: "Ayudante" }] },
    { name: "Caja", color: "#3366ff", seats: [{ title: "Cajero" }] },
  ],
  theme: null,
  logo: { present: false, description: "" },
  notes: "",
};

let orgId: string;
const ids: Record<keyof typeof USERS, string> = { owner: "", conPermiso: "", sinPermiso: "" };
const tokens: Record<keyof typeof USERS, string> = { owner: "", conPermiso: "", sinPermiso: "" };

test.beforeAll(async () => {
  for (const k of Object.keys(USERS) as (keyof typeof USERS)[]) {
    ids[k] = await createTestAuthUser(USERS[k].email, USERS[k].password);
  }
  const [org] = await db
    .insert(organization)
    .values({ name: "Oficina E2E", slug: `oficina-e2e-${stamp}`, industry: "restaurante" })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;
  await db.insert(profile).values(
    (Object.keys(USERS) as (keyof typeof USERS)[]).map((k) => ({ id: ids[k], email: USERS[k].email, fullName: USERS[k].name })),
  );
  const [tipo] = await db
    .insert(permissionType)
    .values({ orgId, name: "Ve la oficina", grants: { oficina: "empresa" } })
    .returning();
  await db.insert(membership).values([
    { userId: ids.owner, orgId, role: "owner", acceptedAt: new Date() },
    { userId: ids.conPermiso, orgId, role: "employee", acceptedAt: new Date(), permissionTypeId: tipo!.id },
    { userId: ids.sinPermiso, orgId, role: "employee", acceptedAt: new Date() },
  ]);
  await db.insert(officePlan).values({ orgId, status: "draft", proposal: PROPUESTA, createdBy: ids.owner });
  for (const k of Object.keys(USERS) as (keyof typeof USERS)[]) {
    tokens[k] = await signInTestUser(USERS[k].email, USERS[k].password);
  }
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId)); // cascade
  for (const id of Object.values(ids)) {
    if (!id) continue;
    await db.delete(profile).where(eq(profile.id, id));
    await deleteTestAuthUser(id);
  }
});

async function as(context: BrowserContext, token: string, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: token, url: baseURL ?? "http://localhost:3200" }]);
}

test("WHEN el dueño confirma el borrador THE SYSTEM SHALL mostrar el plano con 5 zonas", async ({ page, context, baseURL }) => {
  await as(context, tokens.owner, baseURL);
  expect((await page.goto(`/${orgId}/oficina`))?.status()).toBe(200);
  await expect(page.getByLabel("Nombre del área 1")).toHaveValue("Cocina");
  await page.getByRole("button", { name: "Confirmar oficina" }).click();
  await page.waitForURL(`**/${orgId}/oficina`);
  await expect(page.locator("[data-zone]")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Confirmar oficina" })).toHaveCount(0);
});

test("WHEN un empleado con oficina = empresa entra THE SYSTEM SHALL ver el plano sin el formulario de fotos", async ({ page, context, baseURL }) => {
  await as(context, tokens.conPermiso, baseURL);
  expect((await page.goto(`/${orgId}/oficina`))?.status()).toBe(200);
  await expect(page.locator("[data-zone]")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Analizar mi espacio" })).toHaveCount(0);
  await expect(page.getByLabel("Fotos del local")).toHaveCount(0);
});

test("WHEN un empleado sin permiso entra THE SYSTEM SHALL responder 404", async ({ page, context, baseURL }) => {
  await as(context, tokens.sinPermiso, baseURL);
  expect((await page.goto(`/${orgId}/oficina`))?.status()).toBe(404);
});

test("WHEN AxeBuilder analiza la oficina del dueño THE SYSTEM SHALL reportar 0 violaciones", async ({ page, context, baseURL }) => {
  await as(context, tokens.owner, baseURL);
  await page.goto(`/${orgId}/oficina`);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

// Paso 14: la oficina convive con el Lobby. Sin plano confirmado, la recepción es exactamente la de antes.
let orgSinPlano: string | undefined;
test.afterAll(async () => {
  if (orgSinPlano) await db.delete(organization).where(eq(organization.id, orgSinPlano));
});

test("WHEN el dueño entra a la recepción de un org sin plano THE SYSTEM SHALL mostrar las mismas puertas de antes", async ({ page, context, baseURL }) => {
  const [org] = await db
    .insert(organization)
    .values({ name: "Recepcion Sin Plano E2E", slug: `recepcion-sin-plano-${stamp}` })
    .returning();
  orgSinPlano = org!.id;
  await db.insert(membership).values({ userId: ids.owner, orgId: orgSinPlano, role: "owner", acceptedAt: new Date() });

  await as(context, tokens.owner, baseURL);
  await page.goto(`/empresas/${orgSinPlano}`);
  await page.getByRole("button", { name: "Entrar a Recepcion Sin Plano E2E" }).click();
  await expect(page.locator(".jpc-reception-door").first()).toBeVisible();
  const hrefs = await page.locator(".jpc-reception-door").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(new Set(hrefs)).toEqual(
    new Set(["mapa", "cobros", "proyectos", "postventa", "direccion", "necesidades", "improvement"].map((s) => `/${orgSinPlano}/${s}`)),
  );
  await expect(page.locator("[data-zone]")).toHaveCount(0);
});

test("WHEN un miembro entra a un org con plano confirmado THE SYSTEM SHALL mostrar el svg de la oficina", async ({ page, context, baseURL }) => {
  await as(context, tokens.conPermiso, baseURL);
  await page.goto(`/empresas/${orgId}`);
  await page.getByRole("button", { name: "Entrar a Oficina E2E" }).click();
  await expect(page.getByRole("img", { name: "Oficina de Oficina E2E" })).toBeVisible();
  await expect(page.locator("[data-zone]")).toHaveCount(5);
});
