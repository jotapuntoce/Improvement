// Integración real contra el proyecto Supabase de desarrollo (blueprint §13) para getBuildMap, y
// un chequeo estático del código fuente de page.tsx para el criterio #1 (sin base de datos —
// exactamente el método que describe el propio criterio: "verificado buscando que la página no
// contenga ningún <form> ni botón con onClick").
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, orgBuildStage, profile, membership } from "@jotapuntoce/db/schema";
import { deriveCurrentStageIndex, getBuildMap } from "../server/scene/buildMap.ts";

async function makeOrg(nameSuffix: string) {
  const [org] = await db
    .insert(organization)
    .values({ name: `Test Org ${nameSuffix}`, slug: `test-org-map-${nameSuffix}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  return org;
}

async function makeOwner(orgId: string) {
  const ownerId = crypto.randomUUID();
  await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
  await db.insert(membership).values({ userId: ownerId, orgId, role: "owner", acceptedAt: new Date() });
  return ownerId;
}

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  if (createdOrgIds.length) {
    for (const orgId of createdOrgIds.splice(0)) {
      await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
    }
  }
  if (createdProfileIds.length) {
    for (const userId of createdProfileIds.splice(0)) {
      await db.delete(profile).where(sql`${profile.id} = ${userId}`);
    }
  }
});

describe("page.tsx — criterio 1", () => {
  it(
    "WHEN un owner intenta llamar a cualquier mutación sobre org_build_stage desde " +
      "apps/improvement THE SYSTEM SHALL no ofrecer ningún control de escritura en el HTML " +
      "servido de /[org]/mapa",
    () => {
      const pagePath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../app/[org]/mapa/page.tsx",
      );
      const source = readFileSync(pagePath, "utf8");

      expect(source).not.toMatch(/<form/i);
      expect(source).not.toMatch(/onClick/);
      expect(source).not.toMatch(/"use server"/);
    },
  );
});

describe("deriveCurrentStageIndex", () => {
  it(
    "WHEN ninguna etapa está en_progreso y la última está completada THE SYSTEM SHALL marcar esa " +
      "última como la etapa actual",
    () => {
      const stages = [{ status: "completada" }, { status: "completada" }, { status: "completada" }];

      expect(deriveCurrentStageIndex(stages)).toBe(2);
    },
  );

  it("WHEN hay una etapa en_progreso THE SYSTEM SHALL marcarla como la actual, aunque no sea la última", () => {
    const stages = [{ status: "completada" }, { status: "en_progreso" }, { status: "bloqueada" }];

    expect(deriveCurrentStageIndex(stages)).toBe(1);
  });

  it("WHEN ninguna etapa está en_progreso y la última no está completada THE SYSTEM SHALL no marcar ninguna", () => {
    const stages = [{ status: "bloqueada" }, { status: "bloqueada" }];

    expect(deriveCurrentStageIndex(stages)).toBe(-1);
  });
});

describe("getBuildMap", () => {
  it("WHEN las etapas se listan THE SYSTEM SHALL respetar stage_order ascendente", async () => {
    const org = await makeOrg("order");
    createdOrgIds.push(org.id);
    const ownerId = await makeOwner(org.id);
    createdProfileIds.push(ownerId);

    // Insertadas deliberadamente fuera de orden.
    await db.insert(orgBuildStage).values([
      { orgId: org.id, stageOrder: 3, stageName: "Lanzamiento", status: "bloqueada" },
      { orgId: org.id, stageOrder: 1, stageName: "Análisis", status: "completada" },
      { orgId: org.id, stageOrder: 2, stageName: "Configuración", status: "en_progreso" },
    ]);

    const map = await getBuildMap(ownerId, org.id);

    expect(map.stages.map((s) => s.stageOrder)).toEqual([1, 2, 3]);
    expect(map.currentIndex).toBe(1); // la etapa 2, en_progreso
  });
});
