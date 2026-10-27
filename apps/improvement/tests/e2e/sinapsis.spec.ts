// La sinapsis del lado del dueño, contra el build de producción: "Tu perfil y tu red", los especialistas
// propuestos en /necesidades y el catálogo de la red en /powerups. Siembra un muelle en modo `red` con un
// premio de red, un barco con dueño y empleado, y un org sin muelle; no crea ni toca premios globales.
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  affiliate,
  area,
  membership,
  muelleSettings,
  organization,
  orgNeed,
  powerupPartner,
  profile,
  specialistProposal,
  specialty,
} from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const people = {
  owner: { email: `sinapsis-owner-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
  employee: { email: `sinapsis-employee-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
  solo: { email: `sinapsis-solo-${stamp}@example.com`, password: crypto.randomUUID(), id: "", token: "" },
};
const anaProfileId = crypto.randomUUID();
let muelleId = "";
let barcoId = "";
let soloId = "";

async function newOrg(values: typeof organization.$inferInsert) {
  const [row] = await db.insert(organization).values(values).returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  return row.id;
}

test.beforeAll(async () => {
  for (const p of Object.values(people)) {
    p.id = await createTestAuthUser(p.email, p.password);
    await db.insert(profile).values({ id: p.id, email: p.email });
    p.token = await signInTestUser(p.email, p.password);
  }
  muelleId = await newOrg({ name: "Muelle Sinapsis", slug: `sinapsis-muelle-${stamp}`, kind: "muelle" });
  barcoId = await newOrg({ name: "Barco Sinapsis", slug: `sinapsis-barco-${stamp}`, kind: "barco", parentOrgId: muelleId });
  soloId = await newOrg({ name: "Empresa sin red", slug: `sinapsis-solo-${stamp}` });

  await db.insert(muelleSettings).values({ muelleOrgId: muelleId, catalogMode: "red" });
  await db.insert(specialty).values({ muelleOrgId: muelleId, key: "comercial", label: "Comercial" });
  await db.insert(powerupPartner).values({
    businessName: "Ana Comercial",
    category: "Bienestar",
    discountDescription: "Masaje de la red",
    redemptionInstructions: "Agenda por WhatsApp",
    pointsCost: 10,
    networkOrgId: muelleId,
  });
  await db.insert(membership).values([
    { userId: people.owner.id, orgId: barcoId, role: "owner", acceptedAt: new Date() },
    { userId: people.employee.id, orgId: barcoId, role: "employee", acceptedAt: new Date() },
    { userId: people.solo.id, orgId: soloId, role: "owner", acceptedAt: new Date() },
  ]);

  const [ventas] = await db.insert(area).values({ orgId: barcoId, name: "Ventas", color: "#7c5cff", specialtyKey: "comercial" }).returning();
  const [need] = await db
    .insert(orgNeed)
    .values({ orgId: barcoId, areaId: ventas!.id, title: "Sin cierres de venta", severity: 3, status: "abierta" })
    .returning();
  await db.insert(profile).values({ id: anaProfileId, email: `sinapsis-ana-${stamp}@example.com` });
  const [ana] = await db
    .insert(affiliate)
    .values({ profileId: anaProfileId, muelleOrgId: muelleId, displayName: "Ana Comercial", specialtyKeys: ["comercial"], publicSlug: `ana-sinapsis-${stamp}` })
    .returning();
  await db.insert(specialistProposal).values({
    muelleOrgId: muelleId,
    orgId: barcoId,
    orgNeedId: need!.id,
    affiliateId: ana!.id,
    sealScore: 80,
    matchScore: 70,
    status: "aprobada_socios",
  });
});

test.afterAll(async () => {
  // El premio de red antes que el muelle: network_org_id es `set null` y quedaría en el catálogo global.
  if (muelleId) await db.delete(powerupPartner).where(eq(powerupPartner.networkOrgId, muelleId));
  const orgs = [barcoId, soloId, muelleId].filter(Boolean);
  if (orgs.length) await db.delete(organization).where(inArray(organization.id, orgs)); // cascade
  await db.delete(profile).where(eq(profile.id, anaProfileId));
  for (const p of Object.values(people)) {
    if (!p.id) continue;
    await db.delete(profile).where(eq(profile.id, p.id));
    await deleteTestAuthUser(p.id);
  }
});

async function as(context: BrowserContext, token: string, baseURL: string | undefined) {
  await context.clearCookies();
  await context.addCookies([{ name: "imp-access-token", value: token, url: baseURL ?? "http://localhost:3200" }]);
}

async function expectNoSeriousA11y(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
}

test("WHEN el dueño del barco abre /[org]/improvement/perfil THE SYSTEM SHALL mostrar Tu perfil y tu red con el select del área, sin violaciones serias", async ({ page, context, baseURL }) => {
  await as(context, people.owner.token, baseURL);
  const response = await page.goto(`/${barcoId}/improvement/perfil`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Tu perfil y tu red" })).toBeVisible();
  await expect(page.getByLabel("Especialidad de Ventas")).toHaveValue("comercial");
  await page.waitForLoadState("networkidle");
  await expectNoSeriousA11y(page);
});

test("WHEN el dueño sin muelle abre su perfil THE SYSTEM SHALL decir que no está en una red; el empleado recibe 404", async ({ page, context, baseURL }) => {
  await as(context, people.solo.token, baseURL);
  await page.goto(`/${soloId}/improvement/perfil`);
  await expect(page.getByText("Tu empresa todavía no está en una red Summum.")).toBeVisible();
  await as(context, people.employee.token, baseURL);
  expect((await page.goto(`/${barcoId}/improvement/perfil`))?.status()).toBe(404);
});

test("WHEN el dueño abre /[org]/necesidades y acepta a Ana Comercial THE SYSTEM SHALL mostrarla En curso", async ({ page, context, baseURL }) => {
  await as(context, people.owner.token, baseURL);
  await page.goto(`/${barcoId}/necesidades`);
  const section = page.getByRole("region", { name: "Especialistas propuestos" });
  await expect(section.getByText("Ana Comercial")).toBeVisible();
  await section.getByRole("button", { name: "Aceptar especialista" }).click();
  await expect(page.getByRole("region", { name: "Especialistas propuestos" }).getByText("En curso")).toBeVisible();
});

test("WHEN el dueño del barco abre /[org]/powerups THE SYSTEM SHALL mostrar Masaje de la red", async ({ page, context, baseURL }) => {
  await as(context, people.owner.token, baseURL);
  const response = await page.goto(`/${barcoId}/powerups`);
  expect(response?.status()).toBe(200);
  await expect(page.getByText("Masaje de la red")).toBeVisible();
});
