// Pronóstico, ingresos contra meta y base de "¿Qué pasa si?" contra el Supabase de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, membership, organization, profile, recordActivity } from "@jotapuntoce/db/schema";
import { addField } from "../server/apps/fields.ts";
import { forecast, revenueVsGoal, whatIfBase } from "../server/insights/forecast.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
const DAY = 86_400_000;

async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-forecast", slug: `t-forecast-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const owner = crypto.randomUUID();
  await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
  profileIds.push(owner);
  await db.insert(membership).values({ userId: owner, orgId: o!.id, role: "owner", acceptedAt: new Date() });
  const [c] = await db.insert(client).values({ orgId: o!.id, name: "Cliente" }).returning();
  return { orgId: o!.id, owner, clientId: c!.id };
}
type Ctx = Awaited<ReturnType<typeof setup>>;
/** Tratos cerrados en el último mes que pasaron por `via` (o sin historial si via es null). */
async function closedDeals(ctx: Ctx, n: number, won: number, via: string | null) {
  const rows = await db
    .insert(deal)
    .values(Array.from({ length: n }, (_, i) => ({ orgId: ctx.orgId, clientId: ctx.clientId, title: `c${i}`, amountCents: 1000_00, stage: i < won ? ("ganado" as const) : ("perdido" as const), closedAt: new Date(Date.now() - 10 * DAY) })))
    .returning({ id: deal.id, stage: deal.stage });
  if (via) await db.insert(recordActivity).values(rows.map((r) => ({ orgId: ctx.orgId, appKey: "ventas", section: "clientes", recordId: r.id, kind: "cambio" as const, body: `Etapa: ${via} → ${r.stage}` })));
}
const openDeal = (ctx: Ctx, stage: "prospecto" | "propuesta", amountCents: number) => db.insert(deal).values({ orgId: ctx.orgId, clientId: ctx.clientId, title: "abierto", amountCents, stage });

describe("pronóstico", () => {
  it("WHEN 10 cerrados pasaron por propuesta y 6 se ganaron THE SYSTEM SHALL usar 0.6 en propuesta", async () => {
    const ctx = await setup();
    await closedDeals(ctx, 10, 6, "propuesta");
    await openDeal(ctx, "propuesta", 100_000_00);
    const r = await forecast(ctx.owner, ctx.orgId);
    if (!r.ok || r.data.sinHistoria) throw new Error("sin pronóstico");
    expect(r.data.byStage.find((s) => s.stage === "propuesta")).toMatchObject({ rate: 0.6, source: "etapa", openCents: 100_000_00 });
    expect(r.data.totalCents).toBe(60_000_00);
  });

  it("WHEN una etapa tiene menos de 5 casos THE SYSTEM SHALL usar la tasa global", async () => {
    const ctx = await setup();
    await closedDeals(ctx, 3, 3, "prospecto");
    await closedDeals(ctx, 3, 0, null);
    await openDeal(ctx, "prospecto", 10_000_00);
    const r = await forecast(ctx.owner, ctx.orgId);
    if (!r.ok || r.data.sinHistoria) throw new Error("sin pronóstico");
    expect(r.data.byStage.find((s) => s.stage === "prospecto")).toMatchObject({ rate: 0.5, source: "global" });
  });

  it("WHEN no hay tratos cerrados en 6 meses THE SYSTEM SHALL devolver sinHistoria", async () => {
    const ctx = await setup();
    await openDeal(ctx, "propuesta", 5_000_00);
    const r = await forecast(ctx.owner, ctx.orgId);
    expect(r.ok ? r.data : null).toEqual({ sinHistoria: true });
    const base = await whatIfBase(ctx.owner, ctx.orgId);
    expect(base.ok ? base.data : null).toMatchObject({ ticketCents: 0, winRate: 0, sinHistoria: true });
  });

  it("WHEN la tarjeta agrupa por Producto THE SYSTEM SHALL sumar los ganados del mes por opción contra su meta", async () => {
    const ctx = await setup();
    const f = await addField(ctx.owner, ctx.orgId, "ventas", { label: "Producto", type: "opcion", options: ["Boda", "XV"] });
    if (!f.ok) throw new Error(f.error.message);
    await db.insert(deal).values([
      { orgId: ctx.orgId, clientId: ctx.clientId, title: "a", amountCents: 50_000_00, stage: "ganado", closedAt: new Date(), custom: { producto: "Boda" } },
      { orgId: ctx.orgId, clientId: ctx.clientId, title: "b", amountCents: 30_000_00, stage: "ganado", closedAt: new Date(), custom: { producto: "Boda" } },
      { orgId: ctx.orgId, clientId: ctx.clientId, title: "c", amountCents: 9_000_00, stage: "propuesta", custom: { producto: "XV" } },
    ]);
    const r = await revenueVsGoal(ctx.owner, ctx.orgId, { field: "producto", goals: { Boda: 100_000_00, XV: 20_000_00 } });
    expect(r.ok ? r.data : null).toEqual([
      { label: "Boda", wonCents: 80_000_00, goalCents: 100_000_00 },
      { label: "XV", wonCents: 0, goalCents: 20_000_00 },
    ]);
  });
});
