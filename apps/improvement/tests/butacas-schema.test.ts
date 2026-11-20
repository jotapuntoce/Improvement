// venue_map, venue_seat, venue_session y seat_booking: doble apartado, hold sin vencimiento, RLS por la
// sección `butacas` y la publicación Realtime, contra el Supabase de desarrollo (patrón asUser).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile, seatBooking, venueMap, venueSeat, venueSession } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function recinto() {
  const [o] = await db.insert(organization).values({ name: "t-butacas", slug: `t-butacas-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const orgId = o.id;
  const [taquilla] = await db.insert(permissionType).values({ orgId, name: "Taquilla", grants: { butacas: "empresa" } }).returning();
  const ids = { taquillero: crypto.randomUUID(), otro: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  await db.insert(membership).values([
    { userId: ids.taquillero, orgId, role: "employee", permissionTypeId: taquilla!.id, acceptedAt: new Date() },
    { userId: ids.otro, orgId, role: "employee", acceptedAt: new Date() },
  ]);
  const [map] = await db.insert(venueMap).values({ orgId, name: "Sala", kind: "teatro", layout: {} }).returning();
  const [seat] = await db.insert(venueSeat).values({ orgId, mapId: map!.id, label: "A1", x: 0, y: 0, kind: "butaca" }).returning();
  const [session] = await db
    .insert(venueSession)
    .values({ orgId, mapId: map!.id, title: "Función", startsAt: new Date("2030-01-10T02:00:00Z"), priceCents: 25000 })
    .returning();
  return { orgId, ...ids, seatId: seat!.id, sessionId: session!.id };
}

async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

const vendida = (r: { orgId: string; sessionId: string; seatId: string }) => ({
  orgId: r.orgId,
  sessionId: r.sessionId,
  seatId: r.seatId,
  status: "sold" as const,
  priceCents: 25000,
  channel: "taquilla" as const,
});

describe("Butacas — checks", () => {
  it("WHEN se insertan dos seat_booking para la misma función y lugar THE SYSTEM SHALL rechazar la segunda", async () => {
    const r = await recinto();
    await db.insert(seatBooking).values(vendida(r));
    await expect(db.insert(seatBooking).values(vendida(r))).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("WHEN se inserta un seat_booking held sin hold_expires_at THE SYSTEM SHALL rechazarlo", async () => {
    const r = await recinto();
    await expect(db.insert(seatBooking).values({ ...vendida(r), status: "held", holdToken: crypto.randomUUID() })).rejects.toMatchObject({
      cause: { code: "23514" },
    });
  });
});

describe("Butacas — RLS y Realtime", () => {
  it("WHEN consulta un empleado con butacas = empresa THE SYSTEM SHALL ver los apartados de su org; sin el permiso, 0 filas", async () => {
    const r = await recinto();
    await db.insert(seatBooking).values(vendida(r));
    const q = `select id from seat_booking where org_id = '${r.orgId}'`;
    expect(await asUser(r.taquillero, q)).toHaveLength(1);
    expect(await asUser(r.otro, q)).toHaveLength(0);
  });

  it("WHEN se consulta pg_publication_tables THE SYSTEM SHALL listar seat_booking en supabase_realtime", async () => {
    const rows = await db.execute(sql`select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seat_booking'`);
    expect(rows).toHaveLength(1);
  });
});
