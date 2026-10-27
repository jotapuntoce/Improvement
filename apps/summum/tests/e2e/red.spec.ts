// La red de un muelle (afiliadas y Sello) de punta a punta. Siembra un muelle con un dueño sin
// muelle_settings, la especialidad `comercial`, una afiliada activa y un perfil sin relación con el
// muelle; para el directorio, la afiliada con opt-in y Sello vigente de 30, otra afiliada con opt-in y solo
// evaluación pendiente, y un barco con dueño y Sello en riesgo sin ficha. Borra todo al final. Los pasos que agregan pantallas de Summum extienden este archivo.
import { test, expect, type BrowserContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, membership, organization, PERSONALITY_QUESTIONS, profile, sealEvaluation, specialty } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const people = {
  owner: { email: `red-owner-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
  afiliada: { email: `red-afiliada-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
  ajeno: { email: `red-ajeno-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
  barquero: { email: `red-barquero-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
};
let muelleId = "";
let barcoId = "";
const pendienteProfileId = crypto.randomUUID();
const affiliateIds: string[] = [];
const anaSlug = `ana-comercial-${stamp}`;
const barcoName = `Barco Rojo ${stamp}`;

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
  const [ana] = await db
    .insert(affiliate)
    .values({
      profileId: people.afiliada.id,
      muelleOrgId: muelleId,
      displayName: "Ana Comercial",
      specialtyKeys: ["comercial"],
      publicSlug: anaSlug,
      directoryOptIn: true,
    })
    .returning();
  await db.insert(profile).values({ id: pendienteProfileId, email: `red-pendiente-${stamp}@example.com` });
  const [beto] = await db
    .insert(affiliate)
    .values({
      profileId: pendienteProfileId,
      muelleOrgId: muelleId,
      displayName: "Beto Pendiente",
      specialtyKeys: ["comercial"],
      publicSlug: `beto-pendiente-${stamp}`,
      directoryOptIn: true,
    })
    .returning();
  if (!ana || !beto) throw new Error("insert de affiliate no devolvió fila");
  affiliateIds.push(ana.id, beto.id);
  const [boat] = await db
    .insert(organization)
    .values({ name: barcoName, slug: `red-barco-${stamp}`, kind: "barco", parentOrgId: muelleId })
    .returning();
  if (!boat) throw new Error("insert de barco no devolvió fila");
  barcoId = boat.id;
  await db.insert(membership).values({ userId: people.barquero.id, orgId: barcoId, role: "owner", acceptedAt: new Date() });
  const approved = { muelleOrgId: muelleId, approvalStatus: "aprobada" as const, approvedAt: new Date("2026-09-15T12:00:00Z") };
  await db.insert(sealEvaluation).values([
    { ...approved, subjectKind: "afiliada", affiliateId: ana.id, score: 30, vigencia: "vigente" },
    { muelleOrgId: muelleId, subjectKind: "afiliada", affiliateId: beto.id, score: 25 },
    { ...approved, subjectKind: "barco", barcoOrgId: barcoId, score: 20, vigencia: "en_riesgo", riskSince: new Date() },
  ]);
});

test.afterAll(async () => {
  if (barcoId) await db.delete(organization).where(eq(organization.id, barcoId));
  if (muelleId) await db.delete(organization).where(eq(organization.id, muelleId)); // cascade
  await db.delete(profile).where(eq(profile.id, pendienteProfileId));
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

test("WHEN un visitante sin sesión abre /directorio THE SYSTEM SHALL mostrar a la afiliada aprobada Vigente y no a la pendiente ni al barco sin opt-in", async ({ page, context }) => {
  await context.clearCookies();
  const response = await page.goto("/directorio");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Directorio Summum" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Ana Comercial" })).toContainText("Vigente");
  await expect(page.getByText("Beto Pendiente")).toHaveCount(0);
  await expect(page.getByText(barcoName)).toHaveCount(0);
});

test("WHEN un visitante abre la ficha de la afiliada THE SYSTEM SHALL mostrar su nombre y Puntaje 30; un slug inexistente da 404", async ({ page, context }) => {
  await context.clearCookies();
  const response = await page.goto(`/directorio/${anaSlug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Ana Comercial" })).toBeVisible();
  await expect(page.getByText("Puntaje 30")).toBeVisible();
  expect((await page.goto("/directorio/no-existe"))?.status()).toBe(404);
});

test("WHEN el dueño del barco guarda el opt-in con un slug THE SYSTEM SHALL mostrar el barco En riesgo en /directorio", async ({ page, context, baseURL }) => {
  await as(context, people.barquero.token, baseURL);
  await page.goto(`/barco/${barcoId}`);
  await page.getByLabel("Liga pública").fill(`barco-rojo-${stamp}`);
  await page.getByLabel("Aparecer en el directorio").check();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByRole("button", { name: "Guardar ficha" }).click(),
  ]);
  await context.clearCookies();
  await page.goto("/directorio");
  await expect(page.getByRole("listitem").filter({ hasText: barcoName })).toContainText("En riesgo");
});

test("WHEN se descarga el HTML de /directorio THE SYSTEM SHALL no contener el id del barco ni de ninguna afiliada", async ({ request }) => {
  const html = await (await request.get("/directorio")).text();
  for (const id of [barcoId, ...affiliateIds]) expect(html).not.toContain(id);
});
