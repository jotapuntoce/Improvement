// Punta a punta en MODO DE PRUEBA de Stripe: el barco cobra 100 MXN y el muelle ve 10 MXN para Summum.
//
// PRERREQUISITOS MANUALES (sin ellos la prueba se SALTA, no falla):
//  1. Llaves de prueba en .env.local: STRIPE_SECRET_KEY=sk_test_…, y los dos secretos de webhook.
//  2. Dos terminales, y copiar cada whsec_… a su variable:
//       stripe listen --forward-to localhost:3300/api/stripe/webhook            -> STRIPE_WEBHOOK_SECRET
//       stripe listen --forward-connect-to localhost:3300/api/stripe/connect    -> STRIPE_CONNECT_WEBHOOK_SECRET
//  3. Una cuenta conectada de PRUEBA ya verificada; su acct_… va en E2E_STRIPE_ACCOUNT_ID (no es secreta).
//  Además: DATABASE_URL y SUPABASE_SERVICE_ROLE_KEY (siembra y limpieza), NEXT_PUBLIC_SUMMUM_URL=http://localhost:3300.
// Correr: pnpm --filter @jotapuntoce/summum test:e2e
import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

const missing = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "E2E_STRIPE_ACCOUNT_ID",
].filter((k) => !process.env[k]);
const notTestKey = !!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.startsWith("sk_test_");

test.skip(
  missing.length > 0 || notTestKey,
  missing.length > 0
    ? `Faltan variables de Stripe en modo de prueba: ${missing.join(", ")} (ver prerrequisitos en el encabezado)`
    : "STRIPE_SECRET_KEY no es una llave de prueba (sk_test_…)",
);

const password = `Pw-${crypto.randomUUID()}`;
const email = `e2e-${Date.now()}@example.com`;
let dockId = "", boatId = "", ownerId = "";

// Imports dinámicos: sin DATABASE_URL, importar @jotapuntoce/db revienta al cargar el archivo,
// y el skip de arriba debe poder evaluarse antes.
const loadDb = async () => ({
  ...(await import("@jotapuntoce/db")),
  ...(await import("@jotapuntoce/db/schema")),
  ...(await import("@jotapuntoce/db/test-fixtures")),
});

test.beforeAll(async () => {
  const { db, feeRate, membership, organization, profile, stripeAccount, createTestAuthUser } = await loadDb();
  ownerId = await createTestAuthUser(email, password);
  await db.insert(profile).values({ id: ownerId, email });
  const [dock] = await db.insert(organization).values({ name: "e2e-muelle", slug: `e2e-m-${Date.now()}`, kind: "muelle" }).returning();
  const [boat] = await db.insert(organization).values({ name: "e2e-barco", slug: `e2e-b-${Date.now()}`, parentOrgId: dock!.id }).returning();
  dockId = dock!.id;
  boatId = boat!.id;
  await db.insert(membership).values([
    { userId: ownerId, orgId: dockId, role: "owner", acceptedAt: new Date() },
    { userId: ownerId, orgId: boatId, role: "owner", acceptedAt: new Date() },
  ]);
  await db.insert(stripeAccount).values({ orgId: boatId, stripeAccountId: process.env.E2E_STRIPE_ACCOUNT_ID!, chargesEnabled: true, payoutsEnabled: true });
  await db.insert(feeRate).values({ muelleOrgId: dockId, chargeKind: "venta_propia", percentBps: 1000 });
});

test.afterAll(async () => {
  if (!ownerId) return; // beforeAll no llegó a sembrar
  const { db, ledgerEntry, organization, profile, deleteTestAuthUser } = await loadDb();
  await db.delete(ledgerEntry).where(eq(ledgerEntry.barcoOrgId, boatId));
  await db.delete(organization).where(inArray(organization.id, [boatId, dockId]));
  await db.delete(profile).where(eq(profile.id, ownerId));
  await deleteTestAuthUser(ownerId);
});

test("WHEN el barco cobra 100 MXN con tarjeta de prueba THE SYSTEM SHALL mostrar 10 MXN para Summum en Dinero", async ({ page }) => {
  const { db, ledgerEntry } = await loadDb();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto(`/barco/${boatId}`);
  await page.getByPlaceholder("Concepto").fill("Servicio e2e");
  await page.getByPlaceholder("Monto MXN").fill("100");
  await page.getByRole("button", { name: "Crear liga de cobro" }).click();

  // Checkout hospedado de Stripe: si un selector cambia, inspeccionar con `playwright test --debug`.
  await page.waitForURL(/checkout\.stripe\.com/);
  await page.getByLabel(/email/i).fill(email);
  await page.getByPlaceholder("1234 1234 1234 1234").fill("4242424242424242");
  await page.getByPlaceholder("MM / YY").fill("12 / 34");
  await page.getByPlaceholder("CVC").fill("123");
  await page.getByLabel(/nombre|name/i).first().fill("Prueba E2E");
  await page.getByRole("button", { name: /pagar|pay/i }).click();
  await page.waitForURL(new RegExp(`/barco/${boatId}\?cobro=ok`));

  await expect
    .poll(async () => (await db.select().from(ledgerEntry).where(eq(ledgerEntry.barcoOrgId, boatId))).length, { timeout: 30_000 })
    .toBe(1);

  await page.goto(`/muelle/${dockId}/dinero`);
  await expect(page.getByText(/Para Summum:\s*\$10\.00/)).toBeVisible();
});
