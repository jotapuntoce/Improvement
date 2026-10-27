// Fuente de KPI `postventa` (server/kpis/sources.ts) contra el Supabase de desarrollo. Los resueltos se
// siembran con opened_at/resolved_at fijos, así las horas no dependen de cuándo corre.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, organization, ticket } from "@jotapuntoce/db/schema";
import { computeKpiValues, type KpiRow } from "../server/kpis/sources.ts";

const orgIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
});

async function orgWithClient() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-kpi-postventa", slug: `t-kpi-postventa-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  const [c] = await db.insert(client).values({ orgId: row.id, name: "Cliente" }).returning();
  if (!c) throw new Error("insert de client no devolvió fila");
  return { orgId: row.id, clientId: c.id };
}

async function values(orgId: string, configs: unknown[]) {
  const rows: KpiRow[] = configs.map((config) => ({
    id: crypto.randomUUID(), orgId, label: "k", hint: null, source: "postventa", config, manualValue: null, format: "numero",
  }));
  const map = await computeKpiValues(rows);
  return rows.map((r) => map.get(r.id));
}

const METRICAS = [{}, { metrica: "satisfaccion_promedio" }, { metrica: "horas_promedio_resolucion" }];

describe("fuente postventa", () => {
  it("WHEN hay resueltos de 2 y 5 horas calificados 4 y 5 y un abierto THE SYSTEM SHALL devolver 1, 4.5 y 4", async () => {
    const { orgId, clientId } = await orgWithClient();
    const opened = new Date("2026-10-01T10:00:00Z");
    const hours = (h: number) => new Date(opened.getTime() + h * 60 * 60 * 1000);
    await db.insert(ticket).values([
      { orgId, clientId, title: "a", status: "resuelto", openedAt: opened, resolvedAt: hours(2), satisfaction: 4 },
      { orgId, clientId, title: "b", status: "resuelto", openedAt: opened, resolvedAt: hours(5), satisfaction: 5 },
      { orgId, clientId, title: "c" },
    ]);
    expect(await values(orgId, METRICAS)).toEqual([1, 4.5, 4]);
  });

  it("WHEN no hay tickets resueltos THE SYSTEM SHALL devolver 0 de satisfacción y de horas", async () => {
    const { orgId, clientId } = await orgWithClient();
    await db.insert(ticket).values({ orgId, clientId, title: "c" });
    expect(await values(orgId, METRICAS.slice(1))).toEqual([0, 0]);
  });
});
