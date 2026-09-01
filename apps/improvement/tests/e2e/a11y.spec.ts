// Único spec E2E del proyecto (blueprint §15) — corre contra un build de producción real
// (playwright.config.ts webServer: `pnpm build && pnpm start`). Crea y limpia su propia
// organización/usuario de prueba vía @jotapuntoce/db/test-fixtures (el único punto donde este
// archivo toca la service-role key es indirecto, a través de ese paquete — nunca la importa él
// mismo, ver testFixtures.ts).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, area, objective, orgBuildStage } from "@jotapuntoce/db/schema";
import { createTestAuthUser, deleteTestAuthUser, signInTestUser } from "@jotapuntoce/db/test-fixtures";

const OWNER_EMAIL = `a11y-owner-${Date.now()}@example.com`;
const OWNER_PASSWORD = crypto.randomUUID();

let orgId: string;
let ownerId: string;
let accessToken: string;

test.beforeAll(async () => {
  ownerId = await createTestAuthUser(OWNER_EMAIL, OWNER_PASSWORD);

  const [org] = await db
    .insert(organization)
    .values({ name: "a11y E2E", slug: `a11y-e2e-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgId = org.id;

  await db.insert(profile).values({ id: ownerId, email: OWNER_EMAIL });
  await db.insert(membership).values({ userId: ownerId, orgId, role: "owner", acceptedAt: new Date() });

  const [areaRow] = await db
    .insert(area)
    .values({ orgId, name: "Ventas", color: "#7c5cff" })
    .returning();
  if (!areaRow) throw new Error("insert de area no devolvió fila");

  await db.insert(objective).values({
    orgId,
    areaId: areaRow.id,
    title: "Objetivo de prueba a11y",
    impactWeight: 20,
    assignedEmployeeId: ownerId,
    status: "in_progress",
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await db.insert(orgBuildStage).values({
    orgId,
    stageOrder: 1,
    stageName: "Análisis",
    description: "Etapa de prueba para el escaneo de accesibilidad.",
    status: "en_progreso",
  });

  accessToken = await signInTestUser(OWNER_EMAIL, OWNER_PASSWORD);
});

test.afterAll(async () => {
  if (orgId) await db.delete(organization).where(eq(organization.id, orgId)); // cascade
  if (ownerId) {
    await db.delete(profile).where(eq(profile.id, ownerId));
    await deleteTestAuthUser(ownerId);
  }
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    {
      name: "sb-access-token",
      value: accessToken,
      url: baseURL ?? "http://localhost:3200",
    },
  ]);
});

const ROUTES: { label: string; path: () => string }[] = [
  { label: "/login", path: () => "/login" },
  // ?fallback=1 fuerza SceneListFallback — axe-core no puede auditar un <canvas> WebGL de forma
  // significativa (ver apps/improvement/app/[org]/dashboard/Scene3D.tsx).
  { label: "/[org]/dashboard", path: () => `/${orgId}/dashboard?fallback=1` },
  { label: "/[org]/objetivos", path: () => `/${orgId}/objetivos` },
  { label: "/[org]/mapa", path: () => `/${orgId}/mapa` },
];

for (const route of ROUTES) {
  test(
    `WHEN a11y.spec.ts corre contra ${route.label} THE SYSTEM SHALL reportar cero violaciones ` +
      "de axe-core con impacto serious o critical",
    async ({ page }) => {
      await page.goto(route.path());
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page }).analyze();
      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

      expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
    },
  );
}
