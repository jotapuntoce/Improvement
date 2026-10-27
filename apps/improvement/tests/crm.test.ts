// Tratos, hiperpersonalización y KPI ventas (server/crm/*, server/kpis/sources.ts) contra el Supabase
// de desarrollo. Los tratos del mes se siembran con closed_at = ahora y el viejo con ahora - 40 días,
// así el resultado no depende del día en que corre.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, clientPreference, deal, membership, organization, profile } from "@jotapuntoce/db/schema";
import { createDeal, listPipeline, moveDeal, mxMonthStart } from "../server/crm/deals.ts";
import { HIPER_QUESTIONS, getClientPreference, saveClientPreference } from "../server/crm/preferences.ts";
import { computeKpiValues, type KpiRow } from "../server/kpis/sources.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-crm", slug: `t-crm-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}

async function newClient(orgId: string) {
  const [row] = await db.insert(client).values({ orgId, name: "Cliente" }).returning();
  if (!row) throw new Error("insert de client no devolvió fila");
  return row.id;
}

const codeOf = (r: { ok: boolean; error?: { code: string } }) => r.error?.code;

describe("mxMonthStart", () => {
  it("WHEN el instante cruza la medianoche de CDMX THE SYSTEM SHALL cambiar de mes en ese momento", () => {
    expect(mxMonthStart(new Date("2026-11-01T05:59:00Z"))).toBe("2026-10-01");
    expect(mxMonthStart(new Date("2026-11-01T06:00:00Z"))).toBe("2026-11-01");
  });
});

describe("HIPER_QUESTIONS", () => {
  it("WHEN se lee THE SYSTEM SHALL tener las seis llaves en orden", () => {
    expect(HIPER_QUESTIONS.map((q) => q.key)).toEqual([
      "como_atenderlo", "expectativa", "como_arreglarlo", "valor_agregado", "extra_por_ser_cliente", "como_se_siente_valorado",
    ]);
  });
});

describe("tratos", () => {
  it("WHEN el dueño gana un trato y lo regresa a negociación THE SYSTEM SHALL fijar y luego limpiar closed_at", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const c = await newClient(o);
    const created = await createDeal(owner, o, { clientId: c, title: "Remodelación", amountCents: 150000, ownerProfileId: null });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.data.id;
    const closedAt = async () => (await db.select().from(deal).where(eq(deal.id, id)))[0]?.closedAt;

    expect(await moveDeal(owner, o, id, "ganado")).toEqual({ ok: true, data: true });
    expect(await closedAt()).not.toBeNull();
    expect(await moveDeal(owner, o, id, "negociacion")).toEqual({ ok: true, data: true });
    expect(await closedAt()).toBeNull();

    const pipeline = await listPipeline(owner, o);
    expect(pipeline.map((g) => g.stage)).toEqual(["prospecto", "propuesta", "negociacion", "ganado", "perdido"]);
    expect(pipeline.find((g) => g.stage === "negociacion")?.deals[0]?.clientName).toBe("Cliente");
  });
});

describe("fuente ventas", () => {
  it("WHEN hay dos ganados este mes, uno de hace 40 días y uno perdido THE SYSTEM SHALL devolver 2000 pesos y 2 tratos", async () => {
    const o = await org();
    const c = await newClient(o);
    const now = new Date();
    const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    await db.insert(deal).values([
      { orgId: o, clientId: c, title: "a", amountCents: 150000, stage: "ganado", closedAt: now },
      { orgId: o, clientId: c, title: "b", amountCents: 50000, stage: "ganado", closedAt: now },
      { orgId: o, clientId: c, title: "c", amountCents: 900000, stage: "ganado", closedAt: old },
      { orgId: o, clientId: c, title: "d", amountCents: 70000, stage: "perdido", closedAt: now },
    ]);
    const rows: KpiRow[] = [{}, { metrica: "tratos_ganados" }].map((config) => ({
      id: crypto.randomUUID(), orgId: o, label: "v", hint: null, source: "ventas", config, manualValue: null, format: "dinero",
    }));
    const values = await computeKpiValues(rows);
    expect(rows.map((r) => values.get(r.id))).toEqual([2000, 2]);
  });
});

describe("hiperpersonalización", () => {
  it("WHEN se guardan las seis respuestas THE SYSTEM SHALL dejarlas en answers; más de 1000 caracteres es VALIDATION_ERROR", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const c = await newClient(o);
    const answers = Object.fromEntries(HIPER_QUESTIONS.map((q) => [q.key, `Respuesta ${q.key}`]));
    const saved = await saveClientPreference(owner, o, c, answers);
    expect(saved.ok).toBe(true);
    expect((await getClientPreference(owner, o, c))?.answers).toEqual(answers);

    const tooLong = await saveClientPreference(owner, o, c, { expectativa: "x".repeat(1001) });
    expect(codeOf(tooLong)).toBe("VALIDATION_ERROR");
    const [row] = await db.select().from(clientPreference).where(eq(clientPreference.clientId, c));
    expect(row?.answers).toEqual(answers);
  });
});

describe("alcances", () => {
  it("WHEN un empleado sin clientes escribe o lee THE SYSTEM SHALL devolver FORBIDDEN y null", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const emp = await person(o, "employee");
    const c = await newClient(o);
    await saveClientPreference(owner, o, c, { expectativa: "Puntualidad" });

    expect(codeOf(await createDeal(emp, o, { clientId: c, title: "Trato", amountCents: 1, ownerProfileId: null }))).toBe("FORBIDDEN");
    expect(codeOf(await saveClientPreference(emp, o, c, { expectativa: "x" }))).toBe("FORBIDDEN");
    expect(await getClientPreference(emp, o, c)).toBeNull();
  });

  it("WHEN el cliente es de otro org THE SYSTEM SHALL devolver NOT_FOUND", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const foreign = await newClient(await org());
    expect(codeOf(await saveClientPreference(owner, o, foreign, {}))).toBe("NOT_FOUND");
    expect(codeOf(await createDeal(owner, o, { clientId: foreign, title: "Ajeno", amountCents: 1, ownerProfileId: null }))).toBe("NOT_FOUND");
  });
});
