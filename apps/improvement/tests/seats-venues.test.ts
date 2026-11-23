// Mapas como datos (oficinas-digitales paso 41): generador por tipo, tope de lugares, mapa guardado y permisos.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile, venueMap, venueSeat } from "@jotapuntoce/db/schema";
import { generateLayout } from "@/server/seats/layouts.ts";
import { closeSession, createVenueMap, createVenueSession, listSessions, publishSession } from "@/server/seats/venues.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-recinto", slug: `t-recinto-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const ids = { owner: crypto.randomUUID(), sinButacas: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  await db.insert(membership).values([
    { userId: ids.owner, orgId: o.id, role: "owner", acceptedAt: new Date() },
    { userId: ids.sinButacas, orgId: o.id, role: "employee", acceptedAt: new Date() },
  ]);
  return { orgId: o.id, ...ids };
}

describe("generateLayout", () => {
  it("WHEN teatro 3x4 THE SYSTEM SHALL devolver 12 butacas de A1 a C4", () => {
    const r = generateLayout("teatro", { rows: 3, seatsPerRow: 4 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data).toHaveLength(12);
    expect(r.data[0]).toMatchObject({ label: "A1", kind: "butaca" });
    expect(r.data.at(-1)).toMatchObject({ label: "C4", kind: "butaca" });
  });

  it("WHEN lotes 2x3 THE SYSTEM SHALL devolver M1-L1 a M2-L3 con kind lote", () => {
    const r = generateLayout("lotes", { blocks: 2, lotsPerBlock: 3 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.map((s) => s.label)).toEqual(["M1-L1", "M1-L2", "M1-L3", "M2-L1", "M2-L2", "M2-L3"]);
    expect(new Set(r.data.map((s) => s.kind))).toEqual(new Set(["lote"]));
  });

  it("WHEN los parámetros darían más de 2000 lugares THE SYSTEM SHALL devolver VALIDATION_ERROR", () => {
    expect(generateLayout("bodas", { tables: 60, seatsPerTable: 40 })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});

describe("venues", () => {
  it("WHEN el dueño crea un mapa de bodas con 5 mesas THE SYSTEM SHALL guardar 5 venue_seat con capacity 10", async () => {
    const { orgId, owner } = await org();
    const r = await createVenueMap(owner, orgId, { name: "Jardín", kind: "bodas", params: { tables: 5 } });
    if (!r.ok) throw new Error(r.error.message);
    const seats = await db.select().from(venueSeat).where(eq(venueSeat.mapId, r.data.id));
    expect(seats.map((s) => s.capacity)).toEqual([10, 10, 10, 10, 10]);
  });

  it("WHEN un empleado sin butacas crea un mapa THE SYSTEM SHALL devolver NOT_FOUND sin escribir", async () => {
    const { orgId, sinButacas } = await org();
    expect(await createVenueMap(sinButacas, orgId, { name: "X", kind: "bodas", params: { tables: 5 } })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await db.select().from(venueMap).where(eq(venueMap.orgId, orgId))).toEqual([]);
  });

  it("WHEN el mapa pasaría de 2000 lugares THE SYSTEM SHALL devolver VALIDATION_ERROR sin escribir", async () => {
    const { orgId, owner } = await org();
    expect(await createVenueMap(owner, orgId, { name: "Gigante", kind: "eventos", params: { tables: 60, seatsPerTable: 50 } })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await db.select().from(venueMap).where(eq(venueMap.orgId, orgId))).toEqual([]);
  });

  it("WHEN se crea, publica y cierra una función THE SYSTEM SHALL recorrer borrador → a_la_venta → cerrada", async () => {
    const { orgId, owner } = await org();
    const map = await createVenueMap(owner, orgId, { name: "Sala", kind: "teatro", params: { rows: 2, seatsPerRow: 2 } });
    if (!map.ok) throw new Error(map.error.message);
    const s = await createVenueSession(owner, orgId, { mapId: map.data.id, title: "Estreno", startsAt: "2030-01-10T02:00:00Z", priceCents: 25000 });
    if (!s.ok) throw new Error(s.error.message);
    expect(await closeSession(owner, orgId, s.data.id)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await publishSession(owner, orgId, s.data.id)).toMatchObject({ ok: true, data: { status: "a_la_venta" } });
    expect(await closeSession(owner, orgId, s.data.id)).toMatchObject({ ok: true, data: { status: "cerrada" } });
    expect(await listSessions(owner, orgId)).toMatchObject({ ok: true, data: [{ title: "Estreno", mapName: "Sala", status: "cerrada" }] });
  });
});
