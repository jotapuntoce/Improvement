// Vigencia del Sello (server/seal/vigencia.ts) y su cron. Cada runSealCycle pasa el muelle de su fixture:
// el Supabase es el compartido con producción y un ciclo sin alcance tocaría muelles reales.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import {
  muelleSettings,
  organization,
  sealEvaluation,
  sealRequirement,
  sealRequirementResult,
} from "@jotapuntoce/db/schema";
import { nextVigencia, runSealCycle } from "../server/seal/vigencia.ts";
import { GET } from "../app/api/cron/sello/route.ts";

const orgIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

async function org(kind: "muelle" | "barco", parentOrgId?: string) {
  const [row] = await db
    .insert(organization)
    .values({ name: `t-${kind}`, slug: `t-vig-${crypto.randomUUID()}`, kind, parentOrgId })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

/** Muelle con mínimo 10 y un barco con el requisito manual de 10 puntos marcado según `met`. */
async function fixture(met: boolean) {
  const muelle = await org("muelle");
  const barco = await org("barco", muelle);
  await db.insert(muelleSettings).values({ muelleOrgId: muelle, minSealScore: 10, graceDays: 30 });
  const [req] = await db
    .insert(sealRequirement)
    .values({ muelleOrgId: muelle, code: "contrato", title: "Contrato", points: 10, source: "manual" })
    .returning();
  await db
    .insert(sealRequirementResult)
    .values({ muelleOrgId: muelle, requirementId: req!.id, subjectKind: "barco", barcoOrgId: barco, met });
  return { muelle, barco };
}

const evalsOf = (barco: string) => db.select().from(sealEvaluation).where(eq(sealEvaluation.barcoOrgId, barco));

describe("nextVigencia", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const riskSince = new Date("2026-09-01T00:00:00Z");

  it("WHEN vigente sin cumplir THE SYSTEM SHALL pasar a en_riesgo desde now; en_riesgo cumpliendo vuelve a vigente", () => {
    expect(nextVigencia({ vigencia: "vigente", meets: false, riskSince: null, now, graceDays: 30 })).toEqual({ vigencia: "en_riesgo", riskSince: now });
    expect(nextVigencia({ vigencia: "en_riesgo", meets: true, riskSince, now, graceDays: 30 })).toEqual({ vigencia: "vigente", riskSince: null });
  });

  it("WHEN se cumplen los días de gracia THE SYSTEM SHALL pasar a reevaluacion y al doble a suspendido", () => {
    const base = { meets: false, riskSince, graceDays: 30 };
    expect(nextVigencia({ ...base, vigencia: "en_riesgo", now })).toEqual({ vigencia: "reevaluacion", riskSince });
    expect(nextVigencia({ ...base, vigencia: "en_riesgo", now: new Date("2026-09-30T23:59:00Z") }).vigencia).toBe("en_riesgo");
    expect(nextVigencia({ ...base, vigencia: "reevaluacion", now: new Date("2026-10-31T00:00:00Z") }).vigencia).toBe("suspendido");
  });
});

describe("runSealCycle", () => {
  it("WHEN corre dos veces sobre un barco que cumple sin evaluaciones THE SYSTEM SHALL dejar una sola pendiente", async () => {
    const { muelle, barco } = await fixture(true);
    const now = new Date();
    await runSealCycle({ now, muelleId: muelle });
    expect(await runSealCycle({ now, muelleId: muelle })).toEqual({ evaluated: 1, transitions: 0, pending: 1 });
    const rows = await evalsOf(barco);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ approvalStatus: "pendiente", score: 10, minScore: 10 });
  });

  it("WHEN un barco certificado vigente baja del mínimo THE SYSTEM SHALL dejarlo en_riesgo desde now", async () => {
    const { muelle, barco } = await fixture(false);
    await db.insert(sealEvaluation).values({
      muelleOrgId: muelle,
      subjectKind: "barco",
      barcoOrgId: barco,
      score: 10,
      approvalStatus: "aprobada",
      approvedAt: new Date("2026-08-01T00:00:00Z"),
      vigencia: "vigente",
    });
    const now = new Date("2026-10-01T12:00:00Z");
    expect(await runSealCycle({ now, muelleId: muelle })).toEqual({ evaluated: 1, transitions: 1, pending: 0 });
    const [row] = await evalsOf(barco);
    expect(row).toMatchObject({ vigencia: "en_riesgo", score: 0 });
    expect(row?.riskSince?.toISOString()).toBe(now.toISOString());
  });
});

describe("GET /api/cron/sello", () => {
  it("WHEN llega con un bearer incorrecto THE SYSTEM SHALL responder 401 sin escribir evaluaciones", async () => {
    const { barco } = await fixture(true);
    const res = await GET(new Request("http://localhost/api/cron/sello", { headers: { authorization: "Bearer incorrecto" } }));
    expect(res.status).toBe(401);
    expect(await evalsOf(barco)).toEqual([]);
  });
});
