// Tarjetas del tablero contra el Supabase de desarrollo: permisos al agregar y al ver, acomodo,
// barras de Ventas por etapa y el tablero inicial por rol.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { ensureOrgApps } from "../server/apps/catalog.ts";
import { addCard, cardData, listCards, moveCard, removeCard, seedDefaultCards } from "../server/dashboard/cards.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee", grants?: Record<string, string>) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  const [tipo] = grants ? await db.insert(permissionType).values({ orgId, name: `t-${id}`, grants }).returning() : [];
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date(), permissionTypeId: tipo?.id });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-cards", slug: `t-cards-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  await ensureOrgApps(o!.id);
  return { orgId: o!.id, owner: await person(o!.id, "owner") };
}
const titles = async (userId: string, orgId: string) => {
  const r = await listCards(userId, orgId);
  return r.ok ? r.data.map((c) => c.kind) : [];
};

describe("tarjetas del tablero", () => {
  it("WHEN un empleado agrega una lista de una app que no ve THE SYSTEM SHALL rechazarla con FORBIDDEN", async () => {
    const { orgId } = await setup();
    const ana = await person(orgId, "employee", { clientes: "ninguno" });
    const r = await addCard(ana, orgId, { kind: "lista", config: { app: "ventas" } });
    expect(r.ok ? null : r.error.code).toBe("FORBIDDEN");
  });

  it("WHEN después le quitan el permiso de la app THE SYSTEM SHALL devolver NO_ACCESS sin datos", async () => {
    const { orgId } = await setup();
    const ana = await person(orgId, "employee", { clientes: "empresa" });
    expect((await addCard(ana, orgId, { kind: "lista", config: { app: "ventas" } })).ok).toBe(true);
    const [m] = await db.select().from(membership).where(eq(membership.userId, ana));
    await db.update(permissionType).set({ grants: { clientes: "ninguno" } }).where(eq(permissionType.id, m!.permissionTypeId!));
    const cards = await listCards(ana, orgId);
    const r = await cardData(ana, orgId, cards.ok ? cards.data[0]! : (null as never));
    expect(r.ok ? null : r.error.code).toBe("NO_ACCESS");
  });

  it("WHEN la persona sube la segunda tarjeta THE SYSTEM SHALL dejarla primera, y quitar la deja fuera", async () => {
    const { orgId, owner } = await setup();
    await addCard(owner, orgId, { kind: "hoy", config: {} });
    const second = await addCard(owner, orgId, { kind: "momentos", config: {} });
    expect(await titles(owner, orgId)).toEqual(["hoy", "momentos"]);
    await moveCard(owner, orgId, second.ok ? second.data.id : "", "arriba");
    expect(await titles(owner, orgId)).toEqual(["momentos", "hoy"]);
    await removeCard(owner, orgId, second.ok ? second.data.id : "");
    expect(await titles(owner, orgId)).toEqual(["hoy"]);
  });

  it("WHEN las barras agrupan Ventas por etapa THE SYSTEM SHALL sumar el monto por etapa con su nombre", async () => {
    const { orgId, owner } = await setup();
    const [c] = await db.insert(client).values({ orgId, name: "Boda" }).returning();
    await db.insert(deal).values([
      { orgId, clientId: c!.id, title: "A", amountCents: 100_00, stage: "propuesta" },
      { orgId, clientId: c!.id, title: "B", amountCents: 250_00, stage: "propuesta" },
      { orgId, clientId: c!.id, title: "C", amountCents: 50_00, stage: "prospecto" },
    ]);
    await addCard(owner, orgId, { kind: "barras", config: { app: "ventas", by: "etapa" } });
    const cards = await listCards(owner, orgId);
    const r = await cardData(owner, orgId, cards.ok ? cards.data[0]! : (null as never));
    if (!r.ok || r.data.kind !== "barras") throw new Error("sin barras");
    const propuesta = r.data.bars.find((b) => b.count === 2);
    expect(propuesta).toMatchObject({ amountCents: 350_00 });
    expect(r.data.bars.find((b) => b.count === 1)).toMatchObject({ amountCents: 50_00 });
  });

  it("WHEN un número suma el monto de Ventas THE SYSTEM SHALL darlo en dinero", async () => {
    const { orgId, owner } = await setup();
    const [c] = await db.insert(client).values({ orgId, name: "Boda" }).returning();
    await db.insert(deal).values({ orgId, clientId: c!.id, title: "A", amountCents: 120_00 });
    await addCard(owner, orgId, { kind: "numero", config: { app: "ventas", op: "sumar" } });
    const cards = await listCards(owner, orgId);
    const r = await cardData(owner, orgId, cards.ok ? cards.data[0]! : (null as never));
    expect(r.ok ? r.data : null).toEqual({ kind: "numero", value: 120_00, format: "dinero" });
  });

  it("WHEN dueño y empleado abren su inicio sin tarjetas THE SYSTEM SHALL sembrar 5 y 3, y no volver a sembrar", async () => {
    const { orgId, owner } = await setup();
    const ana = await person(orgId, "employee", { clientes: "empresa" });
    await seedDefaultCards(owner, orgId);
    await seedDefaultCards(ana, orgId);
    expect(await titles(owner, orgId)).toEqual(["hoy", "alertas", "ingresos_meta", "embudo", "pronostico"]);
    expect(await titles(ana, orgId)).toEqual(["hoy", "momentos", "lista"]);
    await seedDefaultCards(owner, orgId);
    expect(await titles(owner, orgId)).toHaveLength(5);
  });

  it("WHEN un empleado pide una tarjeta solo del dueño THE SYSTEM SHALL rechazarla", async () => {
    const { orgId } = await setup();
    const ana = await person(orgId, "employee");
    const r = await addCard(ana, orgId, { kind: "pronostico", config: {} });
    expect(r.ok ? null : r.error.code).toBe("FORBIDDEN");
  });
});
