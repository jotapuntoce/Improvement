// La red de un muelle (afiliadas y Sello) de punta a punta. Siembra un muelle con un dueño sin
// muelle_settings, la especialidad `comercial`, una afiliada activa y un perfil sin relación con el
// muelle; borra todo al final. Los pasos que agregan pantallas de Summum extienden este archivo.
import { test, expect, type BrowserContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, membership, organization, PERSONALITY_QUESTIONS, profile, specialty } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const people = {
  owner: { email: `red-owner-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
  afiliada: { email: `red-afiliada-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
  ajeno: { email: `red-ajeno-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
};
let muelleId = "";

test.beforeAll(async () => {
  for (const p of Object.values(people)) {
    p.id = await createTestAuthUser(p.email, p.password);
    await db.insert(profile).values({ id: p.id, email: p.email });
    p.token = await signInTestUser(p.email, p.password);
  }
  const [dock] = await db.insert(organization).values({ name: "Red E2E", slug: `red-e2e-${stamp}`, kind: "muelle" }).returning();
  if (!dock) throw new Error("insert de organization no devolvió fila");
  muelleId = dock.id;
  await db.insert(membership).values({ userId: people.owner.id, orgId: muelleId, role: "owner", acceptedAt: new Date() });
  await db.insert(specialty).values({ muelleOrgId: muelleId, key: "comercial", label: "Comercial" });
  await db.insert(affiliate).values({
    profileId: people.afiliada.id,
    muelleOrgId: muelleId,
    displayName: "Ana Comercial",
    specialtyKeys: ["comercial"],
    publicSlug: `ana-comercial-${stamp}`,
  });
});

test.afterAll(async () => {
  if (muelleId) await db.delete(organization).where(eq(organization.id, muelleId)); // cascade
  for (const p of Object.values(people)) {
    if (!p.id) continue;
    await db.delete(profile).where(eq(profile.id, p.id));
    await deleteTestAuthUser(p.id);
  }
});

async function as(context: BrowserContext, token: string, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "sum-access-token", value: token, url: baseURL ?? "http://localhost:3300" }]);
}

test("WHEN un dueño del muelle abre /muelle/[muelleId]/afiliadas THE SYSTEM SHALL responder 200 con la afiliada en la lista", async ({ page, context, baseURL }) => {
  await as(context, people.owner.token, baseURL);
  const response = await page.goto(`/muelle/${muelleId}/afiliadas`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Afiliadas" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Ana Comercial" })).toBeVisible();
});

test("WHEN un dueño abre /muelle/[muelleId]/sello sin muelle_settings THE SYSTEM SHALL decir que no hay mínimo", async ({ page, context, baseURL }) => {
  await as(context, people.owner.token, baseURL);
  const response = await page.goto(`/muelle/${muelleId}/sello`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Sello Cénit" })).toBeVisible();
  await expect(page.getByText("Sin mínimo definido: nadie se puede certificar todavía.")).toBeVisible();
});

test("WHEN la afiliada abre /red/[muelleId]/afiliada THE SYSTEM SHALL mostrar su perfil y un fieldset por pregunta", async ({ page, context, baseURL }) => {
  await as(context, people.afiliada.token, baseURL);
  const response = await page.goto(`/red/${muelleId}/afiliada`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Mi perfil de afiliada" })).toBeVisible();
  await expect(page.locator("fieldset")).toHaveCount(PERSONALITY_QUESTIONS.length);
});

test("WHEN un perfil sin relación abre la red o el panel de afiliadas THE SYSTEM SHALL responder 404 en las dos", async ({ page, context, baseURL }) => {
  await as(context, people.ajeno.token, baseURL);
  expect((await page.goto(`/red/${muelleId}/afiliada`))?.status()).toBe(404);
  expect((await page.goto(`/muelle/${muelleId}/afiliadas`))?.status()).toBe(404);
});
