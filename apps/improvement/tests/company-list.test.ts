import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { buildCompanyList, deriveStageLabel, type StageRow } from "../server/companies/companyList.ts";
import { loadCompanies } from "../server/companies/loadCompanies.ts";
import { updateCompanyIndustry } from "../server/companies/mutations.ts";

describe("deriveStageLabel", () => {
  it("WHEN hay una etapa en_progreso THE SYSTEM SHALL devolver su stageName aunque haya otras completadas", () => {
    const label = deriveStageLabel([
      { stageOrder: 1, stageName: "Análisis", status: "completada" },
      { stageOrder: 2, stageName: "Diseño", status: "en_progreso" },
    ]);
    expect(label).toBe("Diseño");
  });

  it("WHEN no hay ninguna en_progreso pero la última está completada THE SYSTEM SHALL devolver esa", () => {
    expect(deriveStageLabel([{ stageOrder: 1, stageName: "Análisis", status: "completada" }])).toBe(
      "Análisis",
    );
  });

  it("WHEN no hay ninguna etapa THE SYSTEM SHALL devolver 'Sin etapa activa'", () => {
    expect(deriveStageLabel([])).toBe("Sin etapa activa");
  });
});

describe("buildCompanyList", () => {
  it("WHEN hay 2 organizaciones con etapas propias THE SYSTEM SHALL no mezclar las etapas de una con el resumen de la otra", () => {
    const orgs = [
      { id: "org-a", name: "Camibel", industry: "servicios", sectionLabels: {}, role: "owner" },
      { id: "org-b", name: "Afianza", industry: null, sectionLabels: {}, role: "employee" },
    ];
    const stagesA = [{ stageOrder: 1, stageName: "Análisis", status: "en_progreso" as const }];
    const stagesB = [{ stageOrder: 1, stageName: "Diseño", status: "completada" as const }];
    const stagesByOrgId = new Map<string, StageRow[]>([
      ["org-a", stagesA],
      ["org-b", stagesB],
    ]);

    expect(buildCompanyList(orgs, stagesByOrgId)).toEqual([
      {
        orgId: "org-a",
        name: "Camibel",
        industry: "servicios",
        sectionLabels: {},
        role: "owner",
        stageLabel: "Análisis",
        stages: stagesA,
        currentIndex: 0,
      },
      {
        orgId: "org-b",
        name: "Afianza",
        industry: null,
        sectionLabels: {},
        role: "employee",
        stageLabel: "Diseño",
        stages: stagesB,
        currentIndex: 0,
      },
    ]);
  });

  it("WHEN una organización no tiene ninguna fila en stagesByOrgId THE SYSTEM SHALL devolverle 'Sin etapa activa', no lanzar", () => {
    const orgs = [{ id: "org-a", name: "Camibel", industry: null, sectionLabels: {}, role: "owner" }];
    expect(buildCompanyList(orgs, new Map())).toEqual([
      {
        orgId: "org-a",
        name: "Camibel",
        industry: null,
        sectionLabels: {},
        role: "owner",
        stageLabel: "Sin etapa activa",
        stages: [],
        currentIndex: -1,
      },
    ]);
  });
});

describe("loadCompanies — role e industria (hallazgo #1)", () => {
  const createdOrgIds: string[] = [];
  const createdProfileIds: string[] = [];

  afterEach(async () => {
    for (const orgId of createdOrgIds.splice(0)) {
      await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
    }
    for (const userId of createdProfileIds.splice(0)) {
      await db.delete(profile).where(sql`${profile.id} = ${userId}`);
    }
  });

  it(
    "WHEN el usuario es dueño de una empresa y empleado de otra THE SYSTEM SHALL devolver el role " +
      "real de cada membership — es lo que /empresas/configuracion usa para no enseñarle a un " +
      "empleado el organigrama de la empresa de su jefe",
    async () => {
      const [propia] = await db
        .insert(organization)
        .values({ name: "Propia", slug: `propia-${Date.now()}` })
        .returning();
      const [ajena] = await db
        .insert(organization)
        .values({ name: "Ajena", slug: `ajena-${Date.now()}` })
        .returning();
      if (!propia || !ajena) throw new Error("insert de organization no devolvió fila");
      createdOrgIds.push(propia.id, ajena.id);

      const userId = crypto.randomUUID();
      await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
      createdProfileIds.push(userId);
      await db.insert(membership).values([
        { userId, orgId: propia.id, role: "owner", acceptedAt: new Date() },
        { userId, orgId: ajena.id, role: "employee", acceptedAt: new Date() },
      ]);

      const companies = await loadCompanies(userId);
      expect(companies.find((c) => c.orgId === propia.id)?.role).toBe("owner");
      expect(companies.find((c) => c.orgId === ajena.id)?.role).toBe("employee");
    },
  );

  it(
    "WHEN un empleado intenta cambiar el giro de la empresa de su jefe THE SYSTEM SHALL rechazarlo " +
      "con FORBIDDEN y no tocar la fila — updateCompanyIndustry ahora exige findOwnerMembership",
    async () => {
      const [org] = await db
        .insert(organization)
        .values({ name: "Con Empleado", slug: `con-empleado-${Date.now()}`, industry: "otro" })
        .returning();
      if (!org) throw new Error("insert de organization no devolvió fila");
      createdOrgIds.push(org.id);

      const employeeId = crypto.randomUUID();
      await db.insert(profile).values({ id: employeeId, email: `${employeeId}@example.com` });
      createdProfileIds.push(employeeId);
      await db
        .insert(membership)
        .values({ userId: employeeId, orgId: org.id, role: "employee", acceptedAt: new Date() });

      const result = await updateCompanyIndustry(employeeId, org.id, "tecnologia");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("FORBIDDEN");

      const [row] = await db
        .select({ industry: organization.industry })
        .from(organization)
        .where(sql`${organization.id} = ${org.id}`);
      expect(row?.industry).toBe("otro");
    },
  );
});
